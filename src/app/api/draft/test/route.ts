import { updateAccount } from "@/lib/db";
import { sendLetter } from "@/lib/email";
import { currentAccount } from "@/lib/session";

/** Re-send the current draft to the customer's own address only. */
export async function POST() {
  const a = await currentAccount();
  if (!a) return Response.json({ error: "Not logged in" }, { status: 401 });
  if (!a.draft) return Response.json({ error: "No draft" }, { status: 400 });
  if (!a.email) return Response.json({ error: "Add your email for test letters in Settings first." }, { status: 400 });
  try {
    await sendLetter(a, a.draft.letter, [a.email], true);
    await updateAccount(a.id, (x) => void (x.draft && (x.draft.testSentAt = new Date().toISOString())));
    return Response.json({ ok: true, to: a.email });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
