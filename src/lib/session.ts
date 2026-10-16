import { cookies } from "next/headers";
import { randomId } from "./crypto";
import { deleteSession, getAccount, getSession, putSession, type Account } from "./db";

const COOKIE = "newsly_session";
const DAYS = 30;

export async function startSession(accountId: string) {
  const id = randomId();
  const expires = new Date(Date.now() + DAYS * 864e5);
  await putSession(id, { accountId, expires: expires.toISOString() });
  (await cookies()).set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires });
}

export async function endSession() {
  const store = await cookies();
  const id = store.get(COOKIE)?.value;
  if (id) await deleteSession(id);
  store.delete(COOKIE);
}

export async function currentAccount(): Promise<Account | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id || !/^[\w-]+$/.test(id)) return null;
  const s = await getSession(id);
  if (!s || s.expires < new Date().toISOString()) return null;
  return getAccount(s.accountId); // null once the account is deleted, so old sessions die with it
}

/** What the browser is allowed to see: never tokens. */
export function publicAccount(a: Account) {
  const { tokenEnc, refreshEnc, tokenExpiresAt, ...rest } = a;
  void tokenEnc; void refreshEnc; void tokenExpiresAt;
  return { ...rest, githubConnected: Boolean(a.tokenEnc) };
}
