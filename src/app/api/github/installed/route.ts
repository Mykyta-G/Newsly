import { after } from "next/server";
import { updateAccount } from "@/lib/db";
import { draftAndTest, lastSevenDays } from "@/lib/drafts";
import { appUrl, grantedRepos, userToken } from "@/lib/github";
import { currentAccount } from "@/lib/session";

export const maxDuration = 300;

/**
 * GitHub sends the customer here after they pick repos (the app's "Setup URL").
 * Tracks exactly the repos they picked, and if this is their first time, writes the first letter
 * and emails it to them as a test, in the background.
 */
export async function GET() {
  const a = await currentAccount();
  if (!a) return Response.redirect(`${appUrl()}/api/auth/login`);
  const repos = await grantedRepos(await userToken(a)).catch(() => [] as string[]);
  const updated = await updateAccount(a.id, (x) => void (x.repos = repos));
  if (repos.length && !updated.draft && !updated.lastLetter) {
    const { from, to } = lastSevenDays();
    after(() => draftAndTest(updated, from, to).catch(console.error));
  }
  return Response.redirect(`${appUrl()}/dashboard`);
}
