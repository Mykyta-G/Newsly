import OpenAI from "openai";
import { z } from "zod";
import type { Activity } from "./github";

const openai = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const Newsletter = z.object({ subject: z.string(), html: z.string() });
export type Newsletter = z.infer<typeof Newsletter>;

const SYSTEM = `You write short product-update newsletters for an app's customers.
You get raw GitHub activity (commits, merged PRs, releases). Turn it into what customers care about:
new features, fixes they'll notice, improvements. Skip internal chores (refactors, CI, deps) unless they matter to users.
Plain, friendly language, no jargon. Reply with JSON only: {"subject": string, "html": string}.
The html is the email body: simple inline-styled HTML, headings + short bullet lists.`;

export async function writeNewsletter(activity: Activity, productName = "our app"): Promise<Newsletter> {
  const res = await openai().chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Product: ${productName}\nActivity since ${activity.since}:\n${JSON.stringify(activity, null, 2)}`,
      },
    ],
  });

  return Newsletter.parse(JSON.parse(res.choices[0].message.content ?? "{}"));
}
