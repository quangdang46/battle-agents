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
WEB_PACKAGE_BACKUP=""
TSCONFIG_BACKUP=""
readonly WEB_PACKAGE="${REPO_ROOT}/apps/web/package.json"
readonly TSCONFIG_PATH="${REPO_ROOT}/tsconfig.json"

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
  release_lock
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
  if [[ -n "${WEB_PACKAGE_BACKUP}" && -f "${WEB_PACKAGE_BACKUP}" ]]; then
    mv "${WEB_PACKAGE_BACKUP}" "${WEB_PACKAGE_BACKUP%.removal-bak}"
    WEB_PACKAGE_BACKUP=""
  fi
  if [[ -n "${TSCONFIG_BACKUP}" && -f "${TSCONFIG_BACKUP}" ]]; then
    mv "${TSCONFIG_BACKUP}" "${TSCONFIG_BACKUP%.removal-bak}"
    TSCONFIG_BACKUP=""
  fi
  if [[ -n "${MOVED_PATH}" && -d "${STASH_DIR}/$(basename "${MOVED_PATH}")" ]]; then
    # The destination must not exist before the restore. "pnpm -r typecheck"
    # recreates the package directory it just lost, including a node_modules
    # symlink farm, and "mv src dst" onto an existing directory nests the source
    # inside it as dst/src. That leaves the tracked files relocated and git
    # reporting the originals as deleted. The stash holds the real content, so
    # anything sitting at the destination at this point is rebuild output.
    if [[ -e "${MOVED_PATH}" ]]; then
      rm -rf -- "${MOVED_PATH}"
    fi
    mv "${STASH_DIR}/$(basename "${MOVED_PATH}")" "${MOVED_PATH}"
    MOVED_PATH=""
  fi
}

# Whether a directory is a real feature rather than a rebuild stub.
#
# This distinction is the whole recovery. "Does the directory exist" is the
# wrong test: `pnpm -r typecheck`, which this script runs after moving a feature
# away, recreates the package directory — package.json, node_modules symlink
# farm, dist — with NO src/ and NO tsconfig.json. A run interrupted in that
# window left the real source in the stash and a stub in the tree, and the
# previous version of this function saw the stub, declared the feature present,
# and discarded the only copy of its source. The tree then failed typecheck for
# a reason nothing in the tree could explain.
#
# A feature is real when it has both a tsconfig and a src/ directory, because
# every one in this repo has both and a rebuild stub has neither.
feature_is_present() {
  local dir="$1"
  [[ -d "${dir}" && -d "${dir}/src" && -f "${dir}/tsconfig.json" ]]
}

# SIGKILL cannot be trapped, so a hard kill mid-run leaves a feature missing
# from the tree. The next run repairs it before doing anything else, which turns
# an unrecoverable silent deletion into a self-healing one.
#
# The two directories are parameters so the self-test can drive this against a
# temp tree. The old version read them from readonly globals, which meant the
# one function that can restore deleted source was the one function nobody could
# exercise — and it is the function that had a bug in it.
recover_stashed_features() {
  local features_dir="${1:-${FEATURES_DIR}}"
  local stash_dir="${2:-${STASH_DIR}}"
  [[ -d "${stash_dir}" ]] || return 0
  local stashed
  for stashed in "${stash_dir}"/*/; do
    [[ -d "${stashed}" ]] || continue
    local name
    name="$(basename "${stashed}")"
    if feature_is_present "${features_dir}/${name}"; then
      printf 'removal-test: %s is already present; discarding a stale stash entry.\n' "${name}"
      continue
    fi
    if [[ -e "${features_dir}/${name}" ]]; then
      # A stub, not a feature. Removing it is safe precisely because the real
      # content is in the stash we are about to move into its place.
      printf 'removal-test: %s exists as a rebuild stub with no source; replacing it from the stash.\n' "${name}"
      rm -rf -- "${features_dir:?}/${name}"
    fi
    printf 'removal-test: recovering %s from an interrupted earlier run.\n' "${name}"
    mv "${stashed}" "${features_dir}/${name}"
  done
  rmdir "${stash_dir}" 2>/dev/null || true
}

# Two removal tests at once corrupt the tree, and the corruption is silent.
#
# Each run moves a feature into STASH_DIR, runs `pnpm -r typecheck` — which
# recreates the package directory as a stub — and moves it back. Two runs
# interleaving those steps fight over the same directory: one restores a feature
# while the other has just moved it away, and the source ends up in a stash
# nobody reads, or in a directory with the wrong contents. The pipeline's
# EXIT trap restores what IT moved, so a run killed outright leaves the tree
# short a feature and the next run is expected to heal it.
#
# mkdir is the lock primitive because it is atomic on POSIX, and a lock left by
# a killed run is reclaimed by checking whether the holder is still alive. A
# plain lock file would deadlock the tree permanently after one hard kill, which
# is a worse failure than the one it prevents.
readonly LOCK_DIR="${REPO_ROOT}/.tmp/removal-test.lock"
LOCK_HELD=0

lock_holder_is_alive() {
  local pid="$1"
  [[ "${pid}" =~ ^[0-9]+$ ]] || return 1
  kill -0 "${pid}" 2>/dev/null
}

acquire_lock() {
  if mkdir "${LOCK_DIR}" 2>/dev/null; then
    printf '%s\n' "$$" >"${LOCK_DIR}/pid"
    LOCK_HELD=1
    return 0
  fi
  local holder=""
  [[ -f "${LOCK_DIR}/pid" ]] && holder="$(cat "${LOCK_DIR}/pid" 2>/dev/null || true)"
  if lock_holder_is_alive "${holder}"; then
    printf 'removal-test: refusing to start — another run (pid %s) holds the lock.\n' "${holder}" >&2
    printf 'removal-test: two runs at once silently corrupt packages/features.\n' >&2
    return 1
  fi
  printf 'removal-test: reclaiming a lock left by dead pid %s.\n' "${holder:-unknown}" >&2
  rm -rf -- "${LOCK_DIR:?}"
  mkdir "${LOCK_DIR}" 2>/dev/null || {
    printf 'removal-test: could not take the lock after reclaiming it.\n' >&2
    return 1
  }
  printf '%s\n' "$$" >"${LOCK_DIR}/pid"
  LOCK_HELD=1
  return 0
}

release_lock() {
  if [[ "${LOCK_HELD}" = "1" ]]; then
    rm -rf -- "${LOCK_DIR:?}"
    LOCK_HELD=0
  fi
}

trap 'cleanup $?' EXIT
trap 'cleanup ${EXIT_CODE_INTERRUPTED}' INT
trap 'cleanup ${EXIT_CODE_TERMINATED}' TERM
trap 'cleanup ${EXIT_CODE_SIGHUP}' HUP

# The composition root is created by ba-contract-extension-api-w29. Until it
# exists there is nothing to strip, and the run must SAY SO rather than quietly
# reporting a weaker check as a full one.
#
# It lives in apps/web, not packages/core. Core is forbidden from importing a
# feature (the no-core-import-of-outer-layers rule), so a composition root
# inside core could only ever compose an empty list, and the extensions[]
# half of this test would report green while checking nothing.
readonly COMPOSITION_ROOT="${REPO_ROOT}/apps/web/src/composition.ts"
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
  local target="${2:-${COMPOSITION_ROOT}}"
  [[ -f "${target}" ]] || return 0
  # Only the real composition root needs backing up: restore_in_flight puts it
  # back between features, and the self-test works on a throwaway copy it
  # deletes itself.
  if [ "${target}" = "${COMPOSITION_ROOT}" ]; then
    COMPOSITION_BACKUP="${COMPOSITION_ROOT}.bak"
    cp "${COMPOSITION_ROOT}" "${COMPOSITION_BACKUP}"
    # The workspace wiring is backed up here because the strip below edits it.
    # Restoring the composition root alone would leave a removed feature's
    # dependency and path entry deleted for good, and the next run would fail on
    # a tree the operator never asked to change.
    WEB_PACKAGE_BACKUP="${WEB_PACKAGE}.removal-bak"
    TSCONFIG_BACKUP="${TSCONFIG_PATH}.removal-bak"
    cp "${WEB_PACKAGE}" "${WEB_PACKAGE_BACKUP}"
    cp "${TSCONFIG_PATH}" "${TSCONFIG_BACKUP}"
  fi
  # The composition root imports each feature as a named import and lists its
  # factory call alone on one line in the extensions array. Both lines go.
  #
  # The import is matched on its module specifier, not on the imported name, and
  # covers `import type {` as well: a feature whose types the root needs gets a
  # second import line, and leaving that behind failed the removal test for a
  # reason that had nothing to do with coupling.
  # Matching the name looks more direct and is wrong: the word boundary that
  # makes it safe also means it cannot match "agentFeature", so the import
  # survived, the extensions entry was stripped, and the removal test failed
  # with "cannot find name agentFeature" instead of saying what it meant. The
  # specifier names the package, so it has exactly one spelling.
  #
  # The extensions[] pattern handles an entry written on one line and an entry
  # prettier wrapped across several, because a feature with dependencies is
  # exactly the one whose call is too long to stay on one line, and a strip that
  # only matched the short form would fail the removal test for a feature that
  # is perfectly removable.
  #
  # It allows any suffix on the factory name, since the directory is named after
  # the feature rather than after the factory, and stops at the entry's own
  # closing so it cannot swallow a neighbour. The lazy match means it ends at the
  # FIRST `)` that ends a line, which is the entry's own in the shape this
  # script produces — a nested call ending a line would confuse it, and that
  # shows up as a removal-test failure rather than a silent pass.
  #
  # The backslash before @ is for perl, which would otherwise read @battle as
  # an array in the pattern and interpolate it to nothing.
  perl -0pi -e "s/^import (?:type )?\{[^}]*\} from ['\"]\@battle-agents\/${feature_name}['\"];\r?\n//mg" "${target}"
  # The wrapped form was written with an unclosed non-capturing group: the
  # `(?:` opens a group and the `\)` inside it is a literal parenthesis, so
  # the group never closed and perl refused the whole expression. It failed
  # SILENTLY in the way that matters: the script kept going and reported a
  # clean run while this half stripped nothing. The self-test could not see it
  # because it only asserts on the import line, and that half worked. Both
  # halves of a guard have to be seen failing, or one of them is decoration.
  perl -0pi -e "s/^[ \t]*\b${feature_name}\w*\(.*?\)[ \t]*,?[ \t]*\n|^[ \t]*\b${feature_name}\w*\(.*?\n(?:.*?\n)*?[ \t]*\}[ \t]*,?[ \t]*\n//msg" "${target}"
}

# A feature is wired into four places, not two. The two above are in the
# composition root; a third is the workspace dependency and a fourth is the
# source alias the test stages resolve it through.
#
# This was found the hard way: composing a second feature made the removal test
# fail for `agent` with a typecheck error and for `animation` with a dangling
# tsconfig path, neither of which had anything to do with coupling. The strip was
# still the two-line one, so every feature added after the first made the test
# report a false failure. A test that cries wolf is one people learn to skip.
strip_workspace_wiring() {
  local feature_name="$1"
  local package_json="${2:-${WEB_PACKAGE}}"
  local tsconfig="${2:-${TSCONFIG_PATH}}"

  # The dependency line and the path entry are each one line, and both name the
  # package the directory is named after. Single-quoted perl with the name
  # interpolated by perl itself, because the double-quoted form here breaks on
  # the quotes inside the pattern.
  [ -f "${package_json}" ] &&
    perl -0pi -e 's/^\s*"\@battle-agents\/'"${feature_name}"'"\s*:\s*"workspace:\*[^"]*",?\r?\n//mg' "${package_json}"
  [ -f "${tsconfig}" ] &&
    perl -0pi -e 's/^\s*"\@battle-agents\/'"${feature_name}"'"\s*:\s*\[[^\]]*\],?\r?\n//mg' "${tsconfig}"
  # …and then the comma the entry LEAVED behind, which is the one case the
  # pattern above cannot see. It removes the entry together with its own
  # trailing comma, so removing any entry but the LAST leaves valid JSON — and
  # removing the last one leaves the previous entry's comma with nothing after
  # it, which JSON rejects, and `tsc` never gets far enough to report a
  # coupling that does not exist.
  #
  # This is the same false failure the comment above this function records
  # having been fixed once already, arriving for the other end of the list: a
  # feature whose tsconfig path sorts last (`world`) is unremovable, and the
  # failure names a parse error rather than the real cause. A comma directly
  # before a closing brace is always wrong in JSON, so matching that is narrow
  # and cannot damage a valid file.
  [ -f "${tsconfig}" ] &&
    perl -0pi -e 's/,\r?\n([ \t]*\})/$1/g' "${tsconfig}"
}

# A guard nobody has seen fail is not a guard, and this one had never been seen
# fail: the composition root's extensions[] array was empty, so the stripping
# half of every run was a no-op against nothing. The import half shipped broken
# in exactly that state — it matched `\bagent\b`, which cannot match
# `agentFeature`, so the import survived while the entry was removed and the
# failure surfaced as "cannot find name" rather than as a passing check.
#
# This runs the real strip function over a throwaway composition root, so the
# patterns are exercised for what they are: text transformations, with no
# package to create, no dependency to link and no typecheck to wait for.
self_test() {
  local work_dir failures=0 name
  work_dir="$(mktemp -d)"
  local fixture="${work_dir}/composition.ts"

  cat >"${fixture}" <<'FIXTURE'
import { createRuntime } from '@battle-agents/core';
import { agentFeature } from '@battle-agents/agent';
import { questFeature } from '@battle-agents/quest';

export function createGameRuntime(dependencies: Dependencies): Runtime {
  return createRuntime({
    extensions: [
      agentFeature(),
      questFeature(),
    ],
    store: dependencies.store,
  });
}
FIXTURE

  strip_from_composition_root agent "${fixture}"

  # The factory NAME at a call, not `agent\w*()`: the leftover this has to
  # catch is `agentFeature({` — a wrapped call whose closing paren is not on the
  # line it opened on — and a pattern that requires the paren on the same line
  # does not see it. That is precisely the shape an earlier strip could not
  # remove, and a self-test that cannot see it passes on a broken strip.
  if grep -qE "@battle-agents/agent|\bagent\w*\(" "${fixture}"; then
    printf '  self-test: stripping agent left a reference behind:\n' >&2
    sed 's/^/    /' "${fixture}" >&2
    failures=1
  fi
  if ! grep -q "@battle-agents/quest" "${fixture}"; then
    printf '  self-test: stripping agent also removed quest\n' >&2
    failures=1
  fi
  if ! grep -q "@battle-agents/core" "${fixture}"; then
    printf '  self-test: stripping agent also removed the core import\n' >&2
    failures=1
  fi

  # A feature the composition root does not use must leave it byte-identical.
  cp "${fixture}" "${work_dir}/before-absent.ts"
  strip_from_composition_root bounty "${fixture}"
  if ! cmp -s "${fixture}" "${work_dir}/before-absent.ts"; then
    printf '  self-test: stripping an absent feature changed the file\n' >&2
    diff "${work_dir}/before-absent.ts" "${fixture}" >&2 || true
    failures=1
  fi

  rm -rf "${work_dir}"
  if [ "${failures}" -ne 0 ]; then
    printf 'removal-test self-test FAILED: the composition-root strip is not sound.\n' >&2
    return 1
  fi
  printf 'self-test ok: stripping removes exactly one feature and leaves the rest byte-identical.\n'
}

# The recovery path, against a temp tree.
#
# This exists because the recovery HAD a bug and no test. It treated "the
# directory exists" as "the feature is present", and the directory a rebuild
# leaves behind does exist — with package.json and dist and no source. An
# interrupted run therefore discarded the only copy of a feature's source and
# left a tree that failed typecheck for a reason nothing in it could explain.
#
# The stub shape below is the real one: what `pnpm -r typecheck` recreates after
# a feature's directory is moved away.
self_test_recovery() {
  local work_dir failures=0
  work_dir="$(mktemp -d)"
  local features="${work_dir}/features" stash="${work_dir}/stash"
  mkdir -p "${features}" "${stash}"

  # A real feature, moved away by an interrupted run.
  mkdir -p "${stash}/quest/src"
  printf 'export const quest = 1;\n' >"${stash}/quest/src/index.ts"
  printf '{}\n' >"${stash}/quest/package.json"
  printf '{}\n' >"${stash}/quest/tsconfig.json"

  # ... and the stub `pnpm -r typecheck` recreated in its place. A directory, a
  # package.json and a dist, and no source: exactly the state that made the old
  # check declare the feature present.
  mkdir -p "${features}/quest/dist"
  printf '{}\n' >"${features}/quest/package.json"

  recover_stashed_features "${features}" "${stash}" >/dev/null 2>&1

  if [[ ! -f "${features}/quest/src/index.ts" ]]; then
    printf '  recovery self-test: the stash entry was discarded over a rebuild stub,\n'
    printf '    which is how a features directory lost its only copy of its source.\n' >&2
    failures=1
  fi
  if ! feature_is_present "${features}/quest"; then
    printf '  recovery self-test: the recovered feature is still not a feature.\n' >&2
    failures=1
  fi

  # A real feature in the tree means the stash entry IS stale, and discarding it
  # is correct. Checking the other half matters: a recovery that always
  # overwrites would undo a legitimate change.
  mkdir -p "${stash}/bounty/src" "${features}/bounty/src"
  printf 'export const bounty = 1;\n' >"${stash}/bounty/src/index.ts"
  printf '{}\n' >"${features}/bounty/tsconfig.json"
  printf 'export const kept = 1;\n' >"${features}/bounty/src/index.ts"

  recover_stashed_features "${features}" "${stash}" >/dev/null 2>&1

  if grep -q 'bounty = 1' "${features}/bounty/src/index.ts" 2>/dev/null; then
    printf '  recovery self-test: a stale stash entry overwrote a real feature.\n' >&2
    failures=1
  fi

  rm -rf "${work_dir}"
  if [[ ${failures} -ne 0 ]]; then
    printf 'removal-test recovery self-test FAILED: an interrupted run could not heal itself.\n' >&2
    return 1
  fi
  printf 'recovery self-test ok: a stub is replaced from the stash, and a real feature is left alone.\n'
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

# Snapshot the tracked tree so a run that damages it cannot report green.
tree_signature() {
  git -C "${REPO_ROOT}" status --porcelain --untracked-files=no 2>/dev/null \
    | shasum -a 256 2>/dev/null | cut -d" " -f1
}

main() {
  cd "${REPO_ROOT}"
  local tree_before
  tree_before=$(tree_signature)

  # Before the recovery, not after: recovery MOVES directories, and it must not
  # run while another run is doing the same.
  acquire_lock || return 1

  recover_stashed_features

  self_test
  self_test_recovery

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
    strip_workspace_wiring "${feature_name}"
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

  local tree_after
  tree_after=$(tree_signature)
  if [[ "$tree_before" != "$tree_after" ]]; then
    printf '\nremoval-test FAILED: the tracked tree was not restored to its starting state.\n'
    printf '  expected %s, found %s\n' "$tree_before" "$tree_after"
    git -C "${REPO_ROOT}" status --short --untracked-files=no | head -20
    return 1
  fi

  printf 'removal-test: OK\n'
  return 0
}

main "$@"
