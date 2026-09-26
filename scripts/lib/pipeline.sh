#!/usr/bin/env bash
#
# The milestone pipeline runtime. SOURCED, never executed.
#
# test-m2.sh and test-m4.sh each set PIPELINE_ID, MARKER_SUBDIR, CANONICAL_STAGES
# and a run_stage dispatch, then source this file and call pipeline_main. The
# boilerplate that decides whether a run may report green lives here exactly once,
# because the thing that makes a pipeline a gate is not the stages it lists — it
# is that a stage which did not run cannot be mistaken for one that passed.
#
# ── why this is not test-m0.sh, generalised ────────────────────────────────────
#
# test-m0.sh is not refactored to use this. It predates it, the main loop owns
# the M0 stage list, and the properties it carries (resume-by-fingerprint, the
# `unimplemented` status, the completeness check over the canonical set) are
# proven in place. Rewriting it to share a library would put every M0 stage
# through a change nobody asked for, on the day four other agents are in the
# tree. The duplication is the ~200 lines of marker/selection/reporting below,
# and it is paid deliberately: a milestone pipeline that shares too much with the
# M0 gate inherits M0's stage set by accident, which is the mistake section 40's
# amendment exists to undo.
#
# ── what a milestone pipeline is allowed to assert ────────────────────────────
#
# Only its own milestone. `pnpm test:m0` runs on every commit and is the canonical
# gate; a stage asserting a later milestone's surface makes M0 unpassable before
# that milestone exists, which is what section 40's 2026-09-24 amendment reversed.
# The mirror image is equally a bug: a milestone pipeline that runs the M0 stage
# set asserts nothing the M0 gate does not already assert, and every minute it
# spends is a minute the M0 gate could have reported earlier. So the shared
# prerequisite stages here are exactly the three a milestone assertion needs to
# have a database to talk to — compose, migrations, seed — and nothing else.

set -Eeuo pipefail

: "${PIPELINE_ID:?the caller must set PIPELINE_ID before sourcing the runtime}"
: "${MARKER_SUBDIR:?the caller must set MARKER_SUBDIR before sourcing the runtime}"
: "${CANONICAL_STAGES:?the caller must set CANONICAL_STAGES before sourcing the runtime}"

# `m2` -> `M2_`. test-m0.sh spells its knobs M0_STAGES, M0_RESUME, M0_MARKER_DIR,
# so the milestone equivalents read M2_STAGES and M4_STAGES rather than something
# invented here, and a contributor who learned one pipeline can drive the other.
PIPELINE_ENV_PREFIX="${PIPELINE_ID^^}_"
readonly PIPELINE_ENV_PREFIX

readonly MARKER_SUFFIX=".marker"
PIPELINE_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
readonly PIPELINE_RUN_ID

readonly STATUS_PASS="pass"
readonly STATUS_FAIL="fail"
readonly STATUS_UNIMPLEMENTED="unimplemented"

readonly COMPOSE_BASE_FILE="compose.yaml"
readonly COMPOSE_TEST_FILE="compose.test.yaml"
readonly COMPOSE_PROFILE="test"
# compose.test.yaml declares one runner service per milestone — m0, m2, m4 — and
# they are near-copies with a fixed command each. That is deliberate: a single
# service whose command an env var chose would be a service where pointing it at
# the wrong pipeline is silent, and the whole content of the local/CI parity
# claim is that `pnpm test:<id>` and the CI job execute the same file. The
# M0_TO_TEST_RUNNER_MAP below exists only to name the one to wait on, and
# test-m0.sh still owns the M0 service name outright.
readonly TEST_RUNNER_SERVICE="${PIPELINE_ID}-test-runner"

readonly PG_HOST_ENV="M0_PG_HOST"
readonly PG_PORT_ENV="M0_PG_PORT"
readonly PG_PUBLISHED_PORT_ENV="M0_PG_PUBLISHED_PORT"
readonly PG_PUBLISHED_PORT_DEFAULT="5433"
readonly PG_WAIT_ATTEMPTS=30
readonly PG_WAIT_INTERVAL_SECONDS=1

PIPELINE_SELECTED_STAGES=()
RESULT_STATUS=()
RESULT_ELAPSED=()
RESULT_NOTE=()
COMPOSE_FILE_ARGS=()
CANDIDATE_FOUND=0
STAGE_STATUS="$STATUS_FAIL"

# --- output helpers ----------------------------------------------------------

pipeline_note() {
  printf '%s\n' "$*"
}

pipeline_fail() {
  printf '%s: %s\n' "${SCRIPT_NAME:-pipeline}" "$*" >&2
  exit 1
}

# --- environment resolution --------------------------------------------------

# One reader for every per-pipeline variable, so a milestone pipeline is driven
# by M2_STAGES / M2_RESUME / M2_MARKER_DIR without this file enumerating them.
pipeline_env() {
  local name="${PIPELINE_ENV_PREFIX}$1"
  printf '%s' "${!name:-}"
}

running_in_test_runner() {
  [ "$(pipeline_env IN_CONTAINER)" = "1" ]
}

resolve_compose_file_args() {
  COMPOSE_FILE_ARGS=()
  if [ -f "$COMPOSE_BASE_FILE" ]; then
    COMPOSE_FILE_ARGS+=(-f "$COMPOSE_BASE_FILE")
  fi
  COMPOSE_FILE_ARGS+=(-f "$COMPOSE_TEST_FILE")
}

has_compose_files() {
  local file_arg
  for file_arg in "${COMPOSE_FILE_ARGS[@]}"; do
    if [ -f "${file_arg#-f}" ]; then
      return 0
    fi
  done
  return 1
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    pipeline_fail "docker is required to run the $PIPELINE_ID pipeline (https://docs.docker.com/get-docker/)"
  fi
  if ! docker compose version >/dev/null 2>&1; then
    pipeline_fail "docker compose v2+ is required to run the $PIPELINE_ID pipeline"
  fi
}

default_test_database_url() {
  local published_port="${!PG_PUBLISHED_PORT_ENV:-$PG_PUBLISHED_PORT_DEFAULT}"
  printf 'postgres://postgres:postgres@127.0.0.1:%s/battle_test\n' "$published_port"
}

setup_database_url() {
  if [ -z "${DATABASE_URL:-}" ]; then
    DATABASE_URL="$(pipeline_env DATABASE_URL)"
    if [ -z "$DATABASE_URL" ]; then
      DATABASE_URL="$(default_test_database_url)"
    fi
  fi
  export DATABASE_URL
}

# --- stage markers -----------------------------------------------------------

marker_dir() {
  local configured
  configured="$(pipeline_env MARKER_DIR)"
  if [ -n "$configured" ]; then
    printf '%s\n' "$configured"
    return
  fi
  printf '%s\n' "$REPO_ROOT/$MARKER_SUBDIR"
}

marker_path() {
  printf '%s/%s%s\n' "$(marker_dir)" "$1" "$MARKER_SUFFIX"
}

marker_field() {
  local path
  path="$(marker_path "$1")"
  if [ ! -f "$path" ]; then
    return 1
  fi
  grep -m1 "^$2=" "$path" | cut -d= -f2- || true
}

# HEAD plus a hash of TRACKED modifications. A `pass` marker with no fingerprint
# keeps saying "pass" after the code it described has changed, and these markers
# are uploaded to CI as gate evidence, so a stale pass is indistinguishable from
# a real one. Untracked files are excluded because a run creates .tmp/ and dist/
# output and the fingerprint has to stay stable for the whole run.
code_fingerprint() {
  local head dirty
  head=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || printf 'no-head')
  dirty=$(git -C "$REPO_ROOT" status --porcelain --untracked-files=no 2>/dev/null \
    | shasum -a 256 2>/dev/null | cut -d" " -f1)
  printf "%s:%s" "$head" "${dirty:-clean}"
}

write_marker() {
  local stage=$1 status=$2 started=$3 elapsed=$4
  local dir
  dir="$(marker_dir)"
  mkdir -p -- "$dir"
  {
    printf 'stage=%s\n' "$stage"
    printf 'status=%s\n' "$status"
    printf 'run_id=%s\n' "$PIPELINE_RUN_ID"
    printf 'started=%s\n' "$started"
    printf 'elapsed_seconds=%s\n' "$elapsed"
    printf 'fingerprint=%s\n' "$(code_fingerprint)"
  } >"$(marker_path "$stage")"
}

# A fresh run must not inherit markers from a previous one, or an unexecuted
# stage could satisfy the completeness check below.
prepare_marker_dir() {
  mkdir -p -- "$(marker_dir)"
  if [ "$(pipeline_env RESUME)" = "1" ]; then
    return
  fi
  local path
  for path in "$(marker_dir)"/*"$MARKER_SUFFIX"; do
    if [ -e "$path" ]; then
      rm -f -- "$path"
    fi
  done
}

# --- stage selection ---------------------------------------------------------

is_known_stage() {
  local candidate=$1 known
  for known in "${CANONICAL_STAGES[@]}"; do
    if [ "$known" = "$candidate" ]; then
      return 0
    fi
  done
  return 1
}

# `<ID>_STAGES` is the resume lever. Selection is re-sorted into canonical order
# so the chain can never execute out of sequence.
resolve_selected_stages() {
  local requested
  requested="$(pipeline_env STAGES)"
  local normalized=${requested//,/ }
  local -a requested_names=()
  PIPELINE_SELECTED_STAGES=()
  if [ -z "$normalized" ]; then
    PIPELINE_SELECTED_STAGES=("${CANONICAL_STAGES[@]}")
    return
  fi
  read -r -a requested_names <<<"$normalized"
  local name known
  for name in "${requested_names[@]}"; do
    if ! is_known_stage "$name"; then
      pipeline_fail "unknown stage '$name'; valid stages: ${CANONICAL_STAGES[*]}"
    fi
  done
  for known in "${CANONICAL_STAGES[@]}"; do
    for name in "${requested_names[@]}"; do
      if [ "$known" = "$name" ]; then
        PIPELINE_SELECTED_STAGES+=("$known")
      fi
    done
  done
}

stages_not_selected() {
  local known name not_selected=()
  for known in "${CANONICAL_STAGES[@]}"; do
    for known_selected in "${PIPELINE_SELECTED_STAGES[@]}"; do
      if [ "$known" = "$known_selected" ]; then
        continue 2
      fi
    done
    not_selected+=("$known")
  done
  printf '%s' "${not_selected[*]:-}"
}

# --- delegated stage resolution ----------------------------------------------

pnpm_script_defined() {
  node -e '
    const fs = require("node:fs");
    const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.exit(manifest.scripts && manifest.scripts[process.argv[2]] ? 0 : 1);
  ' "$REPO_ROOT/package.json" "$1"
}

run_pnpm_script() {
  local name=$1
  if ! pnpm_script_defined "$name"; then
    return 0
  fi
  CANDIDATE_FOUND=1
  printf '  -> pnpm run %s\n' "$name"
  pnpm run "$name"
}

run_repo_script() {
  local path=$1
  if [ ! -f "$REPO_ROOT/$path" ]; then
    return 0
  fi
  CANDIDATE_FOUND=1
  printf '  -> bash %s\n' "$path"
  bash "$REPO_ROOT/$path"
}

run_candidate() {
  case "$1" in
    script:*) run_pnpm_script "${1#script:}" ;;
    file:*) run_repo_script "${1#file:}" ;;
    *) pipeline_fail "unknown stage candidate kind: $1" ;;
  esac
}

# Availability and success are separate facts. Deciding them by exit code alone
# misreads a command that legitimately exits 127 — a missing binary inside a
# stage — as "this candidate does not exist" and reports unimplemented, hiding
# the real failure.
run_delegated() {
  local stage=$1 owner=$2
  shift 2
  local candidate exit_code
  CANDIDATE_FOUND=0
  for candidate in "$@"; do
    exit_code=0
    run_candidate "$candidate" || exit_code=$?
    if [ "$CANDIDATE_FOUND" = "1" ]; then
      return "$exit_code"
    fi
  done
  stage_unimplemented "$stage" "$owner"
}

stage_unimplemented() {
  STAGE_STATUS="$STATUS_UNIMPLEMENTED"
  printf '  %s has no implementation in this tree yet (owned by %s).\n' "$1" "$2"
  if [ -n "${3:-}" ]; then
    printf '  Reason: %s\n' "$3"
  fi
  printf '  Reported red on purpose: an absent stage must not read as a passing one.\n'
  return 1
}

# A vitest command can exist while the suite it points at has no files yet, and
# vitest exits 1 on "No test files found" — neither a pass nor a real failure.
# Counting the files first keeps an absent milestone suite from being reported
# green, and keeps it from being reported broken.
count_stage_test_files() {
  find "$REPO_ROOT/tests/$1" -name '*.test.ts' -type f 2>/dev/null | wc -l | tr -d ' '
}

# The milestone stage shape: one vitest config, one file inside it.
#
# The file is named rather than a whole directory on purpose. A stage that ran
# every file under tests/m2 would grow a new test with no stage, and the new
# test would then be in the pipeline by accident rather than by decision —
# which is the "a gate that cannot fail" shape with extra steps, because the
# stage would keep passing whether the new file tested anything.
run_milestone_tests() {
  local stage=$1 owner=$2 config=$3 file=$4
  if [ ! -f "$REPO_ROOT/tests/$file" ]; then
    stage_unimplemented "$stage" "$owner" "tests/$file does not exist"
    return 1
  fi
  printf '  -> pnpm exec vitest run --config %s tests/%s\n' "$config" "$file"
  pnpm exec vitest run --config "$config" "tests/$file"
}

# --- shared prerequisite stages ----------------------------------------------

wait_for_test_postgres() {
  local host="${!PG_HOST_ENV:-}" port="${!PG_PORT_ENV:-}" attempt
  if [ -z "$host" ] || [ -z "$port" ]; then
    pipeline_note "  $PG_HOST_ENV/$PG_PORT_ENV are unset; skipping the reachability probe."
    return 0
  fi
  for ((attempt = 1; attempt <= PG_WAIT_ATTEMPTS; attempt++)); do
    if (exec 3<>"/dev/tcp/$host/$port") 2>/dev/null; then
      return 0
    fi
    sleep "$PG_WAIT_INTERVAL_SECONDS"
  done
  pipeline_note "  Postgres at $host:$port did not accept connections within ${PG_WAIT_ATTEMPTS}s."
  return 1
}

start_compose_stack() {
  resolve_compose_file_args
  if ! has_compose_files; then
    pipeline_note "  Neither $COMPOSE_TEST_FILE nor $COMPOSE_BASE_FILE exists in this tree."
    return 1
  fi
  require_docker
  # The test profile is not activated here: it holds the single test-runner
  # service, and bringing that up from inside the pipeline would start a second
  # copy of a pipeline against itself. CI activates the profile explicitly.
  printf '  -> docker compose %s up -d --wait\n' "${COMPOSE_FILE_ARGS[*]}"
  # Captured rather than left to the function's last status: `printf` returns 0,
  # and the caller runs this behind `|| exit_code=$?`, which also disables
  # errexit inside the function.
  local compose_status=0
  docker compose "${COMPOSE_FILE_ARGS[@]}" up -d --wait || compose_status=$?
  if [ "$compose_status" -ne 0 ]; then
    printf '  docker compose could not bring the stack up (exit %s).\n' "$compose_status" >&2
    return "$compose_status"
  fi
  pipeline_note "  to run this same pipeline in the $COMPOSE_PROFILE profile instead:"
  pipeline_note "     docker compose ${COMPOSE_FILE_ARGS[*]} --profile $COMPOSE_PROFILE run --rm $TEST_RUNNER_SERVICE"
}

run_stage_compose() {
  if running_in_test_runner; then
    pipeline_note "  stack already up: this run is inside the compose $TEST_RUNNER_SERVICE service."
    wait_for_test_postgres
    return $?
  fi
  start_compose_stack || return $?
  # `--wait` returning 0 means the containers are healthy, not that this project
  # can reach the database it published: if the port was already taken, Compose
  # starts a container, it reports healthy, and the host port keeps answering for
  # whoever owned it. Proved here, against the URL migrations and seed will use.
  printf '  -> checking the published database is actually reachable\n'
  pnpm exec tsx scripts/check-postgres.ts
}

run_stage_migrations() {
  run_delegated migrations "$OWNER_DB" file:scripts/migrate.sh script:db:migrate
  # Migrate alone exits 0 when it decides there is nothing to do, and its ledger
  # lives in a separate drizzle schema, so dropping only the public schema left
  # it believing every migration had already run. A table existence check catches
  # that here, with a clear message, instead of letting it surface later as a
  # confusing seed failure.
  printf '  -> checking the migrated tables exist\n'
  pnpm run db:verify -- --tables-only
}

run_stage_seed() {
  run_delegated seed "$OWNER_DB" file:scripts/seed.sh script:db:seed
  # db:verify asserts data invariants as well as shape, so it needs the seed in
  # place. Here rather than in the migrations stage for that reason.
  printf '  -> pnpm run db:verify\n'
  pnpm run db:verify
}

# --- execution ---------------------------------------------------------------

# The caller owns this. A stage added to CANONICAL_STAGES without a case here
# fails loudly instead of resolving to nothing.
if ! declare -F run_stage >/dev/null; then
  pipeline_fail "$PIPELINE_ID runner defines no run_stage dispatch"
fi

already_completed() {
  local stage=$1
  if [ "$(pipeline_env RESUME)" != "1" ]; then
    return 1
  fi
  [ "$(marker_field "$stage" status || true)" = "$STATUS_PASS" ] || return 1

  local recorded current
  recorded=$(marker_field "$stage" fingerprint || true)
  current=$(code_fingerprint)
  if [ -z "$recorded" ]; then
    printf '  stage %s: marker predates fingerprinting, rerunning.\n' "$stage"
    return 1
  fi
  if [ "$recorded" != "$current" ]; then
    printf '  stage %s: marker was written for different code, rerunning.\n' "$stage"
    return 1
  fi
  return 0
}

execute_stage() {
  local stage=$1 index=$2
  local started elapsed_seconds exit_code=0 status note_text=""
  started=$(date -u +%s)
  printf '\n=== %s stage %d/%d: %s ===\n' "$PIPELINE_ID" "$index" "${#PIPELINE_SELECTED_STAGES[@]}" "$stage"
  STAGE_STATUS="$STATUS_FAIL"
  run_stage "$stage" || exit_code=$?
  elapsed_seconds=$(($(date -u +%s) - started))
  status=$STAGE_STATUS
  if [ "$exit_code" -eq 0 ]; then
    status="$STATUS_PASS"
  fi
  if [ "$status" = "$STATUS_UNIMPLEMENTED" ]; then
    note_text="no implementation in tree"
  fi
  write_marker "$stage" "$status" "$started" "$elapsed_seconds"
  RESULT_STATUS+=("$status")
  RESULT_ELAPSED+=("$elapsed_seconds")
  RESULT_NOTE+=("$note_text")
  printf '\n  [%s] %s (%ss)\n' "$stage" "$status" "$elapsed_seconds"
}

record_resumed_stage() {
  local stage=$1
  RESULT_STATUS+=("$STATUS_PASS")
  RESULT_ELAPSED+=("0")
  RESULT_NOTE+=("resumed from marker run $(marker_field "$stage" run_id || printf 'unknown')")
  printf '\n=== %s stage %s: %s (resumed) ===\n' "$PIPELINE_ID" "$stage" "$STATUS_PASS"
}

# --- reporting ---------------------------------------------------------------

print_summary() {
  local index stage
  printf '\n=== %s stage summary (run %s) ===\n' "$PIPELINE_ID" "$PIPELINE_RUN_ID"
  printf '  %-16s %-14s %-6s %s\n' STAGE STATUS ELAPSED NOTE
  for index in "${!PIPELINE_SELECTED_STAGES[@]}"; do
    stage="${PIPELINE_SELECTED_STAGES[$index]}"
    printf '  %-16s %-14s %-6s %s\n' \
      "$stage" "${RESULT_STATUS[$index]}" "${RESULT_ELAPSED[$index]}" "${RESULT_NOTE[$index]}"
  done
  pipeline_note "  markers: $(marker_dir)"
}

# Green requires every canonical stage to have run AND passed. A partial run is
# never reported as this milestone's gate being green, which is the property that
# separates a gate from a script that happened to exit 0.
final_verdict() {
  local index stage
  local -a red_stages=()
  for index in "${!PIPELINE_SELECTED_STAGES[@]}"; do
    stage="${PIPELINE_SELECTED_STAGES[$index]}"
    if [ "${RESULT_STATUS[$index]}" != "$STATUS_PASS" ]; then
      red_stages+=("$stage")
    fi
  done
  local not_selected
  not_selected="$(stages_not_selected)"
  if [ "${#red_stages[@]}" -eq 0 ] && [ -z "$not_selected" ]; then
    printf '%s pipeline GREEN: %d/%d stages passed.\n' \
      "$PIPELINE_ID" "${#PIPELINE_SELECTED_STAGES[@]}" "${#CANONICAL_STAGES[@]}"
    return 0
  fi
  if [ "${#red_stages[@]}" -gt 0 ]; then
    printf '%s pipeline RED: failing stage(s): %s\n' "$PIPELINE_ID" "${red_stages[*]}" >&2
  fi
  if [ -n "$not_selected" ]; then
    printf '%s pipeline RED: stage(s) not run: %s\n' "$PIPELINE_ID" "$not_selected" >&2
  fi
  return 1
}

pipeline_main() {
  # Preflight. If the stage set disagrees across the manifest, CANONICAL_STAGES
  # and the run_stage dispatch, running the stages would report green for a set
  # nobody intended, so this runs before the first stage rather than as one.
  if ! bash "${REPO_ROOT}/scripts/check-stage-manifest.sh"; then
    printf 'pipeline aborted before running any stage: the stage set is inconsistent.\n' >&2
    return 1
  fi

  prepare_marker_dir
  resolve_selected_stages
  setup_database_url
  pipeline_note "$PIPELINE_ID pipeline: ${PIPELINE_SELECTED_STAGES[*]}"
  local index stage
  for index in "${!PIPELINE_SELECTED_STAGES[@]}"; do
    stage="${PIPELINE_SELECTED_STAGES[$index]}"
    if already_completed "$stage"; then
      record_resumed_stage "$stage"
    else
      execute_stage "$stage" "$((index + 1))"
    fi
  done
  print_summary
  local verdict=0
  final_verdict || verdict=$?
  exit "$verdict"
}
