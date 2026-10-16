import { listSentLetters, type Account, type Draft, type SentLetter } from "@/lib/db";
import { currentAccount } from "@/lib/session";

// Shaped for the frontend's letter list: newest first, the unsent draft (if any) on top.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const d = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00Z`);

function isoWeek(s: string) {
  const t = d(s);
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - jan4.getTime()) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}

/** "12–18 Oct 2026", "28 Sep–4 Oct 2026" */
function period(from: string, to: string) {
  const a = d(from), b = d(to);
  const left = a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}` : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]}`;
  return `${left}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}

/** "12 Oct, 08:00" (Stockholm time) */
const sentAtLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Stockholm" })
    .format(new Date(iso)).replace(/ at |, /, ", ");

/** "2026-10-13|Combine time picker…" → "Mon 13 Oct — Combine time picker…"; typed bullet points pass through. */
const sourceLines = (underlag: string) =>
  underlag.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(\d{4}-\d{2}-\d{2})\|(.*)$/);
    if (!m) return l.replace(/^[-*•]\s*/, "");
    const t = d(m[1]);
    return `${DAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} — ${m[2]}`;
  });

function shape(a: Account, l: Draft | SentLetter) {
  const sent = l.status === "sent";
  return {
    id: l.createdAt,
    title: `${a.companyName} Newsletter W.${isoWeek(l.to)}`,
    period: period(l.from, l.to),
    from: l.from,
    to: l.to,
    status: sent ? "sent" : l.status === "godkänd" ? "approved" : "needs_review", // approved = passed the check, waiting to be sent
    sentAt: sent ? sentAtLabel((l as SentLetter).sentAt) : undefined,
    recipients: sent ? (l as SentLetter).recipients : a.subscribers.length,
    testSentAt: sent ? undefined : (l as Draft).testSentAt ?? null,
    problems: l.problems,
    letter: l.letter,
    html: l.html,
    source: sourceLines(l.underlag),
  };
}

export async function GET() {
  const a = await currentAccount();
  if (!a) return Response.json({ error: "Inte inloggad" }, { status: 401 });
  const sent = await listSentLetters(a.id);
  return Response.json([...(a.draft ? [shape(a, a.draft)] : []), ...sent.map((l) => shape(a, l))]);
}
