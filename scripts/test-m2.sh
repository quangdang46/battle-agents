#!/usr/bin/env bash
#
# The M2 milestone pipeline — plan section 27, section 40's 2026-09-24 amendment.
#
#   M2: create bounty on a real test repo -> claim from agent via MCP -> PR ->
#   merge webhook -> payout job + XP/rep + history. DoD: end-to-end on a scratch
#   repo with real money rail stubbed (record intent, no real payout until §17.5
#   resolved — mark clearly in UI "payout: manual/sandbox").
#
# ## What this asserts, and what it refuses to
#
# Only M2. Not M0's stage set, because re-running it would assert nothing the
# canonical gate has not already asserted; not M4's, because a milestone
# pipeline that asserts a later milestone's surface cannot go green before that
# milestone exists, which is the mistake section 40's amendment exists to undo.
# The stage set is in scripts/stages-m2.manifest and is asserted against this
# file and against the dispatch below by scripts/check-stage-manifest.sh, which
# runs as a preflight before any stage.
#
# ## The shared runtime is scripts/lib/pipeline.sh, and test-m0.sh does not use it
#
# The marker/selection/reporting boilerplate lives in one place so that the thing
# which makes a pipeline a gate — a stage that did not run cannot be mistaken for
# one that passed — is written once. test-m0.sh is deliberately left alone: the
# main loop owns the M0 stage list, its properties are proven in place, and
# putting eighteen M0 stages through an unrequested refactor on the day four
# agents share this tree would be a change nobody asked for. The cost is ~200
# duplicated lines, and scripts/lib/pipeline.sh says why it is paid.
#
# ## How to drive it
#
#   bash scripts/test-m2.sh                  # every stage
#   M2_STAGES='bounty-loop' bash scripts/test-m2.sh    # one stage, still RED
#   M2_RESUME=1 bash scripts/test-m2.sh      # reuse green markers for THIS code
#
# The env names are the M0 ones with the digit swapped, so somebody who learned
# `M0_STAGES` can drive this without reading it. A partial run is reported RED
# either way: `final_verdict` requires every canonical stage to have run and
# passed, which is what makes this a gate rather than a script that exits 0.

set -Eeuo pipefail

SCRIPT_NAME="$(basename -- "${BASH_SOURCE[0]}")"
readonly SCRIPT_NAME
REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly REPO_ROOT

readonly PIPELINE_ID="m2"
readonly MARKER_SUBDIR=".tmp/m2-stages"

# Order is the contract, and it is the DoD's order: the database is a
# prerequisite, then the loop, then the money rail that the loop must not cross.
# scripts/stages-m2.manifest says why each one is here.
readonly CANONICAL_STAGES=(
  compose
  migrations
  seed
  bounty-loop
  payout-stub
)

# Beads that own each stage, so a red pipeline names who owes the work. Same
# convention as test-m0.sh: an unimplemented stage prints the bead rather than
# failing anonymously.
readonly OWNER_DB="ba-db-schema-drizzle-fki"
readonly OWNER_BOUNTY_LOOP="ba-feature-bounty-xhk"
readonly OWNER_PAYOUT_RAIL="ba-payout-rail-dispute-1q6"

# --- stage implementations ---------------------------------------------------

run_stage_bounty_loop() {
  # Section 27's M2 DoD. `tests/m2/bounty-loop.test.ts` drives the composed
  # runtime in apps/web/src/shared-runtime.ts and the real webhook route, and
  # reads the result back out of Postgres, because the sentence is about the
  # WIRING: a runtime composed without bounty pays nobody and a runtime composed
  # without progression completes bounties and awards nothing, and both look
  # complete from the inside.
  run_milestone_tests bounty-loop "$OWNER_BOUNTY_LOOP" \
    vitest.m2.config.ts m2/bounty-loop.test.ts
}

run_stage_payout_stub() {
  # "real money rail stubbed" and "mark clearly". `tests/m2/payout-stub.test.ts`
  # asserts the intent row exists, that the merge moves it to `pending` and no
  # further, and that every read of a money-attached bounty carries the sentence
  # a surface would have to render.
  run_milestone_tests payout-stub "$OWNER_PAYOUT_RAIL" \
    vitest.m2.config.ts m2/payout-stub.test.ts
}

# The stage-name to runner mapping, written out rather than derived from the name
# so a stage added to CANONICAL_STAGES without a runner here fails loudly.
run_stage() {
  case "$1" in
    compose) run_stage_compose ;;
    migrations) run_stage_migrations ;;
    seed) run_stage_seed ;;
    bounty-loop) run_stage_bounty_loop ;;
    payout-stub) run_stage_payout_stub ;;
    *) pipeline_fail "no runner registered for stage '$1'" ;;
  esac
}

cd -- "$REPO_ROOT"

# shellcheck source=scripts/lib/pipeline.sh
source "${REPO_ROOT}/scripts/lib/pipeline.sh"

pipeline_main "$@"
