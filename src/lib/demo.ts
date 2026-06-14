// Sample data so the board can be explored without a token. Mirrors a realistic
// fleet: two agents colliding on the same auth file, a failing dependabot PR,
// a low-risk docs PR, and a larger migration in another repo.

import type { FleetResult, PullRequest } from "./github";

function pr(p: Partial<Omit<PullRequest, "files" | "repository">> & {
  number: number;
  title: string;
  repo: string;
  files: string[];
}): PullRequest {
  return {
    number: p.number,
    title: p.title,
    url: `https://github.com/${p.repo}/pull/${p.number}`,
    createdAt: p.createdAt ?? new Date(Date.now() - 2 * 3600_000).toISOString(),
    updatedAt: p.updatedAt ?? new Date().toISOString(),
    isDraft: p.isDraft ?? false,
    additions: p.additions ?? 0,
    deletions: p.deletions ?? 0,
    changedFiles: p.files.length,
    mergeable: p.mergeable ?? "MERGEABLE",
    reviewDecision: p.reviewDecision ?? null,
    author: p.author ?? { login: "octocat", avatarUrl: "", __typename: "User" },
    repository: { nameWithOwner: p.repo },
    commits: {
      nodes: [{ commit: { statusCheckRollup: p.commits?.nodes[0]?.commit.statusCheckRollup ?? { state: "SUCCESS" } } }],
    },
    files: { nodes: p.files.map((path) => ({ path })) },
  };
}

export function demoResult(): FleetResult {
  const h = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();
  const pullRequests: PullRequest[] = [
    pr({
      number: 1284,
      title: "Add rate limiting to auth middleware",
      repo: "acme/api",
      author: {
        login: "claude[bot]",
        avatarUrl: "https://cdn.simpleicons.org/claude/D97757",
        __typename: "Bot",
      },
      additions: 142,
      deletions: 9,
      reviewDecision: "REVIEW_REQUIRED",
      createdAt: h(2),
      files: ["src/middleware/auth.ts", "src/middleware/rateLimit.ts"],
    }),
    pr({
      number: 1281,
      title: "Refactor auth middleware error handling",
      repo: "acme/api",
      author: {
        login: "cursor[bot]",
        avatarUrl: "https://cdn.simpleicons.org/cursor/A7E0FF",
        __typename: "Bot",
      },
      additions: 38,
      deletions: 51,
      reviewDecision: "APPROVED",
      createdAt: h(5),
      files: ["src/middleware/auth.ts", "src/errors.ts"],
    }),
    pr({
      number: 1279,
      title: "Bump dependencies to latest minor",
      repo: "acme/api",
      author: {
        login: "dependabot[bot]",
        avatarUrl: "https://cdn.simpleicons.org/dependabot/2188FF",
        __typename: "Bot",
      },
      additions: 612,
      deletions: 418,
      isDraft: true,
      createdAt: h(26),
      commits: { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE" } } }] },
      files: ["package.json", "package-lock.json"],
    }),
    pr({
      number: 1276,
      title: "Update README with setup steps",
      repo: "acme/api",
      author: {
        login: "claude[bot]",
        avatarUrl: "https://cdn.simpleicons.org/claude/D97757",
        __typename: "Bot",
      },
      additions: 24,
      deletions: 2,
      reviewDecision: "APPROVED",
      createdAt: h(6),
      files: ["README.md"],
    }),
    pr({
      number: 892,
      title: "Migrate dashboard to server components",
      repo: "acme/web",
      author: {
        login: "cursor[bot]",
        avatarUrl: "https://cdn.simpleicons.org/cursor/A7E0FF",
        __typename: "Bot",
      },
      additions: 287,
      deletions: 63,
      reviewDecision: "REVIEW_REQUIRED",
      createdAt: h(3),
      commits: { nodes: [{ commit: { statusCheckRollup: { state: "PENDING" } } }] },
      files: ["app/dashboard/page.tsx", ".github/workflows/ci.yml"],
    }),
    pr({
      number: 871,
      title: "Fix flaky e2e test on checkout flow",
      repo: "acme/web",
      author: { login: "mara", avatarUrl: "", __typename: "User" },
      additions: 12,
      deletions: 14,
      reviewDecision: "CHANGES_REQUESTED",
      createdAt: h(9),
      commits: { nodes: [{ commit: { statusCheckRollup: { state: "EXPECTED" } } }] },
      files: ["tests/e2e/checkout.spec.ts"],
    }),
  ];

  return {
    pullRequests,
    issueCount: pullRequests.length,
    rateLimit: { remaining: 4998, limit: 5000, resetAt: h(-1) },
  };
}
