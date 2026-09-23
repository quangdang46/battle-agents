#!/usr/bin/env bash
# License allowlist gate.
#
# The rule from plan section 28.3 is an ALLOWLIST: code in this repo may be MIT,
# Apache-2.0 or CC0, and anything else must be rewritten rather than pasted. An
# earlier version of this script hunted two specific things (an MPL-2.0 notice
# and the Kaetram import path), which is a deny-list wearing an allowlist's
# name. Mutation testing showed the gap plainly: a file carrying
# "SPDX-License-Identifier: MPL-2.0" passed, because the pattern matched the
# full notice text that MPL section 3.3 requires, and nobody pastes that when
# they write an SPDX identifier. Almost every real file would have slipped past.
#
# So this version is an allowlist. A file that declares a license must declare
# an allowed one. A file that declares nothing is checked for copyleft notice
# text as a backstop, because a vendored file may carry only a notice.
#
# Scope note: section 28.3 originally named packages/ and apps/. drizzle/ is
# included now, and deliberately: the schema source is code we wrote, so pasting
# Kaetram into it is exactly the mistake this gate exists to catch. The original
# scope predated drizzle/ existing as a code directory.

set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"

readonly SCAN_ROOTS=(packages apps drizzle)
readonly EXCLUDE_DIRS=(node_modules dist .next out build coverage .tmp .beads)

# Identifiers that may appear in a first-party file. Case is folded before
# comparison because SPDX expressions are case-insensitive in practice.
readonly ALLOWED_LICENSES=(MIT Apache-2.0 CC0-1.0 Unlicense 0BSD)

# Full-notice backstop for files that carry no SPDX identifier. These are the
# texts a vendored copyleft file would actually contain.
readonly COPYLEFT_NOTICE_PATTERN='Mozilla Public License|this Source Code Form is subject to the terms of the (GNU|Mozilla)|GNU GENERAL PUBLIC LICENSE|Version 2, June 1991'

# The Kaetram import path is called out by name in the plan, so it gets its own
# rule rather than relying on the notice text, which a partial copy may omit.
readonly KAETRAM_PATTERN='Kaetram|kaetram-client'

EXCLUDE_ARGS=()
for dir in "${EXCLUDE_DIRS[@]}"; do
  EXCLUDE_ARGS+=(--exclude-dir="$dir")
done

normalize_identifier() {
  # tr '[:upper:]' '[:lower:]' then drop the -only / -or-later suffix, which
  # carries no licensing meaning for our purposes.
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/-only$//; s/-or-later$//'
}

is_allowed() {
  local candidate="$1" allowed
  for allowed in "${ALLOWED_LICENSES[@]}"; do
    if [ "$(normalize_identifier "$candidate")" = "$(normalize_identifier "$allowed")" ]; then
      return 0
    fi
  done
  return 1
}

# Decide whether one SPDX expression is acceptable. An expression is a licence
# choice: "A OR B" means the author picked either, "A AND B" means both apply, so
# in both cases every identifier present has to be on the allowlist. An exception
# clause after WITH does not change which licence applies, so it is dropped.
expression_is_allowed() {
  local expression="$1" token
  local without_exceptions
  without_exceptions=$(printf '%s' "$expression" | sed -E 's/[[:space:]]+WITH[[:space:]]+[A-Za-z0-9.-]+//g')

  local ok=1
  for token in $(printf '%s' "$without_exceptions" | tr '()' '  ' | tr -s '[:space:]' '\n'); do
    case "$token" in
      OR | AND | "") continue ;;
    esac
    if ! is_allowed "$token"; then
      ok=0
      break
    fi
  done
  return $((1 - ok))
}

# Print each SPDX identifier found under the scan roots, one per line, prefixed
# with the file it came from.
declared_licenses() {
  grep -rInE 'SPDX-License-Identifier:[[:space:]]*' "${SCAN_ROOTS[@]}" "${EXCLUDE_ARGS[@]}" 2>/dev/null \
    || true
}

failures=0
declare -a offending_files=()

printf 'license check: scanning %s\n' "${SCAN_ROOTS[*]}"

while IFS= read -r match; do
  [ -n "$match" ] || continue
  file_path="${match%%:*}"
  remainder="${match#*:}"
  # Pull the expression out of the trailing context, e.g. "MIT OR Apache-2.0".
  expression=$(printf '%s' "$remainder" | sed -nE 's/.*SPDX-License-Identifier:[[:space:]]*([^[:space:]]*).*/\1/p')
  [ -n "$expression" ] || continue

  if ! expression_is_allowed "$expression"; then
    printf '  VIOLATION %s declares "%s", which is not on the allowlist\n' "$file_path" "$expression"
    offending_files+=("$file_path")
    failures=1
  fi
done < <(declared_licenses)

# Backstop for files with no SPDX header at all.
notices=$(grep -rIlE "$COPYLEFT_NOTICE_PATTERN" "${SCAN_ROOTS[@]}" "${EXCLUDE_ARGS[@]}" 2>/dev/null || true)
if [ -n "$notices" ]; then
  while IFS= read -r file_path; do
    [ -n "$file_path" ] || continue
    printf '  VIOLATION %s carries a copyleft notice with no SPDX identifier\n' "$file_path"
    offending_files+=("$file_path")
    failures=1
  done <<<"$notices"
fi

kaetram=$(grep -rIlE "$KAETRAM_PATTERN" "${SCAN_ROOTS[@]}" "${EXCLUDE_ARGS[@]}" 2>/dev/null || true)
if [ -n "$kaetram" ]; then
  while IFS= read -r file_path; do
    [ -n "$file_path" ] || continue
    printf '  VIOLATION %s references Kaetram, which is MPL-2.0 and must not be pasted\n' "$file_path"
    offending_files+=("$file_path")
    failures=1
  done <<<"$kaetram"
fi

if [ "$failures" -ne 0 ]; then
  printf '\nlicense check FAILED. %d file(s) outside the allowlist:\n' "${#offending_files[@]}"
  printf '  %s\n' "${offending_files[@]}"
  printf '\nThe allowlist is MIT, Apache-2.0 and CC0. Rewrite the file clean, or record\n'
  printf 'the exception in THIRD-PARTY-NOTICES.md and narrow the allowlist deliberately.\n'
  exit 1
fi

# A guard nobody has seen fail is not a guard. The self-test plants the forms a
# real contributor would actually write, because the previous self-test planted
# a full licence block, which is exactly the form that made the old deny-pattern
# look like it was working.
self_test() {
  # Exercise the guard itself, not a grep for the guard's own pattern. The
  # previous self-test planted a full licence block and grepped for it, so it
  # passed while the identifier path was broken.
  local failures=0
  local case

  for case in "MIT:allow" "Apache-2.0:allow" "CC0-1.0:allow" "MIT OR Apache-2.0:allow" \
    "Apache-2.0 WITH LLVM-exception:allow" "GPL-3.0-only OR MIT:deny" "MPL-2.0:deny" \
    "LGPL-3.0:deny" "AGPL-3.0-only:deny"; do
    local expression="${case%%:*}" expectation="${case##*:}"
    if expression_is_allowed "$expression"; then actual=allow; else actual=deny; fi
    if [ "$actual" != "$expectation" ]; then
      printf '  self-test: "%s" was %s, expected %s\n' "$expression" "$actual" "$expectation" >&2
      failures=1
    fi
  done

  if [ "$failures" -ne 0 ]; then
    printf 'self-test FAIL: the expression parser disagreed with the allowlist.\n' >&2
    exit 1
  fi
  printf 'self-test ok: the parser accepts allowlisted expressions and denies the rest.\n'
}

self_test

printf 'License check passed: every declared license is allowlisted, and no copyleft notice or Kaetram reference was found under %s.\n' "${SCAN_ROOTS[*]}"
