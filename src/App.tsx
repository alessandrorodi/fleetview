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
  type CiStatus,
  type ReviewStatus,
} from "./lib/derive";
import { demoResult } from "./lib/demo";
import { CheckIcon, Chevron, CopyIcon, GithubMark, Logo, XMark } from "./lib/icons";
import { BRAND_PATHS, BrandMark } from "./lib/brand";

type Filter = "all" | "review" | "toreview";

const REVIEW_REQUESTED_QUERY =
  "is:open is:pr review-requested:@me archived:false sort:updated-desc";

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
  showToReview: boolean;
}

const DEFAULTS: Settings = {
  host: import.meta.env.VITE_GH_HOST || "github.com",
  token: import.meta.env.VITE_GH_TOKEN || "",
  query:
    import.meta.env.VITE_GH_QUERY ||
    "is:open is:pr involves:@me archived:false sort:updated-desc",
  showToReview: true,
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
  const [loadedToReview, setLoadedToReview] = useState(false);

  const loadDemo = useCallback(() => {
    localStorage.setItem(DEMO_KEY, "1");
    setDemo(true);
    setResult(demoResult());
    setError(null);
    setShowSettings(false);
  }, []);

  const refresh = useCallback(
    async (s: Settings, query: string, reviewRequested: boolean) => {
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
          query,
        });
        setResult(r);
        setLoadedToReview(reviewRequested);
        setShowSettings(false);
      } catch (e) {
        setError(e instanceof GitHubError ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (localStorage.getItem(DEMO_KEY)) loadDemo();
    else if (settings.token) void refresh(settings, settings.query, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "To review" uses the review-requested search; other tabs share the
  // configured query. Switching across that boundary triggers a refetch.
  const queryFor = (f: Filter, s: Settings) =>
    f === "toreview" ? REVIEW_REQUESTED_QUERY : s.query;

  const reload = () =>
    demo
      ? loadDemo()
      : void refresh(settings, queryFor(filter, settings), filter === "toreview");

  const selectTab = (key: Filter) => {
    setFilter(key);
    if (!demo && (key === "toreview") !== loadedToReview)
      void refresh(settings, queryFor(key, settings), key === "toreview");
  };

  // If the "To review" tab is turned off while it's active, fall back to My PRs.
  useEffect(() => {
    if (!settings.showToReview && filter === "toreview") {
      setFilter("all");
      if (!demo && loadedToReview)
        void refresh(settings, settings.query, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.showToReview]);

  const prs = result?.pullRequests ?? [];
  const viewer = result?.viewerLogin ?? "";

  // Demo has no second fetch, so approximate "To review" as others' PRs.
  const isOthersPR = (pr: PullRequest) =>
    !!pr.author?.login && (!viewer || pr.author.login !== viewer);

  const counts = useMemo<Record<Filter, number | undefined>>(() => {
    if (demo) {
      let review = 0,
        toreview = 0;
      for (const pr of prs) {
        if (reviewStatus(pr) === "review") review++;
        if (isOthersPR(pr)) toreview++;
      }
      return { all: prs.length, review, toreview };
    }
    // Real data: only the currently-loaded source has a known count.
    if (loadedToReview)
      return { all: undefined, review: undefined, toreview: prs.length };
    let review = 0;
    for (const pr of prs) if (reviewStatus(pr) === "review") review++;
    return { all: prs.length, review, toreview: undefined };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prs, demo, loadedToReview, viewer]);

  const visible = useMemo(
    () =>
      prs.filter((pr) => {
        if (filter === "review") return reviewStatus(pr) === "review";
        if (filter === "toreview") return demo ? isOthersPR(pr) : true;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prs, filter, demo, viewer],
  );

  const grouped = useMemo(() => groupByRepo(visible), [visible]);

  const saveAndRefresh = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setFilter("all");
    void refresh(settings, settings.query, false);
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
      void refresh(settings, queryFor(filter, settings), filter === "toreview");
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
          <label className="settings-check">
            <input
              type="checkbox"
              checked={settings.showToReview}
              onChange={(e) => {
                const next = { ...settings, showToReview: e.target.checked };
                setSettings(next);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
              }}
            />
            <span>
              Show “To review” tab — PRs awaiting your review (
              <code>review-requested:@me</code>)
            </span>
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
                ...(settings.showToReview
                  ? ([["toreview", "To review"]] as Array<[Filter, string]>)
                  : []),
              ] as Array<[Filter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                className={`tab${filter === key ? " on" : ""}`}
                onClick={() => selectTab(key)}
              >
                {label}
                {counts[key] !== undefined && <em>{counts[key]}</em>}
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
                        onClick={(e) => {
                          // Let links / the checkbox handle their own clicks;
                          // anywhere else on the row toggles selection.
                          if ((e.target as HTMLElement).closest("a, button, input, label"))
                            return;
                          toggle(key);
                        }}
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
                          className="ci"
                          href={`${pr.url}/checks`}
                          target="_blank"
                          rel="noreferrer"
                          title={`${CI_LABEL[ci]} — open checks`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className={`ci-dot ci-${ci}`} />
                          <span className="ci-label">{CI_LABEL[ci]}</span>
                        </a>
                        <span className={`rev rev-${rev}`}>{REVIEW_LABEL[rev]}</span>
                        <span className="size">
                          <span className="add">+{pr.additions}</span>
                          <span className="del">−{pr.deletions}</span>
                        </span>
                        <span className="age">{relativeAge(pr.createdAt)}</span>
                        <CopyButton url={pr.url} />
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
          {/* Approve only makes sense for PRs you didn't author — GitHub blocks
              self-approval. Show it only when the selection includes others'. */}
          {prs.some(
            (pr) =>
              selected.has(prKey(pr)) &&
              pr.author?.login &&
              (!result?.viewerLogin || pr.author.login !== result.viewerLogin),
          ) && (
            <button className="cmd-act" disabled={acting} onClick={() => runBulk("approve")}>
              Approve
            </button>
          )}
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

function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={`copy${copied ? " copied" : ""}`}
      title={copied ? "Copied!" : "Copy PR link"}
      aria-label="Copy PR link"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          /* clipboard may be unavailable */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

// Avatar = the author. The agent (which tool wrote it) is shown separately as
// the small mark next to the title, so there's no duplication.
function Avatar({ url, login }: { url?: string; login: string }) {
  const [ok, setOk] = useState(!!url);
  if (ok && url)
    return (
      <span className="avatar">
        <img src={url} alt="" onError={() => setOk(false)} />
      </span>
    );
  return (
    <span className="avatar fallback" aria-hidden>
      {login.replace(/\[bot\]$/i, "")[0]?.toUpperCase() ?? "?"}
    </span>
  );
}
