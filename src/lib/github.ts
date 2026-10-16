import { Octokit } from "octokit";
import { decrypt, encrypt } from "./crypto";
import { updateAccount, type Account } from "./db";

// Login + repo access through a classic GitHub OAuth App. GitHub has no read-only scope for private repos, so the
// token gets `repo` (read AND write). Newsly itself only ever makes GET calls for commit messages and dates,
// and only for the repos the customer picks in Newsly.
const SCOPES = "repo read:user user:email";

const CLIENT_ID = () => process.env.GITHUB_CLIENT_ID ?? "";
const CLIENT_SECRET = () => process.env.GITHUB_CLIENT_SECRET ?? "";
import { appUrl } from "./url";
export { appUrl };

export const authorizeUrl = (state: string) =>
  `https://github.com/login/oauth/authorize?${new URLSearchParams({
    client_id: CLIENT_ID(),
    redirect_uri: `${appUrl()}/api/auth/callback`,
    scope: SCOPES,
    state,
  })}`;

/** GitHub's page where the customer can see or revoke Newsly's access. */
export const accessSettingsUrl = () => `https://github.com/settings/connections/applications/${CLIENT_ID()}`;

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID(), client_secret: CLIENT_SECRET(), ...params }),
  });
  const t = (await res.json()) as TokenResponse;
  if (!t.access_token) throw new Error(t.error_description ?? t.error ?? "GitHub token exchange failed");
  return t;
}

export const exchangeCode = (code: string) => tokenRequest({ code, redirect_uri: `${appUrl()}/api/auth/callback` });

export function tokenFields(t: TokenResponse) {
  return {
    tokenEnc: encrypt(t.access_token!),
    refreshEnc: t.refresh_token ? encrypt(t.refresh_token) : null,
    tokenExpiresAt: t.expires_in ? new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString() : null,
  };
}

/** The customer's GitHub token, refreshed if it has expired. Server-side only. */
export async function userToken(a: Account): Promise<string> {
  if (!a.tokenEnc) throw new Error("GitHub is not connected");
  if (!a.tokenExpiresAt || a.tokenExpiresAt > new Date().toISOString() || !a.refreshEnc) return decrypt(a.tokenEnc);
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(a.refreshEnc) });
  const fields = tokenFields(t);
  await updateAccount(a.id, (x) => void Object.assign(x, fields));
  return t.access_token!;
}

export async function githubUser(token: string) {
  const gh = new Octokit({ auth: token });
  const { data } = await gh.rest.users.getAuthenticated();
  // Primary verified email (the user:email scope) so test mails need no setup.
  const emails = await gh.rest.users.listEmailsForAuthenticatedUser().then((r) => r.data).catch(() => []);
  const email = emails.find((e) => e.primary && e.verified)?.email ?? data.email ?? "";
  return { ...data, email };
}

/** Every repo the customer can see on GitHub, most recently pushed first, so they can pick which to track. */
export async function accessibleRepos(token: string): Promise<{ fullName: string; private: boolean; pushedAt: string | null }[]> {
  const gh = new Octokit({ auth: token });
  const repos = await gh.paginate(gh.rest.repos.listForAuthenticatedUser, {
    affiliation: "owner,collaborator,organization_member", sort: "pushed", per_page: 100,
  });
  return repos.map((r) => ({ fullName: r.full_name, private: r.private, pushedAt: r.pushed_at ?? null }));
}

const isBot = (login?: string | null, type?: string | null) => type === "Bot" || /\[bot\]$/i.test(login ?? "");

/**
 * Commit texts + dates for the period — nothing else, no code or files.
 * Same shape as `git log --pretty=format:'%ad|%s' --date=short`, bots and merges filtered out.
 */
export async function commitUnderlag(token: string, repos: string[], from: string, to: string): Promise<string> {
  const gh = new Octokit({ auth: token });
  const until = new Date(new Date(to).getTime() + 864e5).toISOString(); // inclusive end date
  const lines: string[] = [];
  for (const full of repos) {
    const [owner, repo] = full.split("/");
    const commits = await gh.paginate(gh.rest.repos.listCommits, { owner, repo, since: new Date(from).toISOString(), until, per_page: 100 });
    for (const c of commits) {
      if (c.parents.length > 1 || /^Merge (pull request|branch|remote-tracking)/.test(c.commit.message)) continue;
      if (isBot(c.author?.login, c.author?.type) || isBot(c.commit.author?.name)) continue;
      lines.push(`${(c.commit.author?.date ?? "").slice(0, 10)}|${c.commit.message.split("\n")[0]}`);
    }
  }
  return lines.sort().reverse().join("\n");
}

/** Revoke Newsly's access entirely (used on account deletion). */
export async function revokeGrant(token: string) {
  await fetch(`https://api.github.com/applications/${CLIENT_ID()}/grant`, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID()}:${CLIENT_SECRET()}`).toString("base64")}`,
    },
    body: JSON.stringify({ access_token: token }),
  });
}
