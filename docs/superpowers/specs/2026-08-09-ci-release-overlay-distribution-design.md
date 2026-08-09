# CI-release + Docker overlay distribution — design

Date: 2026-08-09

## Problem

Foundation (typed API client + auth) and the app shell + Dashboard plan (login, layout, first real page) are both built. There is still no way for anyone to actually install `dispatcharr-easy` onto a real Dispatcharr instance — this is the remaining half of Phase 0's scope: the CI/CD release pipeline and the two overlay distribution paths (Docker, bare-metal) described in the [Phase 0 design spec](2026-08-08-phase0-foundation-design.md#distribution--the-overlay).

## Context verified against the real Dispatcharr repo (2026-08-09, via `gh api`, not guessed)

- `docker/Dockerfile` builds the frontend then does `COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist` into a final stage `FROM ghcr.io/${REPO_OWNER}/${REPO_NAME}:${BASE_TAG}` — confirms the exact path Foundation's spec assumed.
- `docker/entrypoint.sh` runs `python manage.py collectstatic --noinput` **unconditionally on every container start** — confirms our derived image needs nothing beyond `COPY dist/ /app/frontend/dist/` at build time; collectstatic re-publishing happens automatically at container start.
- `docker/docker-compose.aio.yml` (single-container "all-in-one" mode) and `docker/docker-compose.yml` (modular: separate `web`/`celery`/`db`/`redis` containers) both reference `image: ghcr.io/dispatcharr/dispatcharr:latest`. In modular mode, only `web` serves HTTP/static assets — `celery` never needs our overlay.
- `.github/workflows/release.yml` publishes both `ghcr.io/dispatcharr/dispatcharr:latest` and `ghcr.io/dispatcharr/dispatcharr:<version>` — version tag has **no `v` prefix** (e.g. `0.28.2`), while the git/release tag does (`v0.28.2`). Easy to get backwards; called out explicitly here.
- `docker/nginx.conf` (Docker) serves `/assets/` from `/app/static` (the `collectstatic` destination). `debian_install.sh` (bare-metal) instead writes an nginx config with `location /assets/ { alias ${APP_DIR}/frontend/dist/assets/; }` — **directly** off `frontend/dist`, no collectstatic involved for this route. Both confirm Foundation's spec claim, via two different mechanisms.
- `debian_install.sh` defaults `APP_DIR=/opt/dispatcharr`, and its `django_migrate_collectstatic()` step runs `env/bin/python manage.py collectstatic --noinput` from `$APP_DIR` using the install's own venv — the exact command our bare-metal script's `--apply` step needs to replicate.
- Both nginx configs proxy `location /` (or bare uwsgi) to Django/uwsgi for everything else, including `index.html` — confirmed rendered fresh via `TemplateView` on both install types, no restart needed after an overlay swap.
- Current live release: `v0.28.2` (`version.py`: `__version__ = '0.28.2'`) — matches the real instance this project has been built and verified against throughout.

## Non-goals (this plan)

- Actually cutting the first real `dispatcharr-easy` release (pushing a real version tag, publishing a real image/release). The workflow is built and reviewed; firing it for real is a separate, later step.
- Auto version-bumping / changelog automation (Dispatcharr's own `release.yml` does this via `workflow_dispatch` + a Python script) — Phase 0 uses a plain `git tag vX.Y.Z && git push --tags`, done manually by a maintainer. Automating this is a future enhancement, not required now.
- Docker Hub publishing (Dispatcharr publishes to both GHCR and Docker Hub) — GHCR only, no reason to add a second registry yet.
- Any change to how the app itself works — this plan is purely about packaging and installing what already exists.

## Architecture

### Version declaration — single source of truth

`COMPATIBLE_DISPATCHARR_VERSION` (repo root, one line: `0.28.2`) is the only place version compatibility is declared. CI reads it once per release and:
- passes it as a Docker build-arg (`DISPATCHARR_VERSION`) so the Dockerfile's `FROM` line pins to it,
- substitutes it into `scripts/install.sh` before publishing that script as a release asset, so the distributed script is self-contained (no runtime fetch of a separate file to learn its own compatible version).

This avoids the two-files-drift-apart failure mode a naive approach would have.

### Docker overlay

`Dockerfile` (repo root):
```
ARG DISPATCHARR_VERSION=0.28.2
FROM ghcr.io/dispatcharr/dispatcharr:${DISPATCHARR_VERSION}
RUN rm -rf /app/frontend/dist
COPY dist/ /app/frontend/dist/
```

`docker-compose.yml` (repo root, aio-style, mirrors Dispatcharr's own `docker-compose.aio.yml` with only the `image:` line changed) — a ready-to-use file for the common single-container case. Install docs separately show the one-line diff for modular-mode users (swap only `web`'s image; leave `celery` on upstream's).

No dry-run/`--apply` concept for Docker — `docker compose up` (after swapping the image tag) is already the user's explicit confirmation step, per the parent spec.

### Bare-metal overlay

`scripts/install.sh`:
1. Takes `APP_DIR` (default `/opt/dispatcharr`).
2. Reads the installed version via `${APP_DIR}/env/bin/python -c "import version; print(version.__version__)"` (run from `$APP_DIR`, matching how Dispatcharr's own `release.yml` reads its version — using the install's real Python rather than fragile text-parsing of `version.py`), compares against the compatible version substituted into the script at release time; warns/aborts on mismatch unless `--force`.
3. Defaults to dry-run: prints what would change (backup path, files to be replaced) without touching anything.
4. On `--apply`: downloads this release's `dist.tar.gz` asset from the matching GitHub Release, backs up the existing `${APP_DIR}/frontend/dist` to a timestamped path, extracts the new build in its place, runs `${APP_DIR}/env/bin/python manage.py collectstatic --noinput` (their own venv, their own command).
5. `--revert`: restores the most recent timestamped backup.
6. No service restart — confirmed above that both install types re-render `index.html` and serve `frontend/dist/assets` fresh per-request.

### CI/CD

`.github/workflows/release.yml`, triggered on `v*` tag push:
1. Build the frontend (`npm ci && npm run build`), package `dist.tar.gz`.
2. Build and push the derived Docker image to `ghcr.io/<owner>/dispatcharr-easy`, tagged `latest` and the pushed version, using the `Dockerfile` above with `DISPATCHARR_VERSION` from `COMPATIBLE_DISPATCHARR_VERSION`.
3. Substitute the compatible version into `scripts/install.sh`.
4. Create a GitHub Release (from the pushed tag) with `dist.tar.gz` and the substituted `install.sh` as assets.

## Testing

- `Dockerfile` / `docker-compose.yml`: verified locally — `docker build`, then a local `docker run` actually serving the SPA. No remote dependency for this part.
- `scripts/install.sh`: dry-run and `--apply`/`--revert` verified for real via SSH against the snapshotted `iptv.hernanco.com` instance — same "manually verified, no automated test" precedent the parent spec already establishes for the one piece that touches a live remote system.
- `.github/workflows/release.yml`: reviewed carefully (YAML/actions lint, local `docker build` reproducing what CI would do) but not fired for real this plan — cutting the actual first release is a separate, later step the user triggers explicitly.

## Error handling

- Bare-metal version mismatch: abort by default, `--force` to override.
- Any failure before `--apply`'s destructive step (download failure, extract failure, version check failure): abort, existing install untouched, nothing partially applied.
- A successful `--apply` always leaves its timestamped backup in place, so `--revert` is always available afterward.
- Docker: no special handling needed — an image that fails to build/push simply doesn't get published; a user's own `docker compose up` failure is their own compose/orchestration concern, unrelated to this project.
