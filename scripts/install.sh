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
