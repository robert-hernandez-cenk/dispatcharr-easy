#!/usr/bin/env bash
set -euo pipefail

REPO="robert-hernandez-cenk/dispatcharr-easy"
# Substituted with the real value by .github/workflows/release.yml before
# this script is published as a release asset. Stays literal in this repo's
# own working copy — do not rely on it being a real version number here.
COMPATIBLE_VERSION="__DISPATCHARR_EASY_COMPATIBLE_VERSION__"
# Substituted the same way, but with this project's OWN release tag (e.g.
# v0.1.0) — independent of COMPATIBLE_VERSION above, which is Dispatcharr's
# version. Used to build the release download URL; do not conflate the two.
RELEASE_TAG="__DISPATCHARR_EASY_RELEASE_TAG__"

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
  # RELEASE_TAG already includes the "v" prefix once substituted with a
  # real tag (e.g. v0.1.0) — do not prepend another one here.
  echo "https://github.com/${REPO}/releases/download/${RELEASE_TAG}/dist.tar.gz"
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

do_revert() {
  local latest
  # shellcheck disable=SC2012 # backup_path()'s own timestamp format never
  # contains glob-breaking characters, so `ls` here is safe; `find` would
  # also be fine but this keeps a single result deterministically first.
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
