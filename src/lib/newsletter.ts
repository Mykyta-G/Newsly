import OpenAI from "openai";
import { z } from "zod";
import { ANVANDARMEDDELANDE, GRANSKARPROMPT, RATTA_INSTRUKTION, SYSTEMPROMPT, fill } from "./prompts";

const openai = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = () => process.env.OPENAI_MODEL || "gpt-6-luna";

export const Letter = z.object({
  subject: z.string(),
  preheader: z.string(),
  greeting: z.string(),
  intro: z.string(),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })).min(1),
  closing: z.string(),
  signature: z.string(),
});
export type Letter = z.infer<typeof Letter>;

const Problem = z.object({ typ: z.string(), citat: z.string().default(""), åtgärd: z.string().default("") });
export type Problem = z.infer<typeof Problem>;
const Review = z.object({ godkänd: z.boolean(), problem: z.array(Problem).default([]) });

type Msg = { role: "system" | "user" | "assistant"; content: string };

async function gptJson<T>(schema: z.ZodType<T>, instructions: string, input: Msg[]): Promise<T> {
  const res = await openai().responses.create({
    model: MODEL(),
    // As a system message, not `instructions`: json_object mode wants the word "JSON" inside the input itself.
    input: [{ role: "system", content: instructions }, ...input],
    text: { format: { type: "json_object" } },
  });
  return schema.parse(JSON.parse(res.output_text));
}

/** Customer text can't close the <underlag> tag and smuggle instructions outside it. */
const asData = (s: string) => s.replace(/<\/?\s*underlag\s*>/gi, "");

const BANNED = ["commit", "merge", "branch", "deploy", "release", "version", "migration", "databas", "API", "cache", "backend",
  "frontend", "cron", "bugg", "endpoint", "token", "repo", "flagga", "algoritm", "parser", "query", "UPF", "NOVA", "score"];
const HYPE = ["revolutionerande", "banbrytande", "unik"];

export const letterText = (l: Letter) =>
  [l.greeting, l.intro, ...l.sections.flatMap((s) => [s.heading, s.body]), l.closing, l.signature].join("\n\n");

/** The reviewer's mechanical checks, done in code too so they can't slip past a lenient model. */
export function codeChecks(l: Letter, extraBanned: string[] = []): Problem[] {
  const text = [l.subject, l.preheader, letterText(l)].join("\n");
  const out: Problem[] = [];
  for (const w of new Set([...BANNED, ...extraBanned])) {
    // word + up to 4 letters of Swedish inflection (buggar, versionen, repot)
    const m = text.match(new RegExp(`(?<![\\p{L}])${w}[\\p{L}]{0,4}(?![\\p{L}])`, "iu"));
    if (m) out.push({ typ: "tekniskt", citat: m[0], åtgärd: `Byt ut "${m[0]}" mot vanliga ord.` });
  }
  for (const w of HYPE) {
    const m = text.match(new RegExp(`(?<![\\p{L}])${w}[\\p{L}]*`, "iu"));
    if (m) out.push({ typ: "överdrift", citat: m[0], åtgärd: "Ta bort överdriften." });
  }
  const words = letterText(l).split(/\s+/).filter(Boolean).length;
  if (words > 350) out.push({ typ: "längd", citat: `${words} ord`, åtgärd: "Korta till högst 350 ord." });
  if ((text.match(/!/g) ?? []).length > 1) out.push({ typ: "form", citat: "!", åtgärd: "Högst ett utropstecken i hela brevet." });
  const emoji = text.match(/\p{Extended_Pictographic}/u);
  if (emoji) out.push({ typ: "form", citat: emoji[0], åtgärd: "Inga emojis." });
  if (l.subject.length > 55) out.push({ typ: "form", citat: l.subject, åtgärd: "Ämnesraden ska vara högst 55 tecken." });
  if (l.preheader.length > 90) out.push({ typ: "form", citat: l.preheader, åtgärd: "Preheadern ska vara högst 90 tecken." });
  if (l.sections.length < 3 || l.sections.length > 6)
    out.push({ typ: "form", citat: `${l.sections.length} sektioner`, åtgärd: "3 till 6 sektioner." });
  return out;
}

async function review(letter: Letter, underlag: string, extraBanned: string[]): Promise<Problem[]> {
  const prompt = fill(GRANSKARPROMPT, { brev_json: JSON.stringify(letter, null, 2), underlag: asData(underlag) });
  const r = await gptJson(Review, prompt, [{ role: "user", content: "Granska brevet." }]);
  const problems = [...(r.godkänd ? [] : r.problem), ...codeChecks(letter, extraBanned)];
  // A model that says "not approved" but lists nothing still counts as a failed round.
  return !r.godkänd && problems.length === 0 ? [{ typ: "form", citat: "", åtgärd: "Granskaren underkände utan förklaring." }] : problems;
}

export type Result = { letter: Letter; status: "godkänd" | "manuell"; problems: Problem[] };

/**
 * Write → review → (fix only the listed problems → review again). Two failed reviews = manual review, never sent.
 */
export async function writeLetter(opts: {
  profileText: string;
  extraBanned?: string[];
  underlag: string;
  from: string;
  to: string;
  previous: Letter | null;
}): Promise<Result> {
  if (!opts.underlag.trim()) throw new Error("Det finns inget underlag för perioden, så det blir inget brev.");
  const system = fill(SYSTEMPROMPT, { kundprofil: opts.profileText });
  const messages: Msg[] = [
    {
      role: "user",
      content: fill(ANVANDARMEDDELANDE, {
        från_datum: opts.from,
        till_datum: opts.to,
        föregående_brev_eller_tomt: opts.previous ? letterText(opts.previous) : "",
        underlag: asData(opts.underlag),
      }),
    },
  ];

  let letter = await gptJson(Letter, system, messages);
  for (let round = 1; ; round++) {
    const problems = await review(letter, opts.underlag, opts.extraBanned ?? []);
    if (problems.length === 0) return { letter, status: "godkänd", problems };
    if (round === 2) return { letter, status: "manuell", problems };
    messages.push(
      { role: "assistant", content: JSON.stringify(letter) },
      { role: "user", content: `${RATTA_INSTRUKTION}\n\n${JSON.stringify(problems, null, 2)}` },
    );
    letter = await gptJson(Letter, system, messages);
  }
}
