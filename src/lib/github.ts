// Thin GitHub GraphQL client. Runs entirely in the browser — the token and all
// PR data stay client-side. Works against github.com, Enterprise Cloud, and
// GitHub Enterprise Server by pointing `endpoint` at the right /graphql URL.

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN" | null;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  author: { login: string; avatarUrl: string; __typename: string } | null;
  repository: { nameWithOwner: string };
  commits: {
    nodes: Array<{
      commit: { statusCheckRollup: { state: CheckState } | null };
    }>;
  };
  files: { nodes: Array<{ path: string }> };
}

export type CheckState =
  | "SUCCESS"
  | "FAILURE"
  | "ERROR"
  | "PENDING"
  | "EXPECTED"
  | null;

export interface RateLimit {
  remaining: number;
  limit: number;
  resetAt: string;
}

export interface FleetResult {
  pullRequests: PullRequest[];
  issueCount: number;
  rateLimit: RateLimit;
}

const QUERY = `
query Fleet($q: String!, $prCount: Int!) {
  rateLimit { remaining limit resetAt }
  search(query: $q, type: ISSUE, first: $prCount) {
    issueCount
    nodes {
      ... on PullRequest {
        number
        title
        url
        createdAt
        updatedAt
        isDraft
        additions
        deletions
        changedFiles
        mergeable
        reviewDecision
        author { login avatarUrl __typename }
        repository { nameWithOwner }
        commits(last: 1) {
          nodes { commit { statusCheckRollup { state } } }
        }
        files(first: 100) { nodes { path } }
      }
    }
  }
}`;

export class GitHubError extends Error {}

export async function fetchFleet(opts: {
  endpoint: string;
  token: string;
  query: string;
  prCount?: number;
}): Promise<FleetResult> {
  const res = await fetch(opts.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { q: opts.query, prCount: opts.prCount ?? 50 },
    }),
  });

  if (res.status === 401)
    throw new GitHubError("Unauthorized — check your token (401).");
  if (!res.ok)
    throw new GitHubError(`Request failed: ${res.status} ${res.statusText}`);

  const body = await res.json();
  if (body.errors?.length)
    throw new GitHubError(body.errors.map((e: { message: string }) => e.message).join("; "));

  const search = body.data.search;
  // `type: ISSUE` returns issues too; the inline fragment leaves non-PR nodes
  // as empty objects, so filter to nodes that actually carried PR fields.
  const pullRequests: PullRequest[] = search.nodes.filter(
    (n: Partial<PullRequest>) => n && typeof n.number === "number",
  );

  return {
    pullRequests,
    issueCount: search.issueCount,
    rateLimit: body.data.rateLimit,
  };
}

// Derive the GraphQL endpoint from a host. github.com → api.github.com/graphql;
// GHES host (github.acme.com) → https://github.acme.com/api/graphql.
export function endpointForHost(host: string): string {
  const h = host.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!h || h === "github.com" || h === "api.github.com")
    return "https://api.github.com/graphql";
  return `https://${h}/api/graphql`;
}
