import { accessSettingsUrl, accessibleRepos, userToken } from "@/lib/github";
import { currentAccount } from "@/lib/session";

/** Repos the customer can pick from (most recently active first), plus GitHub's page for revoking access. */
export async function GET() {
  const a = await currentAccount();
  if (!a) return Response.json({ error: "Inte inloggad" }, { status: 401 });
  try {
    return Response.json({ repos: await accessibleRepos(await userToken(a)), tracked: a.repos, accessSettingsUrl: accessSettingsUrl() });
  } catch (e) {
    return Response.json({ error: (e as Error).message, repos: [], tracked: a.repos, accessSettingsUrl: accessSettingsUrl() }, { status: 502 });
  }
}
