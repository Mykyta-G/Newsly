import { grantedRepos, installUrl, userToken } from "@/lib/github";
import { currentAccount } from "@/lib/session";

export async function GET() {
  const a = await currentAccount();
  if (!a) return Response.json({ error: "Inte inloggad" }, { status: 401 });
  try {
    return Response.json({ repos: await grantedRepos(await userToken(a)), installUrl: installUrl() });
  } catch (e) {
    return Response.json({ error: (e as Error).message, repos: [], installUrl: installUrl() }, { status: 502 });
  }
}
