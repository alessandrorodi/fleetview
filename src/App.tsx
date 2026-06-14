import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchFleet,
  endpointForHost,
  GitHubError,
  mutatePR,
  type FleetResult,
  type PrAction,
  type PullRequest,
} from "./lib/github";
import {
  ciRollup,
  ciStatus,
  detectAgent,
  groupByRepo,
  relativeAge,
  reviewStatus,
  type Agent,
  type CiStatus,
  type ReviewStatus,
} from "./lib/derive";
import { demoResult } from "./lib/demo";
import { Chevron, CiIcon, GithubMark, Logo, XMark } from "./lib/icons";
import { BRAND_PATHS, BrandMark } from "./lib/brand";

type Filter = "all" | "review";

const CI_LABEL: Record<CiStatus, string> = {
  success: "CI: passing",
  failure: "CI: failing",
  pending: "CI: running",
  queued: "CI: queued",
  none: "CI: none",
};

const REVIEW_LABEL: Record<ReviewStatus, string> = {
  approved: "Approved",
  changes: "Changes requested",
  review: "Waiting for review",
};

interface Settings {
  host: string;
  token: string;
  query: string;
}

const DEFAULTS: Settings = {
  host: import.meta.env.VITE_GH_HOST || "github.com",
  token: import.meta.env.VITE_GH_TOKEN || "",
  query:
    import.meta.env.VITE_GH_QUERY ||
    "is:open is:pr involves:@me archived:false sort:updated-desc",
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [demo, setDemo] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [acting, setActing] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

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

  const prs = result?.pullRequests ?? [];
  const counts = useMemo(() => {
    let review = 0;
    for (const pr of prs) if (reviewStatus(pr) === "review") review++;
    return { all: prs.length, review };
  }, [prs]);

  const visible = useMemo(
    () =>
      prs.filter((pr) =>
        filter === "review" ? reviewStatus(pr) === "review" : true,
      ),
    [prs, filter],
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
  const toggleRepo = (repo: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(repo) ? next.delete(repo) : next.add(repo);
      return next;
    });

  const runBulk = async (action: PrAction) => {
    const targets = prs.filter((pr) => selected.has(prKey(pr)));
    if (!targets.length) return;
    if (demo) {
      setActionMsg("Demo mode — actions are disabled. Load real data to use these.");
      return;
    }
    const verb = action === "approve" ? "Approve" : action === "merge" ? "Merge" : "Close";
    if (
      (action === "merge" || action === "close") &&
      !window.confirm(`${verb} ${targets.length} pull request(s)? This acts on GitHub.`)
    )
      return;

    setActing(true);
    setActionMsg(null);
    let ok = 0;
    const fails: string[] = [];
    for (const pr of targets) {
      try {
        await mutatePR(action, {
          endpoint: endpointForHost(settings.host),
          token: settings.token,
          id: pr.id,
        });
        ok++;
      } catch (e) {
        fails.push(`#${pr.number}: ${e instanceof GitHubError ? e.message : String(e)}`);
      }
    }
    setActing(false);
    setActionMsg(
      `${verb}: ${ok} succeeded` +
        (fails.length ? ` · ${fails.length} failed — ${fails[0]}` : ""),
    );
    if (ok) {
      setSelected(new Set());
      void refresh(settings);
    }
  };

  // Keyboard navigation over the flattened visible (expanded) list. The focus
  // cursor stays hidden (-1) until the first j/k press.
  const flatVisible = useMemo(
    () => grouped.filter(([r]) => !collapsed.has(r)).flatMap(([, g]) => g),
    [grouped, collapsed],
  );
  useEffect(() => {
    setCursor((c) => (c < 0 ? -1 : Math.min(c, Math.max(0, flatVisible.length - 1))));
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
        const pr = cursor >= 0 ? flatVisible[cursor] : undefined;
        if (pr) toggle(prKey(pr));
        e.preventDefault();
      } else if (e.key === "o" || e.key === "Enter") {
        const pr = cursor >= 0 ? flatVisible[cursor] : undefined;
        if (pr) window.open(pr.url, "_blank", "noopener");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flatVisible, cursor]);
  useEffect(() => {
    document.querySelector(".row.cur")?.scrollIntoView({ block: "nearest" });
  }, [cursor, grouped]);

  const curKey =
    cursor >= 0 && flatVisible[cursor] ? prKey(flatVisible[cursor]) : null;
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
                ["all", "My PRs"],
                ["review", "Needs review"],
              ] as Array<[Filter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                className={`tab${filter === key ? " on" : ""}`}
                onClick={() => setFilter(key)}
              >
                {label}
                <em>{counts[key]}</em>
              </button>
            ))}
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
            const open = !collapsed.has(repo);
            return (
              <section className="repo" key={repo}>
                <button
                  className="repo-head"
                  onClick={() => toggleRepo(repo)}
                  aria-expanded={open}
                >
                  <span className="repo-chevron">
                    <Chevron open={open} />
                  </span>
                  <span
                    className={`repo-ci ci-${ciRollup(group)}`}
                    title={`CI rollup: ${ciRollup(group)}`}
                  />
                  <span className="repo-name">{repo}</span>
                  <span className="repo-count">{group.length} open</span>
                </button>
                {open && (
                  <div className="repo-rows">
                  {group.map((pr) => {
                    const agent = detectAgent(pr);
                    const ci = ciStatus(pr);
                    const rev = reviewStatus(pr);
                    const key = prKey(pr);
                    return (
                      <div
                        className={`row${selected.has(key) ? " sel" : ""}${
                          key === curKey ? " cur" : ""
                        }`}
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
                              title={agent ? agent.label : pr.author?.login ?? undefined}
                            >
                              {agent && BRAND_PATHS[agent.label] ? (
                                <BrandMark
                                  label={agent.label}
                                  color={agent.color}
                                  size={13}
                                />
                              ) : agent ? (
                                agent.label
                              ) : (
                                pr.author?.login ?? "unknown"
                              )}
                            </span>
                            {pr.isDraft && <span className="tk">draft</span>}
                          </div>
                        </div>
                        <a
                          className={`ci ci-${ci}`}
                          href={`${pr.url}/checks`}
                          target="_blank"
                          rel="noreferrer"
                          title="Open CI checks on GitHub"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <CiIcon status={ci} />
                          <span className="ci-label">{CI_LABEL[ci]}</span>
                        </a>
                        <span className={`rev rev-${rev}`}>{REVIEW_LABEL[rev]}</span>
                        <span className="size">
                          <span className="add">+{pr.additions}</span>
                          <span className="del">−{pr.deletions}</span>
                        </span>
                        <span className="age">{relativeAge(pr.createdAt)}</span>
                      </div>
                    );
                  })}
                  </div>
                )}
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
          <button
            className="cmd-clear"
            onClick={() => setSelected(new Set())}
            aria-label="Clear selection"
          >
            <XMark />
          </button>
          <span className="cmd-count">
            <strong>{selected.size}</strong> selected
          </span>
          {actionMsg && <span className="cmd-msg">{actionMsg}</span>}
          <div className="cmd-sep" />
          <button className="cmd-act" disabled={acting} onClick={() => runBulk("approve")}>
            Approve
          </button>
          <button className="cmd-act cmd-merge" disabled={acting} onClick={() => runBulk("merge")}>
            Merge
          </button>
          <button className="cmd-act cmd-close" disabled={acting} onClick={() => runBulk("close")}>
            Close
          </button>
        </div>
      )}
    </div>
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
