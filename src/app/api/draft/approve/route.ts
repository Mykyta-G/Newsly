import { updateAccount } from "@/lib/db";
import { sendLetter } from "@/lib/email";
import { currentAccount } from "@/lib/session";

/** The customer approves → send to all subscribers. A draft that failed review twice needs an explicit override. */
export async function POST(request: Request) {
  const a = await currentAccount();
  if (!a) return Response.json({ error: "Inte inloggad" }, { status: 401 });
  const { createdAt, override } = await request.json().catch(() => ({}));
  const draft = a.draft;
  if (!draft) return Response.json({ error: "Inget utkast" }, { status: 400 });
  if (createdAt !== draft.createdAt) return Response.json({ error: "Utkastet har ändrats, ladda om sidan." }, { status: 409 });
  if (!draft.testSentAt) return Response.json({ error: "Skicka ett testmejl till dig själv först." }, { status: 400 });
  if (draft.status === "manuell" && override !== true)
    return Response.json({ error: "Brevet klarade inte granskningen. Läs det och bekräfta manuellt." }, { status: 400 });
  if (a.subscribers.length === 0) return Response.json({ error: "Inga mottagare ännu." }, { status: 400 });
  // Claim the draft first so a double click can't send it twice.
  let claimed = false;
  await updateAccount(a.id, (x) => {
    if (x.draft?.createdAt === createdAt) { claimed = true; x.draft = null; }
  });
  if (!claimed) return Response.json({ error: "Brevet håller redan på att skickas." }, { status: 409 });
  try {
    const sent = await sendLetter(a, draft.letter, a.subscribers);
    await updateAccount(a.id, (x) => Object.assign(x, { lastLetter: draft.letter, approvedOnce: true }));
    return Response.json({ ok: true, sent });
  } catch (e) {
    await updateAccount(a.id, (x) => void (x.draft ??= draft)); // put it back so they can retry
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
