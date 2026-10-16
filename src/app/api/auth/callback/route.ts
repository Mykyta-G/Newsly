import { cookies } from "next/headers";
import { safeEqual } from "@/lib/crypto";
import { createAccount, getAccount, updateAccount } from "@/lib/db";
import { appUrl, exchangeCode, githubUser, tokenFields } from "@/lib/github";
import { PROFILES } from "@/lib/prompts";
import { startSession } from "@/lib/session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const store = await cookies();
  const expected = store.get("newsly_oauth_state")?.value ?? "";
  store.delete("newsly_oauth_state");
  if (!code || !expected || !safeEqual(state, expected)) return Response.redirect(`${appUrl()}/dashboard`);

  const token = await exchangeCode(code);
  const user = await githubUser(token.access_token!);
  const id = String(user.id);

  if (!(await getAccount(id))) {
    await createAccount({
      id, login: user.login, email: user.email,
      tokenEnc: null, refreshEnc: null, tokenExpiresAt: null,
      profileKey: "custom", companyName: user.name ?? user.login, profileText: "", brandColor: PROFILES["simple-schedules"].brandColor,
      source: "github", repos: [], manualNotes: "", subscribers: [],
      requireApproval: true, approvedOnce: false, draft: null, lastLetter: null, createdAt: new Date().toISOString(),
    });
  }
  await updateAccount(id, (a) => void Object.assign(a, { login: user.login, email: a.email || user.email, ...tokenFields(token) }));
  await startSession(id);
  // Next: the frontend shows GET /api/repos and the customer picks; PATCH /api/me { repos } starts the first letter.
  return Response.redirect(`${appUrl()}/dashboard`);
}
