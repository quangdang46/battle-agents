#!/usr/bin/env bash
#
# The M4 milestone pipeline — plan section 27, section 40's 2026-09-24 amendment,
# and section 17.2's load test.
#
#   M4: 1v1 battle on same issue, isolated workspaces, public weights, judge run,
#   replay URL shareable, XP/rep applied. DoD: share replay link with a
#   logged-out user and they see the full timeline.
#
# ## The load test is HERE and not in M0, which is what §17.2 asks for
#
# "Event-volume risk: enforce §7.2 batching from day one; add load test
# simulating 100x20 ev/s before M4", and section 40: "Load test (100×20 ev/s
# §7.2) stays a pre-M4 gate, not M0." A stage of the M4 pipeline is a pre-M4 gate
# and is not M0, which is the whole of what those two lines ask for. Putting it
# in scripts/stages.manifest instead would make every commit pay for a
# measurement that only means something once there is a battle to measure.
#
# ## Only M4
#
# Not M0's stage set, and not M2's. The reasoning is in scripts/lib/pipeline.sh:
# a milestone pipeline that asserts a later milestone's surface cannot go green
# before that milestone exists, and one that re-runs an earlier milestone's stages
# asserts nothing that gate has not already asserted.
#
# ## How to drive it
#
#   bash scripts/test-m4.sh                  # every stage
#   M4_STAGES='load-test' bash scripts/test-m4.sh    # still RED on its own
#   M4_RESUME=1 bash scripts/test-m4.sh

set -Eeuo pipefail

SCRIPT_NAME="$(basename -- "${BASH_SOURCE[0]}")"
readonly SCRIPT_NAME
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly REPO_ROOT

readonly PIPELINE_ID="m4"
readonly MARKER_SUBDIR=".tmp/m4-stages"

# Order is the contract, and it is §17.2's order: prove the product claim first,
# then the boundary that claim is about, then the volume the design rests on.
# scripts/stages-m4.manifest says why each one is here.
readonly CANONICAL_STAGES=(
  compose
  migrations
  seed
  battle-to-replay
  public-boundary
  load-test
  load-threshold
)

readonly OWNER_DB="ba-db-schema-drizzle-fki"
readonly OWNER_BATTLE="ba-feature-battle-fbt"
readonly OWNER_REPLAY="ba-battle-replay-yjb"
readonly OWNER_LOAD_GATE="ba-risk-gates-e74"

# --- stage implementations ---------------------------------------------------

run_stage_battle_to_replay() {
  # Section 27 M4's list, in one file and in one order. `tests/m4/` settles each
  # clause against a real database through the composed runtime, so a project
  # that shipped the judge but not the reward, or the reward but not the rubric,
  # is caught by name rather than by the absence of a complaint.
  run_milestone_tests battle-to-replay "$OWNER_BATTLE" \
    vitest.m4.config.ts m4/battle-to-replay.test.ts
}

run_stage_public_boundary() {
  # The DoD sentence: a logged-out viewer sees the full timeline. Split from
  # battle-to-replay because it is a different kind of claim — a read that must
  # work WITHOUT a credential, and a set of files that must contain no way to
  # ask for one — and because the regression it guards is invisible from the
  # product side: somebody adds a session check to a page that never had one,
  # and every logged-in viewer is fine.
  run_milestone_tests public-boundary "$OWNER_REPLAY" \
    vitest.m4.config.ts m4/public-boundary.test.ts
}

run_stage_load_test() {
  # 100 agents x 20 ev/s, with the §7.2 pass criterion on rows written. Run
  # through the existing `pnpm load:events` harness rather than a second copy of
  # it: the harness reports generated / accepted / rows-written separately on
  # purpose, and the gap between the last two is the thesis this stage asserts.
  #
  # `run_delegated` reports the stage `unimplemented` — red — if the script is
  # absent, because a missing harness and a passing one must never look alike.
  run_delegated load-test "$OWNER_LOAD_GATE" script:load:events
}

run_stage_load_threshold() {
  # The stage that makes the stage above a gate. It runs the same harness twice
  # with the thresholds set so the measurement cannot meet them, and asserts
  # both runs exit non-zero. Verified by mutation when it was written: without
  # this stage the thresholds are two constants, and constants do not fail.
  run_milestone_tests load-threshold "$OWNER_LOAD_GATE" \
    vitest.m4.config.ts m4/load-threshold.test.ts
}

run_stage() {
  case "$1" in
    compose) run_stage_compose ;;
    migrations) run_stage_migrations ;;
    seed) run_stage_seed ;;
    battle-to-replay) run_stage_battle_to_replay ;;
    public-boundary) run_stage_public_boundary ;;
    load-test) run_stage_load_test ;;
    load-threshold) run_stage_load_threshold ;;
    *) pipeline_fail "no runner registered for stage '$1'" ;;
  esac
}

cd -- "$REPO_ROOT"

# shellcheck source=scripts/lib/pipeline.sh
source "${REPO_ROOT}/scripts/lib/pipeline.sh"

pipeline_main "$@"
