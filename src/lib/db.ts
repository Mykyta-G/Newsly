import { del, get, list, put } from "@vercel/blob";
import { promises as fs } from "fs";
import path from "path";
import type { ProfileKey } from "./prompts";
import type { Letter, Problem } from "./newsletter";

// Storage: one private JSON blob per record in Vercel Blob (BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN set),
// or one JSON file per record under data/kv/ locally. Tokens inside are encrypted before they get here.

export type Draft = {
  from: string;
  to: string;
  underlag: string;
  letter: Letter;
  html: string;
  status: "godkänd" | "manuell"; // manuell = failed review twice, needs a human
  problems: Problem[];
  createdAt: string;
  testSentAt?: string;
};

export type Account = {
  id: string; // GitHub user id
  login: string;
  tokenEnc: string | null;
  refreshEnc: string | null;
  tokenExpiresAt: string | null;
  email: string; // where test emails go
  profileKey: ProfileKey;
  companyName: string;
  profileText: string;
  brandColor: string;
  source: "github" | "manual";
  repos: string[]; // owner/name the customer picked
  manualNotes: string;
  subscribers: string[];
  requireApproval: boolean; // always true until the first approved send
  approvedOnce: boolean;
  draft: Draft | null;
  lastLetter: Letter | null;
  /** Background letter writing: lets the UI show "writing…" or the error instead of waiting forever. */
  job?: { state: "running" | "failed"; error?: string; at: string } | null;
  createdAt: string;
};

type Session = { accountId: string; expires: string };

const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const DIR = path.join(process.cwd(), "data", "kv");
const file = (key: string) => path.join(DIR, `${key}.json`);

async function kvGet<T>(key: string): Promise<T | null> {
  if (!blobEnabled()) {
    try {
      return JSON.parse(await fs.readFile(file(key), "utf8"));
    } catch {
      return null;
    }
  }
  const r = await get(`${key}.json`, { access: "private", useCache: false });
  if (!r?.stream) return null;
  return JSON.parse(await new Response(r.stream).text());
}

async function kvPut(key: string, value: unknown) {
  const body = JSON.stringify(value, null, 2);
  if (!blobEnabled()) {
    await fs.mkdir(path.dirname(file(key)), { recursive: true });
    await fs.writeFile(file(key), body, { mode: 0o600 });
    return;
  }
  await put(`${key}.json`, body, {
    access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60,
  });
}

async function kvDel(key: string) {
  if (!blobEnabled()) return fs.rm(file(key), { force: true });
  await del(`${key}.json`).catch(() => {});
}

async function kvKeys(prefix: string): Promise<string[]> {
  if (!blobEnabled()) {
    const names = await fs.readdir(path.join(DIR, prefix)).catch(() => [] as string[]);
    return names.filter((n) => n.endsWith(".json")).map((n) => `${prefix}/${n.slice(0, -5)}`);
  }
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `${prefix}/`, cursor });
    keys.push(...page.blobs.map((b) => b.pathname.slice(0, -5)));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

// Serialise read-modify-write per record inside one server instance.
const locks = new Map<string, Promise<unknown>>();
function locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (locks.get(key) ?? Promise.resolve()).then(fn);
  locks.set(key, run.catch(() => {}));
  return run;
}

const acc = (id: string) => `accounts/${id}`;

export const getAccount = (id: string) => kvGet<Account>(acc(id));
export const createAccount = (a: Account) => locked(acc(a.id), () => kvPut(acc(a.id), a));
export const deleteAccount = (id: string) => locked(acc(id), () => kvDel(acc(id)));

/** Change an account in place; returns the saved version. */
export function updateAccount(id: string, fn: (a: Account) => void): Promise<Account> {
  return locked(acc(id), async () => {
    const a = await kvGet<Account>(acc(id));
    if (!a) throw new Error("Kontot finns inte");
    fn(a);
    await kvPut(acc(id), a);
    return a;
  });
}

export async function listAccounts(): Promise<Account[]> {
  const keys = await kvKeys("accounts");
  return (await Promise.all(keys.map((k) => kvGet<Account>(k)))).filter((a): a is Account => a !== null);
}

export const getSession = (id: string) => kvGet<Session>(`sessions/${id}`);
export const putSession = (id: string, s: Session) => kvPut(`sessions/${id}`, s);
export const deleteSession = (id: string) => kvDel(`sessions/${id}`);
