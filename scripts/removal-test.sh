#!/usr/bin/env bash
# Removal test: section 20. Removing any single feature must leave the tree green.
#
# The rule this enforces: "add feature = add module + register capability, zero
# core edits" (section 12.1). If deleting one feature breaks the build, the
# architecture has become a God Engine, and every later feature gets more
# expensive to remove rather than less.
#
# Two things get checked per feature, because dropping only one of them gives a
# false pass:
#   1. the feature's entry is removed from the composition root's extensions[]
#   2. the feature's directory is moved away
# Moving the directory alone leaves the composition root importing a missing
# module, so the failure looks like a bundler error rather than an architecture
# violation.
#
# Capability-degraded warnings are EXPECTED after a removal and must not fail the
# run. Only type errors and test failures may.

set -Eeuo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly FEATURES_DIR="${REPO_ROOT}/packages/features"
readonly STASH_DIR="${REPO_ROOT}/.tmp/removal-stash"
readonly TYPECHECK_CMD=(pnpm -r typecheck)
readonly TEST_CMD=(pnpm vitest run --config vitest.unit.config.ts)

# Features to skip, with a reason, so the skip is visible rather than silent.
declare -r SKIP_REASONS=(
  "activity: not a removable feature; it owns the activity log every other feature writes to"
)

declare -a FAILED_FEATURES=()
declare -a SKIPPED_FEATURES=()
MOVED_PATH=""
COMPOSITION_BACKUP=""

# Signal exit codes follow the shell convention of 128 + signal number.
# These are separate traps on purpose: with one `trap cleanup EXIT INT TERM`, a
# signal runs cleanup but `$?` inside it is the status of the last completed
# command, which is 0, so the script exits 0 on a stage that was killed
# partway through and the pipeline records a pass it never earned.
readonly EXIT_CODE_INTERRUPTED=130
readonly EXIT_CODE_TERMINATED=143
readonly EXIT_CODE_SIGHUP=129

cleanup() {
  local exit_code=$1
  restore_in_flight
  # The stash is deliberately left in place on an abnormal exit. It is inside
  # the repo rather than in TMPDIR so recover_stashed_features can find it on the
  # next run, which is the only recovery path for SIGKILL.
  if [[ ${exit_code} -eq 0 ]]; then
    rm -rf "${STASH_DIR}"
  fi
  exit "${exit_code}"
}

restore_in_flight() {
  if [[ -n "${COMPOSITION_BACKUP}" && -f "${COMPOSITION_BACKUP}" ]]; then
    mv "${COMPOSITION_BACKUP}" "${COMPOSITION_BACKUP%.bak}"
    COMPOSITION_BACKUP=""
  fi
  if [[ -n "${MOVED_PATH}" && -d "${STASH_DIR}/$(basename "${MOVED_PATH}")" ]]; then
    mv "${STASH_DIR}/$(basename "${MOVED_PATH}")" "${MOVED_PATH}"
    MOVED_PATH=""
  fi
}

# SIGKILL cannot be trapped, so a hard kill mid-run leaves a feature missing
# from the tree. The next run repairs it before doing anything else, which turns
# an unrecoverable silent deletion into a self-healing one.
recover_stashed_features() {
  [[ -d "${STASH_DIR}" ]] || return 0
  local stashed
  for stashed in "${STASH_DIR}"/*/; do
    [[ -d "${stashed}" ]] || continue
    local name
    name="$(basename "${stashed}")"
    if [[ -e "${FEATURES_DIR}/${name}" ]]; then
      printf 'removal-test: %s is already present; discarding a stale stash entry.\n' "${name}"
      continue
    fi
    printf 'removal-test: recovering %s from an interrupted earlier run.\n' "${name}"
    mv "${stashed}" "${FEATURES_DIR}/${name}"
  done
  rmdir "${STASH_DIR}" 2>/dev/null || true
}

trap 'cleanup $?' EXIT
trap 'cleanup ${EXIT_CODE_INTERRUPTED}' INT
trap 'cleanup ${EXIT_CODE_TERMINATED}' TERM
trap 'cleanup ${EXIT_CODE_SIGHUP}' HUP

# The composition root is created by ba-contract-extension-api-w29. Until it
# exists there is nothing to strip, and the run must SAY SO rather than quietly
# reporting a weaker check as a full one.
readonly COMPOSITION_ROOT="${REPO_ROOT}/packages/core/src/composition.ts"
has_composition_root() {
  [[ -f "${COMPOSITION_ROOT}" ]]
}

should_skip() {
  local feature_name="$1"
  local reason
  for reason in "${SKIP_REASONS[@]}"; do
    if [[ "${reason}" == "${feature_name}:"* ]]; then
      SKIPPED_FEATURES+=("${feature_name} (${reason#*: })")
      return 0
    fi
  done
  return 1
}

strip_from_composition_root() {
  local feature_name="$1"
  has_composition_root || return 0
  COMPOSITION_BACKUP="${COMPOSITION_ROOT}.bak"
  cp "${COMPOSITION_ROOT}" "${COMPOSITION_BACKUP}"
  # The composition root imports each feature as a named import and references it
  # in the extensions array. Remove both lines, matched on the feature name so
  # the edit is scoped to this feature only.
  perl -0pi -e "s/^import \{[^}]*${feature_name}[^}]*\}.*\n//mg" "${COMPOSITION_ROOT}"
  perl -0pi -e "s/^.*\b${feature_name}\(\).*\n//mg" "${COMPOSITION_ROOT}"
}

run_checks() {
  local feature_name="$1"
  ( cd "${REPO_ROOT}" && "${TYPECHECK_CMD[@]}" ) >/dev/null 2>&1 && return 0
  printf '  %s: typecheck FAILED\n' "${feature_name}"
  ( cd "${REPO_ROOT}" && "${TYPECHECK_CMD[@]}" ) 2>&1 | tail -20
  return 1
}

run_tests() {
  local feature_name="$1"
  if ( cd "${REPO_ROOT}" && "${TEST_CMD[@]}" ) >/dev/null 2>&1; then
    return 0
  fi
  printf '  %s: tests FAILED\n' "${feature_name}"
  ( cd "${REPO_ROOT}" && "${TEST_CMD[@]}" ) 2>&1 | tail -30
  return 1
}

main() {
  cd "${REPO_ROOT}"

  recover_stashed_features

  if [[ ! -d "${FEATURES_DIR}" ]]; then
    printf 'removal-test: %s does not exist\n' "${FEATURES_DIR}" >&2
    return 1
  fi

  if ! has_composition_root; then
    printf 'removal-test: NOTE running in DIRECTORY-ONLY mode.\n'
    printf 'removal-test: %s does not exist yet (owned by ba-contract-extension-api-w29).\n' "${COMPOSITION_ROOT#"${REPO_ROOT}/"}"
    printf 'removal-test: directory removal is checked; extensions[] stripping is NOT.\n'
  fi

  local feature_dir
  local feature_name
  local checked=0
  for feature_dir in "${FEATURES_DIR}"/*/; do
    feature_name="$(basename "${feature_dir}")"
    should_skip "${feature_name}" && continue

    printf 'checking removal of %s\n' "${feature_name}"
    MOVED_PATH="${feature_dir%/}"
    strip_from_composition_root "${feature_name}"
    mkdir -p "${STASH_DIR}"
    mv "${MOVED_PATH}" "${STASH_DIR}/${feature_name}"

    local ok=0
    run_checks "${feature_name}" || ok=1
    if [[ ${ok} -eq 0 ]]; then
      run_tests "${feature_name}" || ok=1
    fi

    # Restore before recording the failure, so one bad feature cannot cascade.
    restore_in_flight

    checked=$((checked + 1))
    [[ ${ok} -eq 0 ]] || FAILED_FEATURES+=("${feature_name}")
  done

  printf '\nremoval-test: %d feature(s) checked, %d skipped\n' "${checked}" "${#SKIPPED_FEATURES[@]}"
  local skipped
  for skipped in "${SKIPPED_FEATURES[@]:-}"; do
    [[ -n "${skipped}" ]] && printf '  skipped %s\n' "${skipped}"
  done

  if [[ ${#FAILED_FEATURES[@]} -gt 0 ]]; then
    printf '\nremoval-test FAILED for %d feature(s):\n' "${#FAILED_FEATURES[@]}"
    printf '  %s\n' "${FAILED_FEATURES[@]}"
    printf '\nA feature that cannot be removed is coupled to something outside itself.\n'
    return 1
  fi

  printf 'removal-test: OK\n'
  return 0
}

main "$@"
