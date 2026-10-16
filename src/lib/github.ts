import { Octokit } from "octokit";

export type Activity = {
  repo: string;
  since: string;
  commits: { sha: string; message: string; author: string; date: string }[];
  pulls: { number: number; title: string; body: string; mergedAt: string }[];
  releases: { tag: string; name: string; body: string; date: string }[];
};

const octokit = () => new Octokit({ auth: process.env.GITHUB_TOKEN });

/** Everything that shipped in `repo` (owner/name) over the last `days` days. */
export async function getActivity(repo: string, days = 7): Promise<Activity> {
  const [owner, name] = repo.split("/");
  const since = new Date(Date.now() - days * 864e5).toISOString();

  const [commits, pulls, releases] = await Promise.all([
    octokit().rest.repos.listCommits({ owner, repo: name, since, per_page: 100 }),
    octokit().rest.pulls.list({ owner, repo: name, state: "closed", sort: "updated", direction: "desc", per_page: 50 }),
    octokit().rest.repos.listReleases({ owner, repo: name, per_page: 10 }),
  ]);

  return {
    repo,
    since,
    commits: commits.data.map((c) => ({
      sha: c.sha.slice(0, 7),
      message: c.commit.message,
      author: c.commit.author?.name ?? "unknown",
      date: c.commit.author?.date ?? "",
    })),
    pulls: pulls.data
      .filter((p) => p.merged_at && p.merged_at >= since)
      .map((p) => ({ number: p.number, title: p.title, body: p.body ?? "", mergedAt: p.merged_at! })),
    releases: releases.data
      .filter((r) => (r.published_at ?? "") >= since)
      .map((r) => ({ tag: r.tag_name, name: r.name ?? r.tag_name, body: r.body ?? "", date: r.published_at! })),
  };
}
