# CI-Release + Docker Overlay Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two overlay install paths (Docker, bare-metal) and the GitHub Actions release pipeline that publishes them, completing Phase 0's distribution scope — so `dispatcharr-easy` can actually be installed onto a real Dispatcharr instance.

**Architecture:** A single-stage `Dockerfile` (repo root) layers this project's built `dist/` onto Dispatcharr's own published image — no frontend build stage needed in the image itself, since CI already builds `dist/` before the Docker step. A bare-metal `scripts/install.sh` (dry-run by default, `--apply`/`--revert`/`--force`) mirrors that same overlay operation for non-Docker installs, downloading a versioned `dist.tar.gz` release asset (or accepting a local one via `--dist-file`, for offline/airgapped installs). Both consume identical release artifacts published by `.github/workflows/release.yml` on `v*` tag push. A single `COMPATIBLE_DISPATCHARR_VERSION` file is the one place Dispatcharr-version compatibility is declared — CI reads it once and threads it into both the Docker build-arg and a placeholder substitution in the published `install.sh`, so the two paths can never drift out of sync with each other.

**Tech Stack:** Plain bash (`scripts/install.sh`), Docker (single-stage `Dockerfile`, `docker-compose.yml`), GitHub Actions (`docker/build-push-action`, `docker/login-action`, `softprops/action-gh-release`) — no new frontend dependencies.

## Global Constraints

- **Docker is not installed on the machine implementing this plan.** Do not attempt to run `docker build`/`docker run`/`docker compose` anywhere in this plan's automated steps — every task's own verification steps are written to not require it. Docker/compose verification is manual code review only (Task 6), not a live build.
- **This plan does not fire a real release.** `.github/workflows/release.yml` (Task 6... wait — see Task numbering below) is built, reviewed, and locally exercised where possible (the frontend build + tarball packaging steps, which need no Docker), but no `v*` tag is pushed as part of this plan. Cutting the actual first release is a separate, later step the user triggers explicitly.
- **GHCR only, no Docker Hub.** Unlike upstream Dispatcharr's own release workflow (which publishes to both), this plan publishes only to `ghcr.io/<owner>/dispatcharr-easy` — no `DOCKERHUB_*` secrets needed.
- **`linux/amd64` only, no multi-arch build.** Upstream Dispatcharr builds `linux/amd64` + `linux/arm64` via QEMU. Multi-arch adds real build-time and workflow complexity this phase doesn't need; it's a natural future enhancement, not required now. Not building it is a deliberate choice, not an oversight — don't add QEMU/buildx multi-platform config.
- **Repo identity, verified against the real upstream and this repo's own remote (2026-08-09, not guessed):** this project's GitHub remote is `robert-hernandez-cenk/dispatcharr-easy`. Upstream Dispatcharr's published image is `ghcr.io/dispatcharr/dispatcharr` (note: no `v` prefix on the version-tagged image, e.g. `0.28.2`, while upstream's own git/release tags use a `v` prefix, e.g. `v0.28.2` — easy to invert, called out explicitly in every task that touches a version string). Dispatcharr's `docker/entrypoint.sh` runs `python manage.py collectstatic --noinput` unconditionally on every container start; its Docker nginx serves `/assets/` from `/app/static` (the collectstatic destination), while its bare-metal nginx config serves `/assets/` via `alias ${APP_DIR}/frontend/dist/assets/` directly — two different mechanisms, both already confirmed by Foundation's design spec to require no service restart after an overlay swap.
- **Compatible Dispatcharr version for this release: `0.28.2`, exact pin** (not a range) — the version this whole project (API schema, live manual testing) has actually been built and verified against.
- **Public repo** — never commit secrets, credentials, or a private instance URL. `scripts/install.sh`'s test harness and this plan's manual-verification tasks must not hardcode a real private hostname anywhere that gets committed.

---

## File structure

```
dispatcharr-easy/
├── COMPATIBLE_DISPATCHARR_VERSION   # single line: "0.28.2"
├── Dockerfile                       # single-stage overlay onto upstream's image
├── .dockerignore
├── docker-compose.yml               # aio-style, mirrors upstream's docker-compose.aio.yml
├── INSTALL.md                       # Docker (aio + modular) and bare-metal install docs
├── scripts/
│   ├── install.sh                   # bare-metal overlay: dry-run (default) / --apply / --revert
│   └── install.test.sh              # bash test harness for install.sh (no bats dependency)
├── .github/workflows/
│   ├── ci.yml                       # existing (Foundation) — gains a shellcheck + install.test.sh step
│   └── release.yml                  # new — builds + publishes on v* tag push
```

---

## Task 1: `COMPATIBLE_DISPATCHARR_VERSION`, `Dockerfile`, `.dockerignore`

**Files:**
- Create: `COMPATIBLE_DISPATCHARR_VERSION`, `Dockerfile`, `.dockerignore`

**Interfaces:**
- Produces: a `DISPATCHARR_VERSION` Docker build-arg (defaulted to the current compatible version, so plain `docker build .` works without extra flags) that Task 6's release workflow overrides explicitly from `COMPATIBLE_DISPATCHARR_VERSION`'s contents.

- [ ] **Step 1: Write the compatible-version file**

Write `COMPATIBLE_DISPATCHARR_VERSION`:

```
0.28.2
```

(No trailing content beyond the version and a single trailing newline — this file is read verbatim by later tasks' tooling.)

- [ ] **Step 2: Write the Dockerfile**

Write `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

# Overlays dispatcharr-easy's built frontend onto Dispatcharr's own published
# image. No frontend build stage here — CI builds dist/ before this step
# (see .github/workflows/release.yml), so this Dockerfile only needs to copy
# an already-built dist/ into place.

ARG DISPATCHARR_VERSION=0.28.2
FROM ghcr.io/dispatcharr/dispatcharr:${DISPATCHARR_VERSION}

# Clean out the base image's own bundled frontend before overlaying ours,
# so no stale hashed assets from Dispatcharr's own build linger alongside
# dispatcharr-easy's (matches upstream's own Dockerfile convention of
# `RUN rm -rf /app/frontend` before copying in a freshly built frontend).
RUN rm -rf /app/frontend/dist
COPY dist/ /app/frontend/dist/
```

(Note: the `ARG DISPATCHARR_VERSION=0.28.2` default duplicates `COMPATIBLE_DISPATCHARR_VERSION`'s content. This is a known, deliberate small duplication — Docker has no native way to read a file into an `ARG` default. Task 6's CI workflow always passes `--build-arg DISPATCHARR_VERSION=$(cat COMPATIBLE_DISPATCHARR_VERSION)` explicitly, so the real published image is never affected by this default; it only matters for someone running `docker build .` locally without extra flags. Whoever bumps `COMPATIBLE_DISPATCHARR_VERSION` in the future should bump this default too — call this out in a code comment, not a TODO, since it's a permanent characteristic of this file, not a temporary gap.)

- [ ] **Step 3: Write `.dockerignore`**

Write `.dockerignore`:

```
node_modules
.git
.worktrees
.superpowers
docs
*.md
.env.local
```

- [ ] **Step 4: Verify with a Dockerfile lint pass (no live build)**

Docker is not installed on this machine — do not attempt `docker build`. Instead, manually verify by reading the file back:

```bash
cat Dockerfile
```

Confirm: the `ARG` line precedes `FROM` (required for build-arg substitution into the base image reference), `FROM` references `ghcr.io/dispatcharr/dispatcharr:${DISPATCHARR_VERSION}` exactly, and both `RUN`/`COPY` lines target `/app/frontend/dist` exactly (matches the path confirmed against Dispatcharr's real `docker/Dockerfile` and `docker/entrypoint.sh`).

- [ ] **Step 5: Commit**

```bash
git add COMPATIBLE_DISPATCHARR_VERSION Dockerfile .dockerignore
git commit -m "Add Dockerfile overlaying dispatcharr-easy's frontend onto Dispatcharr's image"
```

---

## Task 2: `docker-compose.yml` + `INSTALL.md`

**Files:**
- Create: `docker-compose.yml`, `INSTALL.md`

**Interfaces:**
- Consumes: the Docker image tag published by Task 6 (`ghcr.io/robert-hernandez-cenk/dispatcharr-easy:latest`).
- Produces: nothing consumed by later tasks — this is end-user-facing documentation and a ready-to-use compose file, a leaf in the dependency graph.

- [ ] **Step 1: Write `docker-compose.yml`**

Write `docker-compose.yml` (mirrors upstream Dispatcharr's own `docker/docker-compose.aio.yml` verbatim, confirmed against the real file in the Dispatcharr repo, with only the `image:` line changed):

```yaml
services:
  dispatcharr:
    image: ghcr.io/robert-hernandez-cenk/dispatcharr-easy:latest
    restart: unless-stopped
    container_name: dispatcharr
    ports:
      - 9191:9191
    volumes:
      - dispatcharr_data:/data
    environment:
      - DISPATCHARR_ENV=aio
      - REDIS_HOST=localhost
      - CELERY_BROKER_URL=redis://localhost:6379/0
      - DISPATCHARR_LOG_LEVEL=info
      # Legacy CPU Support (Optional)
      # Uncomment to enable legacy NumPy build for older CPUs (circa 2009)
      # that lack support for newer baseline CPU features
      #- USE_LEGACY_NUMPY=true
      # Process Priority Configuration (Optional)
      # Lower values = higher priority. Range: -20 (highest) to 19 (lowest)
      # Negative values require cap_add: SYS_NICE (uncomment below)
      #- UWSGI_NICE_LEVEL=-5   # uWSGI/FFmpeg/Streaming (default: 0, recommended: -5 for high priority)
      #- CELERY_NICE_LEVEL=5   # Celery/EPG/Background tasks (default: 5, low priority)
    #
    # Uncomment to enable high priority for streaming (required if UWSGI_NICE_LEVEL < 0)
    #cap_add:
    #  - SYS_NICE
    # Optional for hardware acceleration
    #devices:
    #  - /dev/dri:/dev/dri  # For Intel/AMD GPU acceleration (VA-API)
    # Uncomment the following lines for NVIDIA GPU support
    # NVidia GPU support (requires NVIDIA Container Toolkit)
    #deploy:
    #  resources:
    #      reservations:
    #          devices:
    #              - driver: nvidia
    #                count: all
    #                capabilities: [gpu]

volumes:
  dispatcharr_data:
```

- [ ] **Step 2: Write `INSTALL.md`**

Write `INSTALL.md`:

```markdown
# Installing dispatcharr-easy

`dispatcharr-easy` is an overlay, not a separate app: it replaces the
contents of Dispatcharr's own `frontend/dist/` with this project's build.
It requires an already-running Dispatcharr instance — this doc assumes you
have one.

**Compatible Dispatcharr version:** 0.28.2. Installing over a different
version may work, but hasn't been verified — the install scripts below
warn (and the bare-metal script aborts, unless you pass `--force`) on a
version mismatch.

## Docker — single container ("all-in-one" / aio mode)

If you're running Dispatcharr's own `docker-compose.aio.yml`, download this
repo's [`docker-compose.yml`](docker-compose.yml) and use it in place of
Dispatcharr's — it's identical except for the `image:` line, which points
at `ghcr.io/robert-hernandez-cenk/dispatcharr-easy` instead of
`ghcr.io/dispatcharr/dispatcharr`. Your existing `dispatcharr_data` volume
is unaffected.

```bash
docker compose down
# swap in dispatcharr-easy's docker-compose.yml
docker compose up -d
```

## Docker — modular mode (separate web/celery/db/redis containers)

Only the `web` service serves HTTP and static assets — `celery` never
needs the overlay. In your existing `docker-compose.yml`, change only the
`web` service's `image:` line:

```diff
   web:
-    image: ghcr.io/dispatcharr/dispatcharr:latest
+    image: ghcr.io/robert-hernandez-cenk/dispatcharr-easy:latest
```

Leave `celery`'s `image:` pointed at upstream — it doesn't need to change.

```bash
docker compose up -d web
```

## Bare-metal / LXC

If you installed Dispatcharr via its own `debian_install.sh`
(default `APP_DIR=/opt/dispatcharr`):

```bash
curl -fsSL https://github.com/robert-hernandez-cenk/dispatcharr-easy/releases/latest/download/install.sh -o install.sh
chmod +x install.sh

# Preview what would change — makes no changes yet.
./install.sh

# Apply it for real.
sudo ./install.sh --apply
```

`--apply` backs up your current `frontend/dist` to a timestamped path
before installing the new one, so you can always undo:

```bash
sudo ./install.sh --revert
```

If `APP_DIR` isn't `/opt/dispatcharr`, set it:

```bash
APP_DIR=/srv/dispatcharr sudo -E ./install.sh
```
```

- [ ] **Step 3: Verify**

```bash
cat docker-compose.yml
cat INSTALL.md
```

Confirm `docker-compose.yml`'s only difference from upstream's `docker-compose.aio.yml` is the `image:` line, and `INSTALL.md`'s three install paths (Docker aio, Docker modular, bare-metal) each reference the correct file/command from this plan's other tasks.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml INSTALL.md
git commit -m "Add docker-compose.yml and install documentation"
```

---

## Task 3: `scripts/install.sh` — scaffold, version check, dry-run

**Files:**
- Create: `scripts/install.sh`, `scripts/install.test.sh`

**Interfaces:**
- Produces: `install.sh`'s CLI surface (`--apply`, `--revert`, `--force`, `--dist-file PATH`, `--help`, `APP_DIR` env var) — Tasks 4 and 5 extend the same file, adding real behavior behind the `--apply`/`--revert` branches this task scaffolds as no-ops-so-far (this task only implements dry-run; `--apply`/`--revert` are added by name but their bodies come in later tasks). `scripts/install.test.sh` is a plain bash test harness (no bats dependency — confirmed not installed on this machine) that Tasks 4 and 5 both append test cases to.
- The script's placeholder `COMPATIBLE_VERSION="__DISPATCHARR_EASY_COMPATIBLE_VERSION__"` is substituted by Task 6's release workflow before publishing — in this repo's own working copy it stays literal. Task 3's tests must not depend on this substitution having happened (see Step 2 — tests set `COMPATIBLE_VERSION` via a controllable path, not by relying on the placeholder).

This task is TDD, but for a bash script rather than a Vitest suite — write the test harness first, run it against a not-yet-existing `install.sh` to confirm it fails, then implement.

- [ ] **Step 1: Write the failing test harness**

Write `scripts/install.test.sh`:

```bash
#!/usr/bin/env bash
# Test harness for install.sh. Plain bash (no bats) — every assertion
# is a manual exit-code/output check, run as: bash scripts/install.test.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_SH="$SCRIPT_DIR/install.sh"

PASS=0
FAIL=0

assert_eq() {
  local expected="$1" actual="$2" msg="$3"
  if [[ "$expected" == "$actual" ]]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $msg"
    echo "  expected: $expected"
    echo "  actual:   $actual"
  fi
}

assert_exit_zero() {
  local exit_code="$1" msg="$2"
  if [[ "$exit_code" == "0" ]]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $msg (expected exit 0, got $exit_code)"
  fi
}

assert_exit_nonzero() {
  local exit_code="$1" msg="$2"
  if [[ "$exit_code" != "0" ]]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $msg (expected nonzero exit, got 0)"
  fi
}

assert_contains() {
  local haystack="$1" needle="$2" msg="$3"
  if [[ "$haystack" == *"$needle"* ]]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $msg"
    echo "  expected output to contain: $needle"
  fi
}

# Sets up a fake Dispatcharr install at $1, reporting installed version $2.
setup_fake_app_dir() {
  local dir="$1" version="$2"
  rm -rf "$dir"
  mkdir -p "$dir/frontend/dist/assets" "$dir/env/bin"
  echo '<html>old</html>' >"$dir/frontend/dist/index.html"
  echo 'old-asset' >"$dir/frontend/dist/assets/old.js"

  cat >"$dir/version.py" <<EOF
"""Fake version.py for install.sh tests."""
__version__ = '${version}'
EOF

  # Fake env/bin/python: understands the two invocations install.sh makes.
  # Parses version.py with grep/sed rather than sourcing it, since it's
  # real (space-containing) Python assignment syntax, not bash syntax.
  cat >"$dir/env/bin/python" <<'PYEOF'
#!/usr/bin/env bash
set -uo pipefail
if [[ "${1:-}" == "-c" && "${2:-}" == "import version; print(version.__version__)" ]]; then
  grep "__version__" "$(dirname "$0")/../../version.py" | sed -E "s/__version__ = '([^']+)'.*/\1/"
elif [[ "${1:-}" == "manage.py" && "${2:-}" == "collectstatic" ]]; then
  echo "collectstatic ran" >>"$(dirname "$0")/../../collectstatic.log"
  exit 0
else
  echo "unexpected python invocation: $*" >&2
  exit 1
fi
PYEOF
  chmod +x "$dir/env/bin/python"
}

# Creates a fake dist.tar.gz at $1 with content that's distinguishable
# from setup_fake_app_dir's "old" content.
setup_fake_dist_tarball() {
  local path="$1"
  local tmp
  tmp="$(mktemp -d)"
  echo '<html>new</html>' >"$tmp/index.html"
  mkdir -p "$tmp/assets"
  echo 'new-asset' >"$tmp/assets/new.js"
  tar -czf "$path" -C "$tmp" .
  rm -rf "$tmp"
}

echo "=== dry-run tests ==="

# Dry run with matching version makes no changes and exits 0.
TMP1="$(mktemp -d)"
setup_fake_app_dir "$TMP1/app" "0.28.2"
OUTPUT=$(APP_DIR="$TMP1/app" bash "$INSTALL_SH" 2>&1)
EXIT=$?
assert_exit_zero "$EXIT" "dry-run exits 0 on matching version"
assert_eq "old-asset" "$(cat "$TMP1/app/frontend/dist/assets/old.js")" "dry-run does not modify frontend/dist"
assert_contains "$OUTPUT" "Dry run" "dry-run output mentions 'Dry run'"
rm -rf "$TMP1"

# Dry run with mismatched version aborts (nonzero exit), still makes no changes.
TMP2="$(mktemp -d)"
setup_fake_app_dir "$TMP2/app" "0.27.0"
OUTPUT=$(APP_DIR="$TMP2/app" bash "$INSTALL_SH" 2>&1)
EXIT=$?
assert_exit_nonzero "$EXIT" "dry-run aborts on version mismatch"
assert_eq "old-asset" "$(cat "$TMP2/app/frontend/dist/assets/old.js")" "aborted dry-run does not modify frontend/dist"
rm -rf "$TMP2"

# --help exits 0 and prints usage.
OUTPUT=$(bash "$INSTALL_SH" --help 2>&1)
EXIT=$?
assert_exit_zero "$EXIT" "--help exits 0"
assert_contains "$OUTPUT" "Usage:" "--help output contains 'Usage:'"

# Unknown flag exits nonzero.
OUTPUT=$(bash "$INSTALL_SH" --nonsense 2>&1)
EXIT=$?
assert_exit_nonzero "$EXIT" "unknown flag exits nonzero"

echo ""
echo "Passed: $PASS, Failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bash scripts/install.test.sh
```

Expected: fails immediately — `scripts/install.sh` doesn't exist yet, so every `bash "$INSTALL_SH"` invocation errors with "No such file or directory" and every assertion after it fails too.

- [ ] **Step 3: Implement the scaffold, version check, and dry-run mode**

Write `scripts/install.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO="robert-hernandez-cenk/dispatcharr-easy"
# Substituted with the real value by .github/workflows/release.yml before
# this script is published as a release asset. Stays literal in this repo's
# own working copy — do not rely on it being a real version number here.
COMPATIBLE_VERSION="__DISPATCHARR_EASY_COMPATIBLE_VERSION__"

APP_DIR="${APP_DIR:-/opt/dispatcharr}"
MODE="dry-run"
FORCE=0
DIST_FILE=""

usage() {
  cat <<'EOF'
Usage: install.sh [--apply|--revert] [--force] [--dist-file PATH] [--help]

  (no flags)     Dry run: print what would change, touch nothing.
  --apply        Back up the current overlay and install the new one.
  --revert       Restore the most recent backup made by --apply.
  --force        Skip the Dispatcharr version compatibility check.
  --dist-file PATH
                 Use a local dist.tar.gz instead of downloading one
                 (useful for offline hosts or pre-vetted installs).
  --help         Show this message.

Environment:
  APP_DIR        Dispatcharr install directory (default: /opt/dispatcharr)
EOF
}

log() { echo "$@" >&2; }

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --apply)
        MODE="apply"
        shift
        ;;
      --revert)
        MODE="revert"
        shift
        ;;
      --force)
        FORCE=1
        shift
        ;;
      --dist-file)
        DIST_FILE="$2"
        shift 2
        ;;
      --help)
        usage
        exit 0
        ;;
      *)
        log "[ERROR] Unknown argument: $1"
        usage
        exit 1
        ;;
    esac
  done
}

installed_version() {
  (cd "$APP_DIR" && env/bin/python -c "import version; print(version.__version__)")
}

check_version() {
  local installed
  if ! installed=$(installed_version 2>/dev/null); then
    log "[ERROR] Could not determine the installed Dispatcharr version in $APP_DIR."
    log "        Is APP_DIR correct? Does $APP_DIR/env/bin/python exist?"
    exit 1
  fi
  if [[ "$installed" != "$COMPATIBLE_VERSION" ]]; then
    if [[ "$FORCE" -eq 1 ]]; then
      log "[WARN] Installed Dispatcharr version ($installed) does not match the version this release was verified against ($COMPATIBLE_VERSION). Continuing because --force was given."
    else
      log "[ERROR] Installed Dispatcharr version ($installed) does not match the version this release was verified against ($COMPATIBLE_VERSION)."
      log "        Re-run with --force to proceed anyway."
      exit 1
    fi
  fi
}

release_url() {
  echo "https://github.com/${REPO}/releases/download/v${COMPATIBLE_VERSION}/dist.tar.gz"
}

backup_path() {
  echo "${APP_DIR}/frontend/dist.backup.$(date -u +%Y%m%dT%H%M%SZ)"
}

do_dry_run() {
  check_version
  log "Dry run — no changes will be made."
  log "  Would back up: ${APP_DIR}/frontend/dist -> $(backup_path)"
  if [[ -n "$DIST_FILE" ]]; then
    log "  Would install from local file: $DIST_FILE"
  else
    log "  Would download: $(release_url)"
  fi
  log "  Would run: (cd $APP_DIR && env/bin/python manage.py collectstatic --noinput)"
}

do_apply() {
  log "[ERROR] --apply is not yet implemented."
  exit 1
}

do_revert() {
  log "[ERROR] --revert is not yet implemented."
  exit 1
}

main() {
  parse_args "$@"
  case "$MODE" in
    dry-run) do_dry_run ;;
    apply) do_apply ;;
    revert) do_revert ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
```

- [ ] **Step 4: Make it executable and run the test harness to verify it passes**

```bash
chmod +x scripts/install.sh
bash scripts/install.test.sh
```

Expected: `Passed: 8, Failed: 0` — 4 test cases, 8 assertions total: 3 in the matching-version dry-run test (exit-zero, unmodified dist, "Dry run" in output), 2 in the mismatch test (exit-nonzero, unmodified dist), 2 for `--help` (exit-zero, "Usage:" in output), 1 for the unknown-flag test (exit-nonzero).

- [ ] **Step 5: Run shellcheck**

```bash
shellcheck scripts/install.sh scripts/install.test.sh
```

Expected: no warnings/errors. If shellcheck flags something, fix it — don't suppress with an inline disable comment unless the flagged pattern is genuinely intentional (e.g. the test harness's fake python stub's `$(dirname "$0")` pattern is fine as-is).

- [ ] **Step 6: Commit**

```bash
git add scripts/install.sh scripts/install.test.sh
git commit -m "Add install.sh scaffold: version check and dry-run mode"
```

---

## Task 4: `scripts/install.sh` — `--apply`

**Files:**
- Modify: `scripts/install.sh`, `scripts/install.test.sh`

**Interfaces:**
- Consumes: `check_version`, `backup_path`, `release_url`, `DIST_FILE`, `APP_DIR` from Task 3's scaffold.
- Produces: a working `do_apply` that Task 5's `--revert` relies on having actually run first (its own tests apply-then-revert in sequence).

**Cross-task contract Task 6 must match exactly:** the tarball `do_apply` extracts is expected to contain the built site's files **flat at the tarball root** (i.e. `tar -tzf dist.tar.gz` lists `index.html`, `assets/...`, not `dist/index.html`). Task 6 must package it with `tar -czf dist.tar.gz -C dist .` (note the `-C dist .`, not `tar -czf dist.tar.gz dist/`) — verified locally in Step 4 below by round-tripping a real tarball through this exact extraction logic before Task 6 exists, so Task 6's own packaging step has a concrete, already-tested target to match rather than discovering a mismatch after the fact.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/install.test.sh`, before the final `echo ""` / `echo "Passed..."` / exit lines:

```bash
echo "=== --apply tests ==="

# --apply with --dist-file replaces dist and backs up the old one.
TMP3="$(mktemp -d)"
setup_fake_app_dir "$TMP3/app" "0.28.2"
setup_fake_dist_tarball "$TMP3/dist.tar.gz"
OUTPUT=$(APP_DIR="$TMP3/app" bash "$INSTALL_SH" --apply --dist-file "$TMP3/dist.tar.gz" 2>&1)
EXIT=$?
assert_exit_zero "$EXIT" "--apply exits 0"
assert_eq "new-asset" "$(cat "$TMP3/app/frontend/dist/assets/new.js" 2>/dev/null)" "--apply installs the new dist"
BACKUP=$(ls -1d "$TMP3/app/frontend/dist.backup."* 2>/dev/null | head -n1 || true)
if [[ -n "$BACKUP" ]]; then
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
  echo "FAIL: --apply creates a timestamped backup"
fi
assert_eq "old-asset" "$(cat "${BACKUP}/assets/old.js" 2>/dev/null)" "backup contains the old dist"
assert_eq "collectstatic ran" "$(cat "$TMP3/app/collectstatic.log" 2>/dev/null)" "--apply runs collectstatic"
rm -rf "$TMP3"

# --apply aborts on version mismatch without --force, makes no changes.
TMP4="$(mktemp -d)"
setup_fake_app_dir "$TMP4/app" "0.27.0"
setup_fake_dist_tarball "$TMP4/dist.tar.gz"
OUTPUT=$(APP_DIR="$TMP4/app" bash "$INSTALL_SH" --apply --dist-file "$TMP4/dist.tar.gz" 2>&1)
EXIT=$?
assert_exit_nonzero "$EXIT" "--apply aborts on version mismatch"
assert_eq "old-asset" "$(cat "$TMP4/app/frontend/dist/assets/old.js")" "aborted --apply does not modify frontend/dist"
rm -rf "$TMP4"

# --apply --force proceeds despite version mismatch.
TMP5="$(mktemp -d)"
setup_fake_app_dir "$TMP5/app" "0.27.0"
setup_fake_dist_tarball "$TMP5/dist.tar.gz"
OUTPUT=$(APP_DIR="$TMP5/app" bash "$INSTALL_SH" --apply --force --dist-file "$TMP5/dist.tar.gz" 2>&1)
EXIT=$?
assert_exit_zero "$EXIT" "--apply --force exits 0 despite version mismatch"
assert_eq "new-asset" "$(cat "$TMP5/app/frontend/dist/assets/new.js" 2>/dev/null)" "--apply --force installs the new dist"
rm -rf "$TMP5"

# --apply with a nonexistent --dist-file aborts cleanly, makes no changes.
TMP6="$(mktemp -d)"
setup_fake_app_dir "$TMP6/app" "0.28.2"
OUTPUT=$(APP_DIR="$TMP6/app" bash "$INSTALL_SH" --apply --dist-file "$TMP6/does-not-exist.tar.gz" 2>&1)
EXIT=$?
assert_exit_nonzero "$EXIT" "--apply aborts when --dist-file does not exist"
assert_eq "old-asset" "$(cat "$TMP6/app/frontend/dist/assets/old.js")" "--apply with missing --dist-file does not modify frontend/dist"
rm -rf "$TMP6"
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bash scripts/install.test.sh
```

Expected: the new `--apply` tests fail (`do_apply` currently just prints "not yet implemented" and exits 1) — specifically the exit-zero assertions and the file-content assertions fail; the two abort-path tests (version mismatch, missing `--dist-file`) may incidentally already pass since `do_apply` currently always exits nonzero, but they're passing for the wrong reason at this point — that's expected and fine, Step 4 will make them pass for the right reason.

- [ ] **Step 3: Implement `do_apply`**

In `scripts/install.sh`, replace the placeholder `do_apply` function body:

```bash
do_apply() {
  check_version

  if [[ ! -d "${APP_DIR}/frontend/dist" ]]; then
    log "[ERROR] ${APP_DIR}/frontend/dist does not exist — is APP_DIR correct?"
    exit 1
  fi

  local tarball
  local downloaded=0
  if [[ -n "$DIST_FILE" ]]; then
    if [[ ! -f "$DIST_FILE" ]]; then
      log "[ERROR] --dist-file $DIST_FILE not found."
      exit 1
    fi
    tarball="$DIST_FILE"
  else
    tarball="$(mktemp)"
    downloaded=1
    log "Downloading $(release_url) ..."
    if ! curl -fsSL -o "$tarball" "$(release_url)"; then
      log "[ERROR] Download failed. Nothing has been changed."
      rm -f "$tarball"
      exit 1
    fi
  fi

  local backup
  backup="$(backup_path)"
  log "Backing up ${APP_DIR}/frontend/dist -> $backup"
  mv "${APP_DIR}/frontend/dist" "$backup"

  local extract_dir
  extract_dir="$(mktemp -d)"
  if ! tar -xzf "$tarball" -C "$extract_dir"; then
    log "[ERROR] Failed to extract $tarball. Restoring backup."
    mv "$backup" "${APP_DIR}/frontend/dist"
    rm -rf "$extract_dir"
    [[ "$downloaded" -eq 1 ]] && rm -f "$tarball"
    exit 1
  fi

  mkdir -p "${APP_DIR}/frontend/dist"
  mv "$extract_dir"/* "${APP_DIR}/frontend/dist"/
  # rm -rf, not rmdir: robust even if a future build ever emits a hidden
  # dotfile that the mv glob above wouldn't match (rmdir would then fail
  # on a non-empty directory and, under set -e, wrongly report the whole
  # --apply as failed even though the real work already succeeded).
  rm -rf "$extract_dir"
  [[ "$downloaded" -eq 1 ]] && rm -f "$tarball"

  log "Running collectstatic..."
  if ! (cd "$APP_DIR" && env/bin/python manage.py collectstatic --noinput); then
    log "[ERROR] collectstatic failed. Restoring backup."
    rm -rf "${APP_DIR}/frontend/dist"
    mv "$backup" "${APP_DIR}/frontend/dist"
    exit 1
  fi

  log "Done. Previous version backed up at: $backup"
  log "Run with --revert to undo."
}
```

- [ ] **Step 4: Run the test harness to verify it passes**

```bash
bash scripts/install.test.sh
```

Expected: all tests pass, including the new `--apply` tests. This is also the moment the cross-task contract noted above gets exercised for real: `setup_fake_dist_tarball` packages with `tar -czf "$path" -C "$tmp" .` (flat root) and `do_apply` extracts with `tar -xzf "$tarball" -C "$extract_dir"` then `mv "$extract_dir"/* ...` (expecting flat root) — confirm the `new-asset` assertions actually pass, proving this pairing is correct before Task 6 needs to replicate the packaging half.

- [ ] **Step 5: Run shellcheck**

```bash
shellcheck scripts/install.sh scripts/install.test.sh
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add scripts/install.sh scripts/install.test.sh
git commit -m "Implement install.sh --apply"
```

---

## Task 5: `scripts/install.sh` — `--revert`, wire into CI

**Files:**
- Modify: `scripts/install.sh`, `scripts/install.test.sh`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `do_apply` from Task 4 (revert tests apply first, then revert, to set up a real backup to revert to).
- Produces: nothing new consumed by later tasks — this closes out `install.sh`'s three modes. Adds `shellcheck` and `bash scripts/install.test.sh` as CI steps so future changes to this script are guarded automatically (mirrors Foundation's own precedent of every piece of logic being covered by CI, not just introduced-then-forgotten).

- [ ] **Step 1: Write the failing tests**

Append to `scripts/install.test.sh`, before the final `echo ""` / `echo "Passed..."` / exit lines:

```bash
echo "=== --revert tests ==="

# --revert restores the most recent backup.
TMP7="$(mktemp -d)"
setup_fake_app_dir "$TMP7/app" "0.28.2"
setup_fake_dist_tarball "$TMP7/dist.tar.gz"
APP_DIR="$TMP7/app" bash "$INSTALL_SH" --apply --dist-file "$TMP7/dist.tar.gz" >/dev/null 2>&1
OUTPUT=$(APP_DIR="$TMP7/app" bash "$INSTALL_SH" --revert 2>&1)
EXIT=$?
assert_exit_zero "$EXIT" "--revert exits 0"
assert_eq "old-asset" "$(cat "$TMP7/app/frontend/dist/assets/old.js" 2>/dev/null)" "--revert restores the pre-apply dist"
rm -rf "$TMP7"

# --revert with no backup aborts cleanly.
TMP8="$(mktemp -d)"
setup_fake_app_dir "$TMP8/app" "0.28.2"
OUTPUT=$(APP_DIR="$TMP8/app" bash "$INSTALL_SH" --revert 2>&1)
EXIT=$?
assert_exit_nonzero "$EXIT" "--revert aborts when there is no backup"
rm -rf "$TMP8"

# --revert preserves the reverted-from dist rather than deleting it.
TMP9="$(mktemp -d)"
setup_fake_app_dir "$TMP9/app" "0.28.2"
setup_fake_dist_tarball "$TMP9/dist.tar.gz"
APP_DIR="$TMP9/app" bash "$INSTALL_SH" --apply --dist-file "$TMP9/dist.tar.gz" >/dev/null 2>&1
APP_DIR="$TMP9/app" bash "$INSTALL_SH" --revert >/dev/null 2>&1
REVERTED=$(ls -1d "$TMP9/app/frontend/dist.reverted."* 2>/dev/null | head -n1 || true)
if [[ -n "$REVERTED" ]]; then
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
  echo "FAIL: --revert preserves the reverted-from dist under dist.reverted.*"
fi
assert_eq "new-asset" "$(cat "${REVERTED}/assets/new.js" 2>/dev/null)" "the preserved reverted-from dist still contains the applied content"
rm -rf "$TMP9"
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bash scripts/install.test.sh
```

Expected: the new `--revert` tests fail — `do_revert` currently just prints "not yet implemented" and exits 1.

- [ ] **Step 3: Implement `do_revert`**

In `scripts/install.sh`, replace the placeholder `do_revert` function body:

```bash
do_revert() {
  local latest
  latest="$(ls -1dt "${APP_DIR}"/frontend/dist.backup.* 2>/dev/null | head -n1 || true)"
  if [[ -z "$latest" ]]; then
    log "[ERROR] No backup found in ${APP_DIR}/frontend/. Nothing to revert."
    exit 1
  fi

  local reverted
  reverted="${APP_DIR}/frontend/dist.reverted.$(date -u +%Y%m%dT%H%M%SZ)"
  log "Moving current ${APP_DIR}/frontend/dist -> $reverted"
  mv "${APP_DIR}/frontend/dist" "$reverted"
  log "Restoring $latest -> ${APP_DIR}/frontend/dist"
  mv "$latest" "${APP_DIR}/frontend/dist"

  log "Running collectstatic..."
  if ! (cd "$APP_DIR" && env/bin/python manage.py collectstatic --noinput); then
    log "[ERROR] collectstatic failed after revert. Your site may be in an inconsistent state."
    log "        The reverted-from version is saved at: $reverted"
    exit 1
  fi

  log "Done. Reverted to: $latest"
}
```

- [ ] **Step 4: Run the test harness to verify it passes**

```bash
bash scripts/install.test.sh
```

Expected: all tests pass.

- [ ] **Step 5: Run shellcheck**

```bash
shellcheck scripts/install.sh scripts/install.test.sh
```

Expected: clean.

- [ ] **Step 6: Wire shellcheck and the test harness into CI**

Edit `.github/workflows/ci.yml`, adding two steps after the existing `npm run build` step (same job, so a shellcheck/script regression fails the same CI run as a frontend regression):

```yaml
      - run: npm run build
      - name: Install shellcheck
        run: sudo apt-get update && sudo apt-get install -y shellcheck
      - run: shellcheck scripts/install.sh scripts/install.test.sh
      - run: bash scripts/install.test.sh
```

- [ ] **Step 7: Verify the CI addition doesn't break anything else**

```bash
cat .github/workflows/ci.yml
```

Confirm the new steps are appended after the existing four (checkout/setup-node/npm ci/lint/format:check/test/build), same job, same indentation level as the existing `- run:` steps.

- [ ] **Step 8: Commit**

```bash
git add scripts/install.sh scripts/install.test.sh .github/workflows/ci.yml
git commit -m "Implement install.sh --revert; wire shellcheck and install tests into CI"
```

- [ ] **Step 9: Push and confirm CI passes on the real GitHub Actions runner**

```bash
git push
```

Then check the Actions tab (or `gh run list --limit 1` / `gh run watch`) and confirm the `CI` workflow succeeds on the pushed commit — this is the first real confirmation that `shellcheck`'s actual apt-get install step works on a real `ubuntu-latest` runner (this machine has shellcheck via a different install method, so this is genuinely new coverage, not a re-check of something already verified locally).

---

## Task 6: `.github/workflows/release.yml`

**Files:**
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: `COMPATIBLE_DISPATCHARR_VERSION` (Task 1), `Dockerfile`'s `DISPATCHARR_VERSION` build-arg (Task 1), `scripts/install.sh`'s `__DISPATCHARR_EASY_COMPATIBLE_VERSION__` placeholder (Task 3) — this task is the one place that placeholder actually gets substituted with a real value.
- Produces: on a `v*` tag push — a GHCR image (`ghcr.io/robert-hernandez-cenk/dispatcharr-easy:latest` and `:<tag>`), a GitHub Release with `dist.tar.gz` and `install.sh` (substituted) as assets. **Not fired in this plan** — see Global Constraints.

- [ ] **Step 1: Write the release workflow**

Write `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write
  packages: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm

      - run: npm ci
      - run: npm run build

      - name: Package the built frontend
        run: tar -czf dist.tar.gz -C dist .

      - name: Read compatible Dispatcharr version
        id: compat
        run: echo "version=$(cat COMPATIBLE_DISPATCHARR_VERSION)" >> "$GITHUB_OUTPUT"

      - name: Substitute compatible version into install.sh
        run: |
          sed "s/__DISPATCHARR_EASY_COMPATIBLE_VERSION__/${{ steps.compat.outputs.version }}/" \
            scripts/install.sh > install.sh
          chmod +x install.sh

      - name: Set lowercase image name
        run: echo "IMAGE=ghcr.io/$(echo '${{ github.repository }}' | tr '[:upper:]' '[:lower:]')" >> "$GITHUB_ENV"

      - name: Log in to GHCR
        uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v4

      - name: Build and push Docker image
        uses: docker/build-push-action@v7
        with:
          context: .
          push: true
          build-args: |
            DISPATCHARR_VERSION=${{ steps.compat.outputs.version }}
          tags: |
            ${{ env.IMAGE }}:latest
            ${{ env.IMAGE }}:${{ github.ref_name }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            dist.tar.gz
            install.sh
```

- [ ] **Step 2: Verify the pieces that don't require Docker, for real, locally**

Docker is not installed on this machine — the `docker/login-action`/`docker/build-push-action` steps cannot be exercised locally. Verify everything up to that point actually works:

```bash
npm ci
npm run build
tar -czf dist.tar.gz -C dist .
tar -tzf dist.tar.gz | head -5
cat COMPATIBLE_DISPATCHARR_VERSION
sed "s/__DISPATCHARR_EASY_COMPATIBLE_VERSION__/$(cat COMPATIBLE_DISPATCHARR_VERSION)/" scripts/install.sh > /tmp/install-substituted.sh
grep "COMPATIBLE_VERSION=" /tmp/install-substituted.sh
rm -f dist.tar.gz /tmp/install-substituted.sh
```

Expected: `tar -tzf dist.tar.gz | head -5` shows `index.html` and/or `assets/` at the tarball root (not nested under a `dist/` prefix — this is the exact contract Task 4 already tested against, confirm the real `npm run build` output round-trips the same way). `grep "COMPATIBLE_VERSION="` on the substituted script shows `COMPATIBLE_VERSION="0.28.2"` (the placeholder replaced with a real value, not the literal placeholder string).

- [ ] **Step 3: Manually review the Docker-touching steps**

Read `docker/login-action@v4`, `docker/setup-buildx-action@v4`, and `docker/build-push-action@v7`'s usage above against this checklist (do not attempt to run them):
- `permissions: packages: write` is present at the workflow level (required for `GITHUB_TOKEN` to push to GHCR).
- `docker/login-action`'s `password` is `secrets.GITHUB_TOKEN`, not a hardcoded value or a different secret name.
- `docker/build-push-action`'s `context: .` matches where `dist/` was just built (repo root), and `build-args` passes `DISPATCHARR_VERSION` explicitly (overriding the `Dockerfile`'s own default from Task 1 — confirm this is intentional and matches Task 1's comment about the workflow always overriding the default).
- The two `tags:` lines produce `ghcr.io/robert-hernandez-cenk/dispatcharr-easy:latest` and `ghcr.io/robert-hernandez-cenk/dispatcharr-easy:v1.2.3`-shaped tags (using `github.ref_name`, which for a tag-triggered push IS the tag name itself, e.g. `v1.2.3` — confirm this isn't confused with `github.ref`, which would instead be `refs/tags/v1.2.3`, the wrong value here).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "Add release workflow (builds and publishes on v* tag push)"
```

Per this plan's Global Constraints, do **not** push a `v*` tag as part of this task — that fires the real workflow, which is explicitly out of scope for this plan.

---

## Task 7: Manual verification — Docker (code review, no live build)

Not automated, and per this plan's Global Constraints, not a live `docker build` either (Docker isn't installed on this machine). This task is a thorough, checklist-driven manual read-through — the closest available substitute for a live build in this environment.

- [ ] **Step 1: Re-read the whole `Dockerfile` end-to-end**

Confirm, line by line:
- `ARG DISPATCHARR_VERSION=0.28.2` precedes `FROM` (required — an `ARG` referenced inside `FROM` must be declared before it).
- `FROM ghcr.io/dispatcharr/dispatcharr:${DISPATCHARR_VERSION}` — no typo in the registry/image path (compare byte-for-byte against Task 1's Step 4 verification).
- `RUN rm -rf /app/frontend/dist` and `COPY dist/ /app/frontend/dist/` target the exact path confirmed against Dispatcharr's real `docker/Dockerfile`/`docker/entrypoint.sh` (`/app/frontend/dist`), not `/app/frontend` (too broad — would also delete Dispatcharr's own `frontend/src`, `frontend/package.json`, etc., which this project has no business touching) or `/app/static` (wrong — that's the `collectstatic` destination, not the `STATICFILES_DIRS` source).

- [ ] **Step 2: Re-read `docker-compose.yml` end-to-end**

Confirm it's identical to Dispatcharr's own `docker-compose.aio.yml` (fetched fresh via `gh api repos/Dispatcharr/Dispatcharr/contents/docker/docker-compose.aio.yml -H "Accept: application/vnd.github.raw"` to compare against, in case upstream has changed since this plan was written) except for the `image:` line.

```bash
gh api repos/Dispatcharr/Dispatcharr/contents/docker/docker-compose.aio.yml -H "Accept: application/vnd.github.raw" > /tmp/upstream-aio.yml
diff /tmp/upstream-aio.yml docker-compose.yml
rm -f /tmp/upstream-aio.yml
```

Expected: the only diff line is the `image:` value.

- [ ] **Step 3: Re-verify the version-tag convention against the real GHCR-publishing workflow**

```bash
gh api repos/Dispatcharr/Dispatcharr/contents/.github/workflows/release.yml -H "Accept: application/vnd.github.raw" | grep -A2 "tags: |"
```

Confirm upstream's own published version tags have no `v` prefix (e.g. `0.28.2`, not `v0.28.2`) — this plan's `Dockerfile`/`COMPATIBLE_DISPATCHARR_VERSION` must reference `0.28.2` (bare) when pulling `ghcr.io/dispatcharr/dispatcharr:${DISPATCHARR_VERSION}`, while `dispatcharr-easy`'s own git/release tags use a `v` prefix per Task 6 (`v*` trigger, `github.ref_name` used as-is for the published image tag). These are two independent version numbers with two independent conventions — confirm Task 1 and Task 6 each use the correct one for their own context and haven't cross-contaminated the prefix convention.

- [ ] **Step 4: Record the result**

No commit needed — this task produces no repo changes. If Step 2 or 3 finds upstream has drifted from what this plan assumed, stop and reconcile before considering this plan complete (update the affected task's files, re-run that task's own verification, then return here).

---

## Task 8: Manual verification — `install.sh` against a real instance

Not automated — this is the one piece that actually touches a live remote system, same precedent as Foundation's Task 11 and the app-shell-dashboard plan's Task 10.

Ask the user for SSH connection details (host, user, auth method) to the snapshotted bare-metal/LXC test instance before starting this task — this plan does not hardcode them anywhere.

- [ ] **Step 1: Confirm the installed Dispatcharr version matches what this plan assumes**

```bash
ssh <host> "cd /opt/dispatcharr && env/bin/python -c 'import version; print(version.__version__)'"
```

Expected: `0.28.2` (or, if the snapshot is on a different version, note the actual version — later steps' "mismatch" behavior then becomes the thing under test instead of the "matches" behavior; adjust which scenario you're confirming accordingly, but confirm both dry-run outcomes matter and don't skip either).

- [ ] **Step 2: Copy the (unsubstituted, dev-branch) `install.sh` to the instance and dry-run it**

The placeholder in this branch's `scripts/install.sh` isn't substituted yet (that only happens in a real release, Task 6, not fired in this plan) — for this manual check, substitute it locally first so the version check is meaningful:

```bash
sed "s/__DISPATCHARR_EASY_COMPATIBLE_VERSION__/$(cat COMPATIBLE_DISPATCHARR_VERSION)/" scripts/install.sh > /tmp/install-real.sh
scp /tmp/install-real.sh <host>:/tmp/install.sh
ssh <host> "chmod +x /tmp/install.sh && /tmp/install.sh"
```

Expected: prints the dry-run plan (backup path, download URL, collectstatic command) and exits 0, with no files on the remote instance touched. Confirm via:

```bash
ssh <host> "ls -la /opt/dispatcharr/frontend/dist/ | head -5"
```

before and after the dry-run — output should be identical.

- [ ] **Step 3: Apply it for real, using this branch's own build as the `--dist-file`**

```bash
npm run build
tar -czf /tmp/dist.tar.gz -C dist .
scp /tmp/dist.tar.gz <host>:/tmp/dist.tar.gz
ssh <host> "sudo /tmp/install.sh --apply --dist-file /tmp/dist.tar.gz"
```

Expected: exits 0, prints the backup path it created. Confirm the overlay actually took effect by loading the instance's URL in a browser and checking for `dispatcharr-easy`'s UI (the Mantine-based login/dashboard from the app-shell-dashboard plan) rather than Dispatcharr's own stock frontend.

- [ ] **Step 4: Confirm `--revert` restores Dispatcharr's own stock frontend**

```bash
ssh <host> "sudo /tmp/install.sh --revert"
```

Expected: exits 0. Reload the instance's URL in a browser — confirm it's back to Dispatcharr's own stock UI, not `dispatcharr-easy`'s.

- [ ] **Step 5: Clean up remote temp files**

```bash
ssh <host> "rm -f /tmp/install.sh /tmp/dist.tar.gz"
rm -f /tmp/install-real.sh /tmp/dist.tar.gz
```

- [ ] **Step 6: Record the result**

No commit needed — this task produces no repo changes (beyond the temp files cleaned up in Step 5). If any step didn't match the expected behavior, stop and reconcile before considering this plan complete.

---

## Self-review notes

- **Spec coverage:** the design spec's Docker overlay (Tasks 1, 2, 7), bare-metal overlay with dry-run/`--apply`/`--revert` (Tasks 3-5, 8), versioning via a single compatible-version declaration (Task 1, threaded through Tasks 3 and 6), and the CI/CD release pipeline (Task 6) are all covered. The spec's explicit non-goals (real release firing, Docker Hub, multi-arch) are honored — none of them appear anywhere in this plan's tasks.
- **Placeholder scan:** no TBD/"add error handling"/"similar to Task N" — every step has literal file contents or literal commands with expected output. The one intentional placeholder (`__DISPATCHARR_EASY_COMPATIBLE_VERSION__` inside `scripts/install.sh`) is a real runtime mechanism substituted by Task 6, explicitly documented as such everywhere it appears — not a plan-authoring gap.
- **Type/interface consistency:** `install.sh`'s CLI surface (`--apply`, `--revert`, `--force`, `--dist-file`, `APP_DIR` env var) is defined once in Task 3 and used identically by Tasks 4, 5, and 8's manual verification. The tarball-packaging contract (flat root, via `tar -czf ... -C dist .`) is defined and tested in Task 4 (via the test harness's `setup_fake_dist_tarball`) before Task 6 needs to replicate it for real — Task 6's Step 2 explicitly re-verifies the real `npm run build` output round-trips through the same packaging command. `COMPATIBLE_DISPATCHARR_VERSION`'s value (`0.28.2`) is referenced identically by Task 1's Dockerfile `ARG` default and Task 6's `--build-arg`/`install.sh` substitution — both read the same file, never a hardcoded duplicate value.
