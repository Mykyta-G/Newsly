import { getActivity } from "@/lib/github";
import { writeNewsletter } from "@/lib/newsletter";

// POST /api/newsletter/preview { repo?, days?, productName? } → draft, nothing sent
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const repo = body.repo ?? process.env.GITHUB_REPO;
  if (!repo) return Response.json({ error: "repo required" }, { status: 400 });
  const activity = await getActivity(repo, body.days ?? 7);
  return Response.json(await writeNewsletter(activity, body.productName));
}
