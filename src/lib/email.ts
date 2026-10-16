import { Resend } from "resend";
import { sign } from "./crypto";
import { appUrl } from "./github";
import type { Account } from "./db";
import type { Letter } from "./newsletter";
import { renderEmail } from "./template";

const resend = () => new Resend(process.env.RESEND_API_KEY);
const FROM = () => process.env.EMAIL_FROM ?? "Newsly <onboarding@resend.dev>";

export const unsubscribeUrl = (accountId: string, email: string) =>
  `${appUrl()}/api/unsubscribe?${new URLSearchParams({ a: accountId, e: email, s: sign(`${accountId}:${email}`) })}`;

const brand = (a: Account) => ({ companyName: a.companyName, color: a.brandColor });

/** One email per recipient, each with its own unsubscribe link; nobody sees the others' addresses. */
export async function sendLetter(a: Account, letter: Letter, to: string[], test = false) {
  let sent = 0;
  for (let i = 0; i < to.length; i += 100) {
    const batch = to.slice(i, i + 100).map((email) => ({
      from: FROM(),
      to: email,
      subject: test ? `[TEST] ${letter.subject}` : letter.subject,
      html: renderEmail(letter, brand(a), test ? undefined : unsubscribeUrl(a.id, email)),
    }));
    const { error } = await resend().batch.send(batch);
    if (error) throw new Error(`Resend: ${error.message}`);
    sent += batch.length;
  }
  return sent;
}
