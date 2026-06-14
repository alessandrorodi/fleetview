// Pure, client-side derivations over the PR set: agent detection, cross-PR
// file-overlap conflict radar, and small formatting helpers. No network, no LLM.

import type { CheckState, PullRequest } from "./github";

const AGENTS: Array<{ label: string; color: string; match: RegExp }> = [
  { label: "claude", color: "#D97757", match: /claude/i },
  { label: "cursor", color: "#A7E0FF", match: /cursor/i },
  { label: "devin", color: "#6B8AFE", match: /devin/i },
  { label: "copilot", color: "#C9C7C2", match: /copilot/i },
  { label: "codex", color: "#9AE6C0", match: /codegen|sweep|codex/i },
  { label: "dependabot", color: "#2188FF", match: /dependabot/i },
  { label: "renovate", color: "#FE8B00", match: /renovate/i },
];

export interface Agent {
  label: string;
  color: string;
  isBot: boolean;
}

// Identify automated authors. Catches named agents, GitHub Apps ("…[bot]"),
// and the Bot GraphQL typename. Returns null for ordinary human authors.
export function detectAgent(pr: PullRequest): Agent | null {
  const login = pr.author?.login ?? "";
  for (const a of AGENTS) {
    if (a.match.test(login))
      return { label: a.label, color: a.color, isBot: true };
  }
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
