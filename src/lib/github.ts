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
  // True when the maxPages cap was hit before all matching PRs were fetched.
  truncated: boolean;
}

const QUERY = `
query Fleet($q: String!, $first: Int!, $after: String) {
  rateLimit { remaining limit resetAt }
  search(query: $q, type: ISSUE, first: $first, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
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

async function postPage(opts: {
  endpoint: string;
  token: string;
  query: string;
  first: number;
  after: string | null;
}) {
  const res = await fetch(opts.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { q: opts.query, first: opts.first, after: opts.after },
    }),
  });

  if (res.status === 401)
    throw new GitHubError("Unauthorized — check your token (401).");
  if (!res.ok)
    throw new GitHubError(`Request failed: ${res.status} ${res.statusText}`);

  const body = await res.json();
  if (body.errors?.length)
    throw new GitHubError(
      body.errors.map((e: { message: string }) => e.message).join("; "),
    );
  return body.data;
}

// Paginate through the search results up to a page cap so large fleets load
// without an unbounded number of requests (each page is one rate-limit hit).
export async function fetchFleet(opts: {
  endpoint: string;
  token: string;
  query: string;
  pageSize?: number;
  maxPages?: number;
}): Promise<FleetResult> {
  const pageSize = opts.pageSize ?? 50;
  const maxPages = opts.maxPages ?? 6;

  const pullRequests: PullRequest[] = [];
  let issueCount = 0;
  let rateLimit: RateLimit = { remaining: 0, limit: 0, resetAt: "" };
  let after: string | null = null;
  let pages = 0;
  let truncated = false;

  do {
    const data = await postPage({ ...opts, first: pageSize, after });
    const search = data.search;
    rateLimit = data.rateLimit;
    issueCount = search.issueCount;
    // `type: ISSUE` returns issues too; the inline fragment leaves non-PR
    // nodes as empty objects, so keep only those that carried PR fields.
    for (const n of search.nodes as Array<Partial<PullRequest>>) {
      if (n && typeof n.number === "number") pullRequests.push(n as PullRequest);
    }
    pages++;
    after = search.pageInfo.hasNextPage ? search.pageInfo.endCursor : null;
    if (after && pages >= maxPages) {
      truncated = true;
      after = null;
    }
  } while (after);

  return { pullRequests, issueCount, rateLimit, truncated };
}

// Derive the GraphQL endpoint from a host. github.com → api.github.com/graphql;
// GHES host (github.acme.com) → https://github.acme.com/api/graphql.
export function endpointForHost(host: string): string {
  const h = host.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!h || h === "github.com" || h === "api.github.com")
    return "https://api.github.com/graphql";
  return `https://${h}/api/graphql`;
}
