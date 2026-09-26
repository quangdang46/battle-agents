#!/usr/bin/env bash
# Assert that, for EVERY milestone pipeline, the stage manifest,
# CANONICAL_STAGES, and the run_stage dispatch all describe the same set of
# stages.
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
#
# ## Why this is one script over N pipelines rather than a copy per pipeline
#
# The M2 and M4 runners were written after this one, and each could have had its
# own copy of it. A copy is a second convention with its own bugs and no
# relationship to the first: fixing the sed range here would leave the milestone
# one accepting a dispatch that names a runner nobody registered. §40's amendment
# moved the bounty and replay assertions OUT of the M0 smoke; it did not say the
# M0 smoke's definition of a trustworthy stage set stops applying to them.
#
# M0 is the first entry and keeps its own manifest and runner. Its behaviour is
# unchanged: same files, same three-way comparison, same message. The only thing
# that differs is that the comparison now runs once per pipeline, so one broken
# pipeline cannot be reported as a passing check because another agreed.

set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly REPO_ROOT

# id, manifest path, runner path. M0 first and unchanged; the milestone runners
# are the 2026-09-24 amendment of plan section 40 landing in the tree.
readonly PIPELINES=(
  "m0:scripts/stages.manifest:scripts/test-m0.sh"
  "m2:scripts/stages-m2.manifest:scripts/test-m2.sh"
  "m4:scripts/stages-m4.manifest:scripts/test-m4.sh"
)

# Collect one value per line into stdout, dropping comments and blanks.
manifest_stages() {
  grep -v -E '^[[:space:]]*(#|$)' "$1"
}

declared_stages() {
  sed -n '/CANONICAL_STAGES=(/,/^)/p' "$1" \
    | grep -v -E 'CANONICAL_STAGES|^[[:space:]]*\)' \
    | tr -d ' \t' \
    | grep -v -E '^[[:space:]]*$'
}

dispatched_stages() {
  sed -n '/^run_stage()/,/^}/p' "$1" \
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

check_one() {
  local id=$1 manifest=$2 runner=$3
  local manifest_text count ok=0

  manifest_text=$(manifest_stages "$manifest")

  if [[ -z "$manifest_text" ]]; then
    printf 'stage manifest FAILED (%s): the manifest is empty\n' "$id" >&2
    return 1
  fi

  if ! report_difference "$id CANONICAL_STAGES" "$manifest_text" "$(declared_stages "$runner")"; then
    ok=1
  fi
  if ! report_difference "the $id run_stage dispatch" "$manifest_text" "$(dispatched_stages "$runner")"; then
    ok=1
  fi

  if [[ $ok -ne 0 ]]; then
    printf 'stage manifest FAILED (%s): the three views of the stage set disagree.\n' "$id" >&2
    return 1
  fi

  count=$(printf '%s\n' "$manifest_text" | grep -c .)
  printf 'stage manifest %s: %d stage(s) agree across the manifest, CANONICAL_STAGES and run_stage.\n' \
    "$id" "$count"
  return 0
}

ok=0
for entry in "${PIPELINES[@]}"; do
  IFS=':' read -r id manifest_rel runner_rel <<<"$entry"
  manifest="${REPO_ROOT}/${manifest_rel}"
  runner="${REPO_ROOT}/${runner_rel}"

  # Both absent means the pipeline does not exist here — a checkout from before
  # the milestone runners, or one where they have been deleted along with
  # everything else. Skipping is right, because there is no stage set to disagree
  # with. EXACTLY ONE absent is not skippable: a runner with no manifest has no
  # definition of what must run, and a manifest with no runner is a list nobody
  # checks. Either way a stage could be dropped silently, which is the failure.
  if [ ! -f "$manifest" ] && [ ! -f "$runner" ]; then
    continue
  fi
  if [ ! -f "$manifest" ] || [ ! -f "$runner" ]; then
    missing=$([ -f "$manifest" ] && printf '%s' "$runner_rel" || printf '%s' "$manifest_rel")
    printf 'stage manifest FAILED (%s): %s is missing while the other half exists.\n' "$id" "$missing" >&2
    ok=1
    continue
  fi

  check_one "$id" "$manifest" "$runner" || ok=1
done

if [[ $ok -ne 0 ]]; then
  exit 1
fi
