import { Resend } from "resend";
import { sign } from "./crypto";
import { appUrl } from "./url";
import type { Account } from "./db";
import { letterText, type Letter } from "./newsletter";
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
    const batch = to.slice(i, i + 100).map((email) => {
      const unsub = test ? undefined : unsubscribeUrl(a.id, email);
      return {
        from: FROM(),
        to: email,
        // Same subject as the real thing: "[TEST]" subjects get filtered; the test note sits in the body instead.
        subject: letter.subject,
        html: renderEmail(letter, brand(a), unsub, test),
        text: `${test ? "Testutskick: bara du ser det här.\n\n" : ""}${letterText(letter)}${unsub ? `\n\nAvsluta prenumerationen: ${unsub}` : ""}`,
        // One-click unsubscribe headers: Gmail/Workspace expect them from bulk senders.
        headers: unsub ? { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
      };
    });
    const { data, error } = await resend().batch.send(batch);
    if (!error) console.log(`resend ${test ? "test" : "send"} ok`, JSON.stringify({ account: a.login, to: batch.map((b) => b.to), ids: data?.data?.map((d) => d.id) }));
    else console.error("resend error", a.login, error.message);
    if (error) {
      // Resend's test sender (onboarding@resend.dev) may only mail the Resend account owner.
      if (/testing email|own email address|verify a domain/i.test(error.message))
        throw new Error("Email isn’t set up for real sending yet: verify your domain in Resend and set EMAIL_FROM to an address on it. Until then Resend only delivers to the email that owns the Resend account.");
      throw new Error(`Resend: ${error.message}`);
    }
    sent += batch.length;
  }
  return sent;
}
