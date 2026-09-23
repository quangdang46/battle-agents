#!/usr/bin/env bash
# Fails when a copyleft-encumbered source (MPL-2.0 / Kaetram) reaches the shipped tree.
# The allowlist is MIT, Apache-2.0 and CC0; anything outside it must be rewritten, not pasted.
set -euo pipefail

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
REPO_ROOT="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"

SCAN_ROOTS=()
EXCLUDE_ARGS=()

# An MPL-2.0 file carries a header pointing at the Mozilla Public License, or the
# "This Source Code Form is subject to..." notice that MPL-2.0 section 3.3 requires.
MPL_PATTERN='Mozilla Public License|This Source Code Form is subject to the terms of the Mozilla'

# Kaetram is the agentworld monorepo's game client. Its import paths are unique to that
# project, so any surviving one means a file was pasted rather than rewritten.
KAETRAM_PATTERN='@kaetram/|kaetram/(common|client|server|app|launcher|plugins)'

# Build output and vendored dependencies are not our files, so they are never scanned.
EXCLUDED_DIRS=(node_modules dist .next build coverage .turbo)

resolve_scan_roots() {
  if [ -n "${SCAN_ROOTS_OVERRIDE:-}" ]; then
    read -r -a SCAN_ROOTS <<< "$SCAN_ROOTS_OVERRIDE"
    return
  fi
  SCAN_ROOTS=(packages apps)
}

build_exclude_args() {
  EXCLUDE_ARGS=()
  local dir
  for dir in "${EXCLUDED_DIRS[@]}"; do
    EXCLUDE_ARGS+=("--exclude-dir=$dir")
  done
}

report_violations() {
  local pattern="$1"
  local label="$2"
  local matches

  matches="$(grep -rInE "$pattern" "${SCAN_ROOTS[@]}" "${EXCLUDE_ARGS[@]}" 2>/dev/null || true)"

  if [ -z "$matches" ]; then
    return 0
  fi

  {
    printf 'FAIL: %s found under %s.\n' "$label" "${SCAN_ROOTS[*]}"
    printf 'Only MIT, Apache-2.0 and CC0 sources may be vendored. Study the pattern, then rewrite it.\n\n'
    printf '%s\n' "$matches"
  } >&2
  return 1
}

scan_tree() {
  local root
  local failure=0

  for root in "${SCAN_ROOTS[@]}"; do
    [ -d "$root" ] || printf 'Skipping %s (not present).\n' "$root"
  done

  report_violations "$MPL_PATTERN" "MPL-2.0 header" || failure=1
  report_violations "$KAETRAM_PATTERN" "Kaetram import path" || failure=1

  if [ "$failure" -ne 0 ]; then
    return 1
  fi

  printf 'License check passed: no MPL-2.0 or Kaetram sources under %s.\n' "${SCAN_ROOTS[*]}"
}

assert_rejected() {
  local sandbox="$1"
  local label="$2"

  if ( cd "$sandbox" && SCAN_ROOTS_OVERRIDE="$sandbox/packages" bash "$SCRIPT_PATH" --scan ) >/dev/null 2>&1; then
    printf 'self-test FAIL: %s was accepted; the guard does not work.\n' "$label" >&2
    return 1
  fi

  printf 'self-test ok: %s rejected.\n' "$label"
}

# The guard is only worth its cost if it actually fails. Plant a real MPL header in a
# throwaway repo layout and assert the scanner rejects it.
self_test() {
  local sandbox
  local failure=0

  sandbox="$(mktemp -d)"
  mkdir -p "$sandbox/packages/legal" "$sandbox/packages/copyleft"

  printf 'export const ok = 1;\n' > "$sandbox/packages/legal/clean.ts"
  printf '// MIT License\n// Copyright (c) 2026 Example\n' > "$sandbox/packages/legal/mit.ts"
  printf '// Apache License, Version 2.0, January 2004\n' > "$sandbox/packages/legal/apache.ts"
  printf '// CC0 1.0 Universal\n' > "$sandbox/packages/legal/cc0.ts"

  if ( cd "$sandbox" && SCAN_ROOTS_OVERRIDE="$sandbox/packages" bash "$SCRIPT_PATH" --scan ) >/dev/null 2>&1; then
    printf 'self-test ok: allowlisted MIT, Apache-2.0 and CC0 sources pass.\n'
  else
    printf 'self-test FAIL: a clean allowlisted tree was rejected.\n' >&2
    failure=1
  fi

  cat > "$sandbox/packages/copyleft/planted-mpl.ts" <<'PLANTED'
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
export const planted = true;
PLANTED
  assert_rejected "$sandbox" "planted MPL-2.0 header" || failure=1

  printf "import { config } from '@kaetram/common/config';\n" > "$sandbox/packages/copyleft/kaetram.ts"
  assert_rejected "$sandbox" "Kaetram import path" || failure=1

  rm -rf "$sandbox"
  return "$failure"
}

main() {
  local mode="${1:-}"

  resolve_scan_roots
  build_exclude_args

  case "$mode" in
    --self-test)
      self_test
      ;;
    --scan | "")
      cd "$REPO_ROOT"
      scan_tree
      ;;
    *)
      printf 'Usage: %s [--scan | --self-test]\n' "${0##*/}" >&2
      return 2
      ;;
  esac
}

main "$@"
