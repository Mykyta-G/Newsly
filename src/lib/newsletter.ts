import Anthropic from "@anthropic-ai/sdk";
import type { Activity } from "./github";

const anthropic = () => new Anthropic();

export type Newsletter = { subject: string; html: string };

const SYSTEM = `You write short product-update newsletters for an app's customers.
You get raw GitHub activity (commits, merged PRs, releases). Turn it into what customers care about:
new features, fixes they'll notice, improvements. Skip internal chores (refactors, CI, deps) unless they matter to users.
Plain, friendly language, no jargon. Reply with JSON only: {"subject": string, "html": string}.
The html is the email body: simple inline-styled HTML, headings + short bullet lists.`;

export async function writeNewsletter(activity: Activity, productName = "our app"): Promise<Newsletter> {
  const msg = await anthropic().messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 4000,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Product: ${productName}\nActivity since ${activity.since}:\n${JSON.stringify(activity, null, 2)}`,
      },
    ],
  });

  const text = msg.content.find((b) => b.type === "text")?.text ?? "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json) as Newsletter;
}
