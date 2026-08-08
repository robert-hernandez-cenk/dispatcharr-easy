# Phase 0: Foundation — design

Date: 2026-08-08

## Problem

[Dispatcharr](https://github.com/Dispatcharr/Dispatcharr) is a solid IPTV/EPG/DVR
backend, but its UI feels dated and clunky. There's no sign upstream is planning
a holistic redesign — the `Area: Frontend` label and issue history are all
small, page-scoped feature requests and bug fixes, not a UI overhaul (checked
2026-08-08: no "redesign"/"revamp"/"overhaul" issues, Discussions disabled).

`dispatcharr-easy` is a replacement frontend for Dispatcharr: same backend, API,
auth, and data — a different UI. The goal is that someone already running
Dispatcharr can install this instead of (visually) what they have, with no
separate container to manage and no risk to their data.

## Non-goals (this phase)

- Rewriting every page. Dispatcharr's UI spans Channels, EPG, Streams/M3U
  sources, VOD, Plugins, Users, Outputs/HDHR, Backups, Logs, Settings — each
  is its own subsystem with its own data model and screens. Phase 0 builds the
  foundation and **one** flagship page; every other page is a separate,
  later spec/plan.
- Forking or vendoring Dispatcharr's backend or frontend source. This project
  never touches Dispatcharr's code, only its already-public HTTP/WebSocket API.
- Feature parity in this phase. The Dashboard page just needs to work
  end-to-end against a real instance; later phases bring the rest of the app
  up to parity page by page.

## Why an overlay, not a companion container

Confirmed against Dispatcharr's actual repo (Docker build, nginx config,
Django settings, and `debian_install.sh`, checked 2026-08-08):

- Django's `settings.py` points both `TEMPLATES` and `STATICFILES_DIRS`
  straight at `frontend/dist` (the Vite build output).
- `urls.py`'s catch-all route renders `frontend/dist/index.html` fresh via
  `TemplateView` on every request — no caching, and it's a plain static
  `index.html` (no Django template syntax to preserve).
- nginx (identical in both the Docker image and the bare-metal/LXC install —
  same repo, same relative paths, `APP_DIR=/opt/dispatcharr` by default)
  serves `/assets/` off `frontend/dist/assets/` directly (bare-metal) or off
  the `collectstatic`-collected copy (Docker), and proxies everything else to
  Django/uwsgi.
- The Docker entrypoint (`docker/entrypoint.sh`) already re-runs
  `manage.py collectstatic --noinput` unconditionally on every container
  start.

**Consequence:** the entire "overlay" is replacing the contents of one
directory, `frontend/dist/`, with `dispatcharr-easy`'s own build. Nothing
else — backend, nginx config, nginx itself, auth — needs to change, and
because both the template render and the asset routes read straight off disk
per-request, the swap takes effect with no restart required. This is why a
companion container (a second process fronting/proxying to Dispatcharr) isn't
needed: there's no runtime component to run at all, just a file swap at
install/update time.

## Architecture

### Repo & stack

Single repo, `dispatcharr-easy`, public, MIT-licensed. A standalone Vite +
React + Mantine 8 SPA — matching Dispatcharr's own frontend stack
(confirmed via `frontend/package.json`: Mantine 8, TanStack Table,
react-router-dom v7, Zustand) so effort goes into layout/UX/navigation
redesign rather than re-solving component plumbing, and Mantine's responsive
primitives (`AppShell` collapsing nav, `visibleFrom`/`hiddenFrom`,
responsive style props) make the mobile-first requirement (below)
straightforward rather than hand-rolled.

Contains **no Dispatcharr source** — no subtree, no submodule, no forked
files. It only ever talks to Dispatcharr over its existing HTTP/WebSocket API.

### API layer

A typed API client generated from Dispatcharr's live OpenAPI schema
(`GET /api/schema/`, served by drf-spectacular — confirmed present in
`apps/api/urls.py`) via `openapi-typescript`. The generated client is
committed to the repo per targeted Dispatcharr version rather than
regenerated live on every build, so builds stay reproducible and a schema
change on some future Dispatcharr version can't silently alter what a
released `dispatcharr-easy` version builds against.

Auth follows Dispatcharr's existing JWT flow (confirmed in
`apps/accounts/api_urls.py`: `rest_framework_simplejwt`'s
`token/` / `token/refresh/` endpoints):

- Access token held in memory only (not persisted).
- Refresh token in `localStorage`.
- A fetch/axios interceptor retries once on 401 after a silent refresh;
  on refresh failure, redirect to a login screen.

### Distribution — the overlay

Both install paths consume the same built `dist/` artifact, published as a
GitHub Release asset per `dispatcharr-easy` version:

**Docker.** A derived image: `FROM ghcr.io/dispatcharr/dispatcharr:<pinned-tag>`
plus `COPY dist/ /app/frontend/dist/`. CI publishes this image to GHCR on
release, so installing is pointing `docker-compose.yml` at the published
image — no local build step for the end user. There's no dry-run/`--apply`
concept here: the image build never touches a running system, and the
user's own `docker compose up` (swapping the image tag) is already their
explicit confirmation step.

**Bare-metal / LXC.** An install/update script, ergonomics modeled on
Dispatcharr's own `debian_install.sh` (`curl | bash`-style), that:

1. Takes `APP_DIR` (default `/opt/dispatcharr`, matching Dispatcharr's own
   default).
2. Reads the installed Dispatcharr version and compares it against this
   release's declared compatible version(s) (see Versioning below); warns
   or aborts on mismatch unless forced.
3. Defaults to a dry-run: prints what it would change (back up path, files
   to be replaced) without touching anything.
4. On `--apply`: backs up the existing `frontend/dist` to a timestamped
   path (enabling `--revert`), copies in the new build, and runs
   `manage.py collectstatic --noinput`.
5. No service restart — Django's template render and nginx's asset routes
   both read straight off disk per-request (confirmed above).

The dry-run-by-default / explicit-`--apply` convention mirrors how
infrastructure-mutating tools should treat overlaying files on someone's
live, running install — you get a preview before anything on their box
changes.

### Versioning

Each `dispatcharr-easy` release declares which Dispatcharr version(s) it's
verified against. The Docker image's `FROM` tag and the bare-metal script's
version check both derive from that declared compatibility — an upstream
Dispatcharr change (API shape, `frontend/dist` convention) can't silently
break an already-installed overlay; a mismatch is a warning/abort, not a
silent failure.

### Mobile

Mobile-friendliness is a first-class requirement, not an afterthought — the
principle for Phase 0's shell and every later page is "reduce what's
manageable on mobile, don't cram the desktop layout down." Concretely for
Phase 0: `AppShell` with a collapsing/off-canvas nav below a single
breakpoint, and any dense tabular content on the Dashboard uses a
card-list fallback on small screens rather than horizontal scroll.

## Phase 0 scope (this spec's deliverable)

1. Repo scaffold: Vite + React + Mantine 8, ESLint/Prettier config
   (mirroring Dispatcharr's own frontend tooling choices), Vitest +
   React Testing Library wired up.
2. CI/CD (GitHub Actions): build the frontend on tag push, publish the
   `dist/` build as a GitHub Release asset, build and publish the derived
   Docker image to GHCR.
3. OpenAPI-generated, committed API client + JWT auth flow (login, silent
   refresh, logout, redirect-on-failure).
4. Responsive app shell: nav, layout, theming (light/dark), mobile
   breakpoint behavior.
5. The Docker overlay Dockerfile/compose and the bare-metal overlay script
   (dry-run + `--apply` + `--revert`), both consuming the same `dist/`
   artifact.
6. Dashboard/home page, built end-to-end against a real Dispatcharr
   instance, as proof the full pipeline (build → overlay → auth → real
   data) works.

Every other page (Channels, EPG, Streams/M3U, VOD, Plugins, Users,
Outputs/HDHR, Backups, Logs, Settings) is out of scope — separate
follow-on specs, one page/group at a time.

## Testing

- Vitest + React Testing Library for components and API-client logic.
- The overlay scripts (Docker image build, bare-metal install/update/revert)
  are verified manually against a real Dispatcharr instance — there's
  already a `dispatcharr-lxc` guest available for this — same precedent as
  Proxmox-SSH's own `Ssh2SSHClient` (manually verified, no automated test,
  since it's the one piece that actually touches a live remote system).

## Error handling

- API errors surface via Mantine notifications.
- Auth/refresh failure redirects to a login screen.
- Overlay script failures (version mismatch, copy failure, `collectstatic`
  failure) abort before any destructive step and leave the existing install
  untouched; a successful `--apply` keeps the pre-overlay backup so
  `--revert` is always available.
