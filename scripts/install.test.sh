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

echo ""
echo "Passed: $PASS, Failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
