import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchFleet,
  endpointForHost,
  GitHubError,
  type FleetResult,
  type PullRequest,
} from "./lib/github";
import {
  ciCounts,
  ciRollup,
  ciStatus,
  detectAgent,
  detectConflicts,
  groupByRepo,
  relativeAge,
  reviewStatus,
  type CiStatus,
} from "./lib/derive";
import { demoResult } from "./lib/demo";
import { CiIcon, CollideIcon, GithubMark, Logo } from "./lib/icons";
import { BRAND_PATHS, BrandMark } from "./lib/brand";
import type { Agent } from "./lib/derive";

type Filter = "all" | "agents" | "review" | "conflicts";

interface Settings {
  host: string;
  token: string;
  query: string;
}

const DEFAULTS: Settings = {
  host: "github.com",
  token: "",
  query: "is:open is:pr involves:@me archived:false sort:updated-desc",
};

const STORAGE_KEY = "fleetview.settings";
const DEMO_KEY = "fleetview.demo";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(!loadSettings().token);
  const [result, setResult] = useState<FleetResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [demo, setDemo] = useState(false);
  const [cursor, setCursor] = useState(0);

  const loadDemo = useCallback(() => {
    localStorage.setItem(DEMO_KEY, "1");
    setDemo(true);
    setResult(demoResult());
    setError(null);
    setShowSettings(false);
  }, []);

  const refresh = useCallback(async (s: Settings) => {
    if (!s.token) {
      setShowSettings(true);
      return;
    }
    localStorage.removeItem(DEMO_KEY);
    setDemo(false);
    setLoading(true);
    setError(null);
    try {
      const r = await fetchFleet({
        endpoint: endpointForHost(s.host),
        token: s.token,
        query: s.query,
      });
      setResult(r);
      setShowSettings(false);
    } catch (e) {
      setError(e instanceof GitHubError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (localStorage.getItem(DEMO_KEY)) loadDemo();
    else if (settings.token) void refresh(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = () => (demo ? loadDemo() : void refresh(settings));

  const conflicts = useMemo(
    () => (result ? detectConflicts(result.pullRequests) : null),
    [result],
  );

  const prs = result?.pullRequests ?? [];
  const counts = useMemo(() => {
    let agents = 0,
      review = 0;
    for (const pr of prs) {
      if (detectAgent(pr)) agents++;
      if (reviewStatus(pr) === "review") review++;
    }
    return {
      all: prs.length,
      agents,
      review,
      conflicts: conflicts ? conflicts.collisions.size : 0,
    };
  }, [prs, conflicts]);

  const visible = useMemo(
    () =>
      prs.filter((pr) => {
        switch (filter) {
          case "agents":
            return !!detectAgent(pr);
          case "review":
            return reviewStatus(pr) === "review";
          case "conflicts":
            return conflicts?.collisions.has(pr.number);
          default:
            return true;
        }
      }),
    [prs, filter, conflicts],
  );

  const grouped = useMemo(() => groupByRepo(visible), [visible]);

  const saveAndRefresh = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    void refresh(settings);
  };

  const prKey = (pr: PullRequest) => `${pr.repository.nameWithOwner}#${pr.number}`;
  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Keyboard navigation over the flattened visible list (console-style triage).
  const flatVisible = useMemo(() => grouped.flatMap(([, g]) => g), [grouped]);
  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, flatVisible.length - 1)));
  }, [flatVisible.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.isContentEditable))
        return;
      if (!flatVisible.length) return;
      if (e.key === "j") {
        setCursor((c) => Math.min(flatVisible.length - 1, c + 1));
        e.preventDefault();
      } else if (e.key === "k") {
        setCursor((c) => Math.max(0, c - 1));
        e.preventDefault();
      } else if (e.key === "x") {
        const pr = flatVisible[cursor];
        if (pr) toggle(prKey(pr));
        e.preventDefault();
      } else if (e.key === "o" || e.key === "Enter") {
        const pr = flatVisible[cursor];
        if (pr) window.open(pr.url, "_blank", "noopener");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flatVisible, cursor]);
  useEffect(() => {
    document.querySelector(".row.cur")?.scrollIntoView({ block: "nearest" });
  }, [cursor, grouped]);

  const curKey = flatVisible[cursor] ? prKey(flatVisible[cursor]) : null;
  let rowIndex = 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">
            <Logo />
          </span>
          <span className="wordmark">FleetView</span>
        </div>
        <div className="grow" />
        <span className="host">
          <GithubMark />
          {settings.host || "github.com"}
        </span>
        {result && <CiSummary counts={ciCounts(prs)} />}
        {result &&
          (demo ? (
            <span className="badge-demo">demo</span>
          ) : (
            <span className="ratelimit" title="GraphQL rate limit remaining">
              {result.rateLimit.remaining.toLocaleString()} / {result.rateLimit.limit.toLocaleString()}
            </span>
          ))}
        <button className="ghost" onClick={reload} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button className="ghost" onClick={() => setShowSettings((v) => !v)}>
          Settings
        </button>
      </header>

      {showSettings && (
        <section className="settings">
          <label>
            <span className="lbl">github host</span>
            <input
              value={settings.host}
              placeholder="github.com or github.acme.com (GHES)"
              onChange={(e) => setSettings({ ...settings, host: e.target.value })}
            />
            <small>{endpointForHost(settings.host)}</small>
          </label>
          <label>
            <span className="lbl">access token</span>
            <input
              type="password"
              value={settings.token}
              placeholder="github_pat_…  ·  fine-grained: Pull requests + Contents (read)"
              onChange={(e) => setSettings({ ...settings, token: e.target.value })}
            />
            <small>Stored only in this browser. Sent only to GitHub — never to us.</small>
          </label>
          <label>
            <span className="lbl">search query</span>
            <input
              value={settings.query}
              onChange={(e) => setSettings({ ...settings, query: e.target.value })}
            />
            <small>
              e.g. <code>org:acme is:open is:pr</code> for a whole org's fleet.
            </small>
          </label>
          <div className="settings-actions">
            <button className="primary" onClick={saveAndRefresh}>
              Save &amp; load
            </button>
            <button className="ghost" onClick={loadDemo}>
              Load demo data
            </button>
          </div>
        </section>
      )}

      {error && (
        <div className="error">
          <span className="dot" /> {error}
        </div>
      )}

      {result && (
        <>
          <nav className="filters">
            {(
              [
                ["all", "All"],
                ["agents", "Agents"],
                ["review", "Needs review"],
                ["conflicts", "Conflicts"],
              ] as Array<[Filter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                className={`tab${filter === key ? " on" : ""}${
                  key === "conflicts" ? " danger" : ""
                }`}
                onClick={() => setFilter(key)}
              >
                {label}
                <em>{counts[key]}</em>
              </button>
            ))}
            <span className="kbd-hint">j/k move · x select · o open</span>
          </nav>

          {prs.length < result.issueCount && (
            <div className="notice">
              Showing {prs.length} of {result.issueCount} — {result.truncated
                ? "page cap reached; narrow the query to see the rest."
                : "some results were not returned."}
            </div>
          )}

          {grouped.length === 0 && (
            <div className="empty">No pull requests match this filter.</div>
          )}

          {grouped.map(([repo, group]) => {
            const collide = group.filter((p) =>
              conflicts?.collisions.has(p.number),
            ).length;
            return (
              <section className="repo" key={repo}>
                <div className="repo-head">
                  <span
                    className={`repo-ci ci-${ciRollup(group)}`}
                    title={`CI rollup: ${ciRollup(group)}`}
                  />
                  <span className="repo-name">{repo}</span>
                  <span className="rule" />
                  <span className="repo-meta">{group.length} open</span>
                  {collide > 0 && (
                    <span className="repo-collide">{collide} collide</span>
                  )}
                </div>
                {group.map((pr) => {
                  const agent = detectAgent(pr);
                  const ci = ciStatus(pr);
                  const rev = reviewStatus(pr);
                  const collidesWith = conflicts?.collisions.get(pr.number);
                  const key = prKey(pr);
                  return (
                    <div
                      className={`row${collidesWith ? " collides" : ""}${
                        selected.has(key) ? " sel" : ""
                      }${key === curKey ? " cur" : ""}`}
                      key={key}
                      style={{ animationDelay: `${Math.min(rowIndex++, 14) * 22}ms` }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggle(key)}
                        aria-label={`select ${pr.title}`}
                      />
                      <Avatar
                        url={pr.author?.avatarUrl}
                        login={pr.author?.login ?? "?"}
                        agent={agent}
                      />
                      <div className="main">
                        <div className="title-line">
                          <a href={pr.url} target="_blank" rel="noreferrer">
                            {pr.title}
                          </a>
                          <span className="num">#{pr.number}</span>
                        </div>
                        <div className="meta-line">
                          <span
                            className="who"
                            style={agent ? { color: agent.color } : undefined}
                          >
                            {agent ? agent.label : pr.author?.login ?? "unknown"}
                          </span>
                          {pr.isDraft && <span className="tk">draft</span>}
                          {collidesWith && (
                            <span className="tk collide">
                              <CollideIcon /> collides #{collidesWith.join(", #")}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`ci ci-${ci}`} title={`CI: ${ci}`}>
                        <CiIcon status={ci} />
                      </span>
                      <span className={`rev rev-${rev}`}>{rev}</span>
                      <span className="size">
                        <span className="add">+{pr.additions}</span>
                        <span className="del">−{pr.deletions}</span>
                      </span>
                      <span className="age">{relativeAge(pr.createdAt)}</span>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </>
      )}

      {!result && !error && !showSettings && (
        <div className="empty">Loading your fleet…</div>
      )}

      {selected.size > 0 && (
        <div className="cmdbar">
          <strong>{selected.size}</strong> selected
          <span className="muted">· bulk actions arrive with a write-scoped token</span>
          <div className="grow" />
          <button className="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

function CiSummary({ counts }: { counts: Record<CiStatus, number> }) {
  const order: CiStatus[] = ["success", "failure", "pending", "queued"];
  const shown = order.filter((k) => counts[k] > 0);
  if (!shown.length) return null;
  return (
    <span className="cistat" title="CI across the fleet">
      {shown.map((k) => (
        <span key={k} className={`cseg ci-${k}`}>
          <span className="cidot" />
          {counts[k]}
        </span>
      ))}
    </span>
  );
}

function Avatar({
  url,
  login,
  agent,
}: {
  url?: string;
  login: string;
  agent: Agent | null;
}) {
  const [ok, setOk] = useState(!!url);
  // Live data: the author's real GitHub avatar (a bot's avatar is its mark).
  if (ok && url)
    return (
      <span className="avatar">
        <img src={url} alt="" onError={() => setOk(false)} />
      </span>
    );
  // No avatar (demo / ghost author): vendored brand mark when we recognise it.
  if (agent && BRAND_PATHS[agent.label])
    return (
      <span className="avatar brand">
        <BrandMark label={agent.label} color={agent.color} />
      </span>
    );
  return (
    <span className="avatar fallback" aria-hidden>
      {login.replace(/\[bot\]$/i, "")[0]?.toUpperCase() ?? "?"}
    </span>
  );
}
