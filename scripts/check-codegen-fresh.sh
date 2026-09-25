#!/usr/bin/env bash
# Assert the committed action-id union is what codegen produces.
#
# Why this exists. The set of dispatchable action ids is decided at runtime by
# independently built feature packages, so nothing the compiler can see is a
# function of it — which is why the union is generated rather than written. The
# generator's own comment says the output is committed, because "a generated
# file that only exists after a build is a file whose absence nobody notices."
#
# Committing it creates the other half of the problem, and that is what this
# guards: a feature can add an id to its manifest, run nothing, and ship. The
# union is then a list that was correct the day it was written, and the
# type-level guarantee it exists to provide — `act('typo.id')` must not compile —
# silently stops covering the new feature. Nothing else in the pipeline notices:
# the feature's own tests pass, typecheck passes, architecture passes, and the
# gate reports green while checking nothing about the id that was just added.
#
# ba-risk-gates-e74 RISK 3 names this gap exactly: "a job that runs codegen and
# fails on a dirty diff closes it."
#
# It compares content rather than calling `git diff`, for two reasons. This runs
# inside the m0-test-runner container, where relying on git and on a clean index
# is an assumption about the environment; and a content comparison says what it
# means. The tree is left exactly as it was found, including on failure — a gate
# that repairs what it is checking has stopped being a gate, because the next
# run then passes on the repair instead of on the committed state.

set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly REPO_ROOT
readonly GENERATED="${REPO_ROOT}/packages/protocol/src/generated/action-ids.ts"

fail() {
  printf 'codegen drift FAILED: %s\n' "$1" >&2
  exit 1
}

[ -f "$GENERATED" ] || fail "${GENERATED#"${REPO_ROOT}/"} is missing. Run \`pnpm codegen\`."

original=$(cat "$GENERATED")

restore() { printf '%s\n' "$original" >"$GENERATED"; }

if ! (cd "$REPO_ROOT" && pnpm --silent codegen >/dev/null 2>&1); then
  # Restore before reporting: codegen may have truncated the file on its way to
  # failing, and a failed check that also damages the tree is two problems.
  restore
  fail 'pnpm codegen exited non-zero.'
fi

# The committed file is the PRETTIER-FORMATTED codegen output, because the
# repository's own `pnpm lint` is `prettier --check .` and the generated file is
# committed like any other. Comparing raw codegen output against it reports a
# diff on a completely clean tree — the generator emits double quotes and its own
# line breaking, the committed file carries single quotes and prettier's — so the
# first version of this check was red on a healthy repository, which is the
# failure mode a gate exists to prevent. Formatting is normalized before
# comparing, so the only difference that can remain is a real one: an id.
if ! (cd "$REPO_ROOT" && npx --no-install prettier --write "$GENERATED" >/dev/null 2>&1); then
  restore
  fail 'prettier could not normalise the generated file, so no comparison is possible.'
fi

regenerated=$(cat "$GENERATED")

if [ "$original" != "$regenerated" ]; then
  restore
  {
    printf 'A feature manifest declares action ids the committed union does not\n'
    printf 'contain. The union is generated, so it has to be regenerated and the\n'
    printf 'result committed:\n\n'
    printf '    pnpm codegen\n\n'
    printf 'The difference codegen would produce:\n\n'
    diff -u <(printf '%s\n' "$original") <(printf '%s\n' "$regenerated") || true
  } >&2
  fail 'the committed union is stale.'
fi

printf 'codegen drift: the committed action-id union matches codegen output.\n'
