import { safeEqual } from "@/lib/crypto";
import { listAccounts, updateAccount } from "@/lib/db";
import { archiveSent, draftAndTest, lastWeek, makeDraft } from "@/lib/drafts";
import { sendLetter } from "@/lib/email";

export const maxDuration = 300;

/**
 * Weekly job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). Everyone gets a fresh draft for last week,
 * mailed to them as a test. It only goes to subscribers automatically if the customer has turned approval off
 * (possible after their first approved send) AND the draft passed review. Everything else waits for approval.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || !safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`))
    return Response.json({ error: "unauthorized" }, { status: 401 });

  const { from, to } = lastWeek();
  const results: Record<string, string> = {};
  for (const a of await listAccounts()) {
    if (a.source === "github" ? a.repos.length === 0 : !a.manualNotes.trim()) continue;
    try {
      const auto = !a.requireApproval && a.approvedOnce && a.subscribers.length > 0;
      if (!auto) {
        results[a.login] = `utkast + testmejl (${(await draftAndTest(a, from, to)).status})`;
        continue;
      }
      const draft = await makeDraft(a, from, to);
      if (draft.status !== "godkänd") {
        if (a.email) await sendLetter(a, draft.letter, [a.email], true);
        await updateAccount(a.id, (x) => void (x.draft && (x.draft.testSentAt = new Date().toISOString())));
        results[a.login] = "utkast väntar på manuell granskning";
        continue;
      }
      const sent = await sendLetter(a, draft.letter, a.subscribers);
      await archiveSent(a, draft, sent);
      results[a.login] = `skickat till ${sent}`;
    } catch (e) {
      results[a.login] = `fel: ${(e as Error).message}`;
    }
  }
  return Response.json({ from, to, results });
}
