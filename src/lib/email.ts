import { Resend } from "resend";
import type { Newsletter } from "./newsletter";

const resend = () => new Resend(process.env.RESEND_API_KEY);

export async function sendNewsletter(newsletter: Newsletter, to: string[]) {
  if (to.length === 0) return { sent: 0 };
  // Resend batch: one email per subscriber so addresses aren't exposed to each other
  const { error } = await resend().batch.send(
    to.map((email) => ({
      from: process.env.EMAIL_FROM ?? "Newsly <onboarding@resend.dev>",
      to: email,
      subject: newsletter.subject,
      html: newsletter.html,
    })),
  );
  if (error) throw new Error(error.message);
  return { sent: to.length };
}
