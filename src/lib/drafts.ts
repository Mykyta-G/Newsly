import { saveSentLetter, updateAccount, type Account, type Draft } from "./db";
import { sendLetter } from "./email";
import { commitUnderlag, userToken } from "./github";
import { writeLetter } from "./newsletter";
import { PROFILES } from "./prompts";
import { renderEmail } from "./template";

export { lastSevenDays, lastWeek } from "./dates";

/** Used until the customer writes their own profile, so the flow works with zero setup. */
export const defaultProfile = (companyName: string) => `Företag: ${companyName}.
Läsare: kunderna som använder ${companyName}. De är inte tekniker och har ont om tid.
Ton: varm, rak och kort. Använd "du".
Avsändare: "Teamet på ${companyName}".
Källa för innehållet: veckans ändringar, i råtext (se underlaget).

Särskilda regler:
- Varje sektion ska svara på en fråga: vad blir bättre för dig, och var märker du det? Aldrig hur det byggdes.
- Hellre tre korta sektioner än sex långa. Inget fyllnadsprat.`;

export const profileFor = (a: Account) => a.profileText.trim() || defaultProfile(a.companyName);

export async function gatherUnderlag(a: Account, from: string, to: string) {
  if (a.source === "manual") return a.manualNotes.trim();
  if (a.repos.length === 0) throw new Error("Pick at least one repo first.");
  return commitUnderlag(await userToken(a), a.repos, from, to);
}

export async function makeDraft(a: Account, from: string, to: string): Promise<Draft> {
  const underlag = await gatherUnderlag(a, from, to);
  const extraBanned = a.profileKey === "custom" ? [] : PROFILES[a.profileKey].extraBanned;
  const { letter, status, problems } = await writeLetter({ profileText: profileFor(a), extraBanned, underlag, from, to, previous: a.lastLetter });
  const draft: Draft = {
    from, to, underlag, letter, status, problems,
    html: renderEmail(letter, { companyName: a.companyName, color: a.brandColor }),
    createdAt: new Date().toISOString(),
  };
  await updateAccount(a.id, (x) => void (x.draft = draft));
  return draft;
}

/**
 * Write a draft, tracked in `account.job` so the UI can show "writing…" or the error.
 * With `test` (first letter, weekly job) it's also emailed to the customer; the UI's "New letter" leaves that to them.
 */
export async function draftAndTest(a: Account, from: string, to: string, test = true): Promise<Draft> {
  await updateAccount(a.id, (x) => void (x.job = { state: "running", at: new Date().toISOString() }));
  try {
    const d = test ? await draftAndTestInner(a, from, to) : await makeDraft(a, from, to);
    await updateAccount(a.id, (x) => void (x.job = null));
    return d;
  } catch (e) {
    await updateAccount(a.id, (x) => void (x.job = { state: "failed", error: (e as Error).message, at: new Date().toISOString() }));
    throw e;
  }
}

async function draftAndTestInner(a: Account, from: string, to: string): Promise<Draft> {
  const draft = await makeDraft(a, from, to);
  if (!a.email) return draft;
  await sendLetter(a, draft.letter, [a.email], true);
  const testSentAt = new Date().toISOString();
  await updateAccount(a.id, (x) => void (x.draft && x.draft.createdAt === draft.createdAt && (x.draft.testSentAt = testSentAt)));
  return { ...draft, testSentAt };
}

/** After a successful send: move the draft into history and remember it as "last letter". */
export async function archiveSent(a: Account, draft: Draft, recipients: number) {
  const { testSentAt, status, ...rest } = draft;
  void testSentAt; void status;
  await saveSentLetter(a.id, { ...rest, status: "sent", sentAt: new Date().toISOString(), recipients });
  await updateAccount(a.id, (x) => {
    x.lastLetter = draft.letter;
    x.approvedOnce = true;
    if (x.draft?.createdAt === draft.createdAt) x.draft = null;
  });
}
