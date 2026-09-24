#!/usr/bin/env bash
# Assert that the stage manifest, CANONICAL_STAGES, and the run_stage dispatch
# all describe the same set of stages.
#
# One of the three being edited alone is the failure this guards. Dropping a
# stage from CANONICAL_STAGES disables the check and says nothing: the pipeline
# still runs, still reports green, and the summary simply has one fewer line.
# Adding a stage to the list without a run_stage case makes it fall through to a
# generic failure instead of running its own check.
#
# Comparing the three sets with a single diff rather than a length check is
# deliberate: a length check passes when one stage is removed and another is
# added by accident.

set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly MANIFEST="${REPO_ROOT}/scripts/stages.manifest"
readonly RUNNER="${REPO_ROOT}/scripts/test-m0.sh"

# Collect one value per line into stdout, dropping comments and blanks.
manifest_stages() {
  grep -v -E '^[[:space:]]*(#|$)' "$MANIFEST"
}

declared_stages() {
  sed -n '/CANONICAL_STAGES=(/,/^)/p' "$RUNNER" \
    | grep -v -E 'CANONICAL_STAGES|^[[:space:]]*\)' \
    | tr -d ' \t' \
    | grep -v -E '^[[:space:]]*$'
}

dispatched_stages() {
  sed -n '/^run_stage()/,/^}/p' "$RUNNER" \
    | grep -o -E '^[[:space:]]+[a-z][a-z0-9-]*\)' \
    | sed -E 's/[[:space:]]//g; s/\)$//' \
    | sort -u
}

report_difference() {
  local label=$1
  local left=$2 right=$3
  local only_left only_right
  only_left=$(comm -23 <(printf '%s\n' "$left" | sort) <(printf '%s\n' "$right" | sort))
  only_right=$(comm -13 <(printf '%s\n' "$left" | sort) <(printf '%s\n' "$right" | sort))
  [[ -z "$only_left" && -z "$only_right" ]] && return 0
  [[ -n "$only_left" ]] && printf '  only in the manifest: %s\n' "$(printf '%s' "$only_left" | tr '\n' ' ')" >&2
  [[ -n "$only_right" ]] && printf '  only in %s: %s\n' "$label" "$(printf '%s' "$only_right" | tr '\n' ' ')" >&2
  return 1
}

manifest_text=$(manifest_stages)
[[ -n "$manifest_text" ]] || {
  printf 'stage manifest FAILED: the manifest is empty\n' >&2
  exit 1
}

ok=0
report_difference CANONICAL_STAGES "$manifest_text" "$(declared_stages)" || ok=1
report_difference 'the run_stage dispatch' "$manifest_text" "$(dispatched_stages)" || ok=1

if [[ $ok -ne 0 ]]; then
  printf 'stage manifest FAILED: the three views of the stage set disagree.\n' >&2
  exit 1
fi

count=$(printf '%s\n' "$manifest_text" | grep -c .)
printf 'stage manifest: %d stage(s) agree across the manifest, CANONICAL_STAGES and run_stage.\n' "$count"
