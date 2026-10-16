import { updateAccount } from "@/lib/db";
import { sendLetter } from "@/lib/email";
import { currentAccount } from "@/lib/session";

/** Re-send the current draft to the customer's own address only. */
export async function POST() {
  const a = await currentAccount();
  if (!a) return Response.json({ error: "Inte inloggad" }, { status: 401 });
  if (!a.draft) return Response.json({ error: "Inget utkast" }, { status: 400 });
  if (!a.email) return Response.json({ error: "Fyll i din e-post för testmejl först." }, { status: 400 });
  try {
    await sendLetter(a, a.draft.letter, [a.email], true);
    await updateAccount(a.id, (x) => void (x.draft && (x.draft.testSentAt = new Date().toISOString())));
    return Response.json({ ok: true, to: a.email });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
