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
# The fake installed version is set to install.sh's own literal, un-substituted
# placeholder (this repo's working copy never runs the release-time
# substitution), so the version check matches without needing to override
# anything in install.sh itself.
TMP1="$(mktemp -d)"
setup_fake_app_dir "$TMP1/app" "__DISPATCHARR_EASY_COMPATIBLE_VERSION__"
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

echo "=== --apply tests ==="

# --apply with --dist-file replaces dist and backs up the old one.
# Matching version, per the pattern established above: use install.sh's own
# literal, un-substituted placeholder rather than a real version number.
TMP3="$(mktemp -d)"
setup_fake_app_dir "$TMP3/app" "__DISPATCHARR_EASY_COMPATIBLE_VERSION__"
setup_fake_dist_tarball "$TMP3/dist.tar.gz"
OUTPUT=$(APP_DIR="$TMP3/app" bash "$INSTALL_SH" --apply --dist-file "$TMP3/dist.tar.gz" 2>&1)
EXIT=$?
assert_exit_zero "$EXIT" "--apply exits 0"
assert_eq "new-asset" "$(cat "$TMP3/app/frontend/dist/assets/new.js" 2>/dev/null)" "--apply installs the new dist"
# shellcheck disable=SC2012 # backup_path()'s own timestamp format never
# contains glob-breaking characters, so `ls` here is safe; `find` would
# also be fine but this keeps a single result deterministically first.
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
# Matching version, so this exercises the missing-file check itself rather
# than incidentally aborting on a version mismatch first.
TMP6="$(mktemp -d)"
setup_fake_app_dir "$TMP6/app" "__DISPATCHARR_EASY_COMPATIBLE_VERSION__"
OUTPUT=$(APP_DIR="$TMP6/app" bash "$INSTALL_SH" --apply --dist-file "$TMP6/does-not-exist.tar.gz" 2>&1)
EXIT=$?
assert_exit_nonzero "$EXIT" "--apply aborts when --dist-file does not exist"
assert_eq "old-asset" "$(cat "$TMP6/app/frontend/dist/assets/old.js")" "--apply with missing --dist-file does not modify frontend/dist"
rm -rf "$TMP6"

echo "=== --revert tests ==="

# --revert restores the most recent backup.
# Matching version, per the pattern established above (TMP1/TMP3/TMP6): use
# install.sh's own literal, un-substituted placeholder rather than a real
# version number, so --apply actually succeeds and leaves a real backup for
# --revert to act on (a mismatched version here would make --apply abort
# silently, and this test would then "pass" without genuinely exercising
# revert's restore behavior).
TMP7="$(mktemp -d)"
setup_fake_app_dir "$TMP7/app" "__DISPATCHARR_EASY_COMPATIBLE_VERSION__"
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
# Matching version, same reasoning as TMP7 above.
TMP9="$(mktemp -d)"
setup_fake_app_dir "$TMP9/app" "__DISPATCHARR_EASY_COMPATIBLE_VERSION__"
setup_fake_dist_tarball "$TMP9/dist.tar.gz"
APP_DIR="$TMP9/app" bash "$INSTALL_SH" --apply --dist-file "$TMP9/dist.tar.gz" >/dev/null 2>&1
APP_DIR="$TMP9/app" bash "$INSTALL_SH" --revert >/dev/null 2>&1
# shellcheck disable=SC2012 # do_revert's own timestamp format never
# contains glob-breaking characters, so `ls` here is safe; `find` would
# also be fine but this keeps a single result deterministically first.
REVERTED=$(ls -1d "$TMP9/app/frontend/dist.reverted."* 2>/dev/null | head -n1 || true)
if [[ -n "$REVERTED" ]]; then
  PASS=$((PASS + 1))
else
  FAIL=$((FAIL + 1))
  echo "FAIL: --revert preserves the reverted-from dist under dist.reverted.*"
fi
assert_eq "new-asset" "$(cat "${REVERTED}/assets/new.js" 2>/dev/null)" "the preserved reverted-from dist still contains the applied content"
rm -rf "$TMP9"

echo ""
echo "Passed: $PASS, Failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
