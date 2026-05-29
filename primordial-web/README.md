# Primordial Web Storefront

A static, human-facing storefront for the [Primordial AgentStore](../README.md) — an
open-source marketplace for sandboxed AI agents. It lets people browse agents, inspect what
each one is allowed to do, and copy the command to run it.

Built with [Astro](https://astro.build) (static output, no SPA runtime). The only browser
JS is a small vanilla script for client-side search/filter/sort and copy-to-clipboard.

## What it does

- **Browse / index page** — grid of agent cards with name, description, category, tags,
  language, provider chips, and signals (stars / runs in 30d / rating). Client-side text
  search plus facet filters by category, tag, language, and trust tier. Sort by stars,
  popularity (runs/30d), rating, or name.
- **Agent detail page** (one per `owner/repo`) — manifest summary, a **permissions panel**
  (network domains, filesystem mode, delegation, and a prominent warning when an agent
  requests unrestricted network access), the rendered README, signals, author, version/ref,
  and a **copy-to-clipboard run command** for both the Primordial CLI and the MCP host call.
- **Landing hero** — a short explainer of what Primordial is.

## Data source

The site consumes the index per the [Phase 0 contract](../docs/developers/index-contract.md):

| Endpoint | Used for |
|---|---|
| `GET /catalog` | The catalog list (index page + static route generation) |
| `GET /agents/:owner/:repo` | Per-agent detail (full manifest + README) |
| `GET /agents/:owner/:repo/stats` | Live signals, merged over baked values |

`id` (= `owner/repo`) is the routing key everywhere. The data layer tolerates `null`
signals and unknown fields.

### Local mock vs. live index

The index service isn't deployed yet, so the site builds against a **local mock fixture**
by default:

- `src/fixtures/catalog.json` — 4 sample agents matching the contract exactly.
- `src/fixtures/details/<owner>__<repo>.json` — per-agent manifest + README.

To build against the **live index**, set `PRIMORDIAL_INDEX_URL`:

```bash
PRIMORDIAL_INDEX_URL=https://index.primordial.dev npm run build
```

When unset, the footer/note on the index page reads "local mock fixture"; when set it reads
"live index service". See `.env.example`.

## Develop

```bash
npm install
npm run dev        # http://localhost:4321 — against the mock fixture
```

## Build (static export)

```bash
npm run build      # -> ./dist (fully static HTML/CSS/JS)
npm run preview    # serve ./dist locally to sanity-check
```

`dist/` contains `index.html` plus one `agents/<owner>/<repo>/index.html` per agent. No
server runtime is required to host it.

## Deploy

Static output — host it anywhere. Do **not** deploy from this README automatically.

### Vercel

- Framework preset: **Astro**
- Build command: `npm run build`
- Output directory: `dist`
- (Optional) set `PRIMORDIAL_INDEX_URL` as a project environment variable to build against
  the live index. Redeploy whenever the catalog changes (or wire the index publish webhook
  to a deploy hook).

### Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`
- (Optional) add `PRIMORDIAL_INDEX_URL` under the project's environment variables.

> Because the catalog is fetched at **build time** and baked into static HTML, redeploy to
> pick up catalog changes. A scheduled build or a deploy hook fired by the index crawler
> keeps the storefront fresh.

## Project layout

```
primordial-web/
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── .env.example
└── src/
    ├── fixtures/
    │   ├── catalog.json                  # mock catalog (contract §1)
    │   └── details/*.json                # per-agent manifest + README
    ├── lib/
    │   ├── types.ts                      # contract-mirrored types
    │   ├── data.ts                        # catalog/detail/stats loader (fixture or live)
    │   └── format.ts                     # display + formatting helpers
    ├── layouts/Base.astro
    ├── components/
    │   ├── AgentCard.astro
    │   ├── TrustBadge.astro
    │   ├── PermissionsPanel.astro
    │   └── CopyCommand.astro
    ├── pages/
    │   ├── index.astro                   # browse + hero
    │   └── agents/[owner]/[repo].astro   # detail (one static page per agent)
    └── styles/global.css
```

## Notes

- Dependencies kept minimal: Astro + `marked` (README markdown → HTML). No CSS framework,
  no SPA router.
- The site is security-sensitive: trust tier and the full permission surface are shown
  prominently on both cards and detail pages, since users approve agents based on them.
