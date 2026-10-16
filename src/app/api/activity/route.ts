import { getActivity } from "@/lib/github";

// GET /api/activity?repo=owner/name&days=7
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repo = searchParams.get("repo") ?? process.env.GITHUB_REPO;
  if (!repo) return Response.json({ error: "repo required" }, { status: 400 });
  const days = Number(searchParams.get("days") ?? 7);
  return Response.json(await getActivity(repo, days));
}
