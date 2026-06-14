# FleetView

A light, **client-side** dashboard for triaging many open GitHub pull requests at once — built for the world where you've got a fleet of AI coding agents each opening their own PR, and GitHub's one-PR-at-a-time UI falls over.

**No backend. No codebase access. Nothing stored server-side.** FleetView is a static frontend that talks straight to GitHub's GraphQL API from your browser. Your token and your PR data never touch a server we run — there isn't one.

## Why

GitHub has no good way to *manage* a large number of concurrent PRs. The tools that try (better-diff / review products) generally clone your codebase to their servers to be smart about it — a non-starter for many security teams, and overkill when the real pain is just *triage at scale*.

FleetView competes on **multiplicity**, not diff intelligence:

- **Fleet board** — every open PR across the repos you choose, in one dense, sortable view.
- **Agent awareness** — automatically tags PRs opened by Claude, Cursor, Devin, Copilot, Dependabot, etc.
- **Conflict radar** — flags when two open PRs touch the same files and will collide, computed entirely client-side from data GitHub already gives you.
- **At-a-glance signals** — CI status, review state, mergeability, size, age.

## Privacy / security model

- The app is static files. The only network calls are **browser → GitHub GraphQL**.
- Your token lives in `localStorage` in your browser and is sent only to GitHub.
- Because it runs in *your* browser, it reaches an internal **GitHub Enterprise Server** the same way you do — no inbound access to your network, no SaaS IPs to allowlist, no third-party OAuth app to approve.

## Works with

| Flavor | Host setting | Endpoint used |
| --- | --- | --- |
| github.com | `github.com` | `https://api.github.com/graphql` |
| Enterprise Cloud | `github.com` (or your `*.ghe.com` tenant) | `https://api.github.com/graphql` |
| Enterprise Server (GHES) | `github.acme.com` | `https://github.acme.com/api/graphql` |

> **GHES + hosted build:** some GHES instances don't send permissive CORS headers, which can block a browser app served from another origin. If you hit that, self-host the static `dist/` on an allowed origin — or wait for the browser-extension build (roadmap), which sidesteps CORS via host permissions.

## Quick start

```bash
npm install
npm run dev
```

Open the dev URL, click **Settings**, and:

1. **Host** — leave as `github.com`, or enter your GHES host.
2. **Token** — a [fine-grained PAT](https://github.com/settings/personal-access-tokens) with read access to the repos you care about: **Pull requests: Read** and **Contents: Read** (Metadata is implied). For an org's fleet, authorize the token for that org (and complete SSO authorization if required).
3. **Search query** — defaults to PRs that involve you. For a whole org: `org:acme is:open is:pr`.

Click **Save & load**.

### Build a static bundle

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

`dist/` is plain static files — host it anywhere (GitHub Pages, Netlify, an internal server).

## Shipped

- Fleet board across repos, grouped, with live filter counts (All / Agents / Needs review / Conflicts).
- Agent detection from author (Claude, Cursor, Devin, Copilot, Dependabot, Renovate, generic bots) with vendor avatars.
- Cross-PR conflict radar (file overlap) with cross-linked PRs.
- CI status at three levels: per-PR chip, per-repo rollup dot, and a fleet-wide summary (passing / failing / running / queued).
- Keyboard triage: `j`/`k` move, `x` select, `o` open.
- Paginated fetch so large fleets load fully (with a page cap + "showing X of Y" notice).
- Dark / light themes and a demo mode (no token required).
- **Zero external runtime calls** — fonts and brand marks are vendored; the only network traffic is browser → GitHub. Works offline / air-gapped.

## Roadmap

- Write actions (approve / merge / close) from the board, behind an opt-in write-scoped token.
- Browser-extension build (zero-setup auth via your live github.com session; CORS-free GHES access).
- Sorting + saved views (by risk / age / CI).
- Optional, bring-your-own-key LLM pass for per-PR risk/summary — run from the browser against the diff, still no server.
- Suggested safe-merge ordering from the conflict graph + CI state.

## Stack

Vite + React + TypeScript. That's it. No server, no database.

## License

MIT — see [LICENSE](./LICENSE).
