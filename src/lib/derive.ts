// Pure, client-side derivations over the PR set: agent detection, cross-PR
// file-overlap conflict radar, and small formatting helpers. No network, no LLM.

import type { CheckState, PullRequest } from "./github";

// Each agent is identified by any of three signals — because coding agents
// frequently commit under the *human's* GitHub account, so author alone misses
// them. Branch prefixes and PR-body attribution are the reliable tells.
//   - login:  the PR author (covers GitHub-App / bot authors)
//   - branch: head-branch prefix the agent creates (cursor/…, copilot/…, …)
//   - body:   attribution the agent writes into the PR description
// Body matchers are kept specific to avoid matching incidental mentions.
interface AgentDef {
  label: string;
  color: string;
  login?: RegExp;
  branch?: RegExp;
  body?: RegExp;
}

const AGENTS: AgentDef[] = [
  {
    label: "claude",
    color: "#D97757",
    login: /claude/i,
    branch: /^claude\//i,
    body: /claude code|claude\.com\/claude-code|Co-Authored-By:\s*Claude/i,
  },
  {
    label: "cursor",
    color: "#A7E0FF",
    login: /^cursor(agent|\[bot\])?$/i,
    branch: /^cursor\//i,
    body: /generated (with|by) cursor|cursor\.com/i,
  },
  {
    label: "codex",
    color: "#9AE6C0",
    login: /codex/i,
    branch: /^codex\//i,
    body: /openai codex|generated (with|by) codex/i,
  },
  {
    label: "devin",
    color: "#6B8AFE",
    login: /devin/i,
    branch: /^devin\//i,
    body: /devin\.ai|cognition/i,
  },
  {
    label: "copilot",
    color: "#C9C7C2",
    login: /copilot/i,
    branch: /^copilot\//i,
    body: /github copilot|copilot coding agent/i,
  },
  {
    label: "jules",
    color: "#F6B73C",
    login: /jules/i,
    branch: /^jules\//i,
    body: /google labs jules/i,
  },
  {
    label: "dependabot",
    color: "#2188FF",
    login: /dependabot/i,
    branch: /^dependabot\//i,
  },
  {
    label: "renovate",
    color: "#FE8B00",
    login: /renovate/i,
    branch: /^renovate\//i,
  },
];

export interface Agent {
  label: string;
  color: string;
  isBot: boolean;
}

export function detectAgent(pr: PullRequest): Agent | null {
  const login = pr.author?.login ?? "";
  const branch = pr.headRefName ?? "";
  const body = pr.bodyText ?? "";
  for (const a of AGENTS) {
    if (
      a.login?.test(login) ||
      a.branch?.test(branch) ||
      a.body?.test(body)
    )
      return { label: a.label, color: a.color, isBot: true };
  }
  // Any other GitHub App / bot author, surfaced generically.
  const isBot = pr.author?.__typename === "Bot" || /\[bot\]$/i.test(login);
  if (isBot)
    return { label: login.replace(/\[bot\]$/i, ""), color: "#9C9488", isBot: true };
  return null;
}

export interface ConflictInfo {
  // PR number → set of PR numbers it overlaps with (same repo, shared files).
  collisions: Map<number, number[]>;
}

// Cheap conflict radar: within each repo, any file touched by more than one
// open PR marks those PRs as colliding. This is the heuristic pass — a real
// merge simulation would confirm, but overlap alone catches the dangerous case.
export function detectConflicts(prs: PullRequest[]): ConflictInfo {
  const byRepo = new Map<string, PullRequest[]>();
  for (const pr of prs) {
    const key = pr.repository.nameWithOwner;
    (byRepo.get(key) ?? byRepo.set(key, []).get(key)!).push(pr);
  }

  const collisions = new Map<number, Set<number>>();
  for (const group of byRepo.values()) {
    const fileOwners = new Map<string, number[]>();
    for (const pr of group) {
      for (const f of pr.files.nodes) {
        (fileOwners.get(f.path) ?? fileOwners.set(f.path, []).get(f.path)!).push(
          pr.number,
        );
      }
    }
    for (const owners of fileOwners.values()) {
      if (owners.length < 2) continue;
      for (const a of owners) {
        for (const b of owners) {
          if (a === b) continue;
          (collisions.get(a) ?? collisions.set(a, new Set()).get(a)!).add(b);
        }
      }
    }
  }

  return {
    collisions: new Map(
      [...collisions].map(([k, v]) => [k, [...v].sort((a, b) => a - b)]),
    ),
  };
}

export type CiStatus = "success" | "failure" | "pending" | "queued" | "none";

export function ciStatus(pr: PullRequest): CiStatus {
  const state: CheckState =
    pr.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null;
  switch (state) {
    case "SUCCESS":
      return "success";
    case "FAILURE":
    case "ERROR":
      return "failure";
    case "PENDING":
      return "pending";
    case "EXPECTED":
      return "queued";
    default:
      return "none";
  }
}

// Worst-wins rollup for a set of PRs: red beats amber beats blue beats green.
export function ciRollup(prs: PullRequest[]): CiStatus {
  const seen = new Set(prs.map(ciStatus));
  if (seen.has("failure")) return "failure";
  if (seen.has("pending")) return "pending";
  if (seen.has("queued")) return "queued";
  if (seen.has("success")) return "success";
  return "none";
}

export function ciCounts(prs: PullRequest[]): Record<CiStatus, number> {
  const c: Record<CiStatus, number> = {
    success: 0,
    failure: 0,
    pending: 0,
    queued: 0,
    none: 0,
  };
  for (const pr of prs) c[ciStatus(pr)]++;
  return c;
}

export type ReviewStatus = "approved" | "changes" | "review";

export function reviewStatus(pr: PullRequest): ReviewStatus {
  switch (pr.reviewDecision) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes";
    default:
      return "review";
  }
}

export function relativeAge(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

export function groupByRepo(prs: PullRequest[]): Array<[string, PullRequest[]]> {
  const map = new Map<string, PullRequest[]>();
  for (const pr of prs) {
    const key = pr.repository.nameWithOwner;
    (map.get(key) ?? map.set(key, []).get(key)!).push(pr);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
