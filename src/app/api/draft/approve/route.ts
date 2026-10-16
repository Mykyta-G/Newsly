import { updateAccount } from "@/lib/db";
import { archiveSent } from "@/lib/drafts";
import { sendLetter } from "@/lib/email";
import { currentAccount } from "@/lib/session";

/** The customer approves → send to all subscribers. A draft that failed review twice needs an explicit override. */
export async function POST(request: Request) {
  const a = await currentAccount();
  if (!a) return Response.json({ error: "Not logged in" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const createdAt = body.id ?? body.createdAt; // the UI may send the letter id; for drafts id = createdAt
  const override = body.override;
  const draft = a.draft;
  if (!draft) return Response.json({ error: "No draft" }, { status: 400 });
  if (createdAt !== draft.createdAt) return Response.json({ error: "The draft has changed, reload the page." }, { status: 409 });
  if (a.requireApproval && !draft.testSentAt) return Response.json({ error: "Send yourself a test email first, look it over, then approve." }, { status: 400 });
  if (draft.status === "manuell" && override !== true)
    return Response.json({ error: "This letter failed the check. Read it, then approve it yourself." }, { status: 400 });
  if (a.subscribers.length === 0) return Response.json({ error: "No subscribers yet." }, { status: 400 });
  // Claim the draft first so a double click can't send it twice.
  let claimed = false;
  await updateAccount(a.id, (x) => {
    if (x.draft?.createdAt === createdAt) { claimed = true; x.draft = null; }
  });
  if (!claimed) return Response.json({ error: "This letter is already being sent." }, { status: 409 });
  try {
    const sent = await sendLetter(a, draft.letter, a.subscribers);
    await archiveSent(a, draft, sent);
    return Response.json({ ok: true, sent });
  } catch (e) {
    await updateAccount(a.id, (x) => void (x.draft ??= draft)); // put it back so they can retry
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
