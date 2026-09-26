#!/usr/bin/env bash
# The documentation gate.
#
# It exists because every one of these properties was true when the bead was
# written and would have stayed quietly untrue: a doc drifts from the tree, a
# link 404s for the reader, a failure mode a newcomer hits is not written down,
# the repo claims a licence it does not hold, or the README advertises good
# first issues the tracker does not contain. A doc that drifts from reality
# passes every review, because a reviewer reads prose and not the filesystem.
#
# SCOPE, because the scope is what makes this check correct rather than noisy:
# the licence check asserts a claim about THIS repository, and a third-party
# source legitimately being Apache-2.0 is a fact about someone else. See
# assert_licence below for how the two are told apart.
#
# NOT WIRED INTO THE GATE YET. scripts/stages.manifest, CANONICAL_STAGES in
# test-m0.sh and the run_stage dispatch are owned by the main loop for this
# wave. Running this file directly is how it is exercised until then, and a
# check nobody invokes is the exact failure this repository keeps paying for —
# so the wiring is a real, outstanding step, not a formality.

set -Eeuo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

readonly RED=$'\033[31m'
readonly GREEN=$'\033[32m'
readonly YELLOW=$'\033[33m'
readonly RESET=$'\033[0m'

failures=0
fail() {
  printf '%sFAIL%s %s\n' "$RED" "$RESET" "$1"
  failures=$((failures + 1))
}
pass() { printf '%sok%s   %s\n' "$GREEN" "$RESET" "$1"; }

# The docs a newcomer actually lands on. Extending this list is the only way to
# widen coverage, which is deliberate: a checker nobody extends protects the
# files it happened to be written for.
readonly ROOT_DOCS=(
  README.md
  CONTRIBUTING.md
  AGENTS.md
  THIRD-PARTY-NOTICES.md
  apps/web/README.md
  docs/research/README.md
)

# The failure modes a newcomer hits, as DATA. The brief requires that a
# fourth, newly-discovered mode be added to this list and the check fail until
# it is documented — so the list is the specification and adding a row is
# enough to make the check demand the documentation. Scattering these as
# literals through the check logic is what would make that impossible.
#
# Each entry: the mode's canonical name, and the phrase the docs must use.
readonly FAILURE_MODES=(
  'redirect_uri_mismatch'
  'BETTER_AUTH_SECRET'
  'pnpm db:migrate'
)

# --- 1. Links resolve -------------------------------------------------------
#
# Resolved relative to each document's OWN directory, because README.md is at
# the root and apps/web/README.md is not, and a checker that resolved them all
# against the root would pass while the nested one 404s.
#
# Anchors are checked too. That path is the fiddly half and it is the half that
# rots quietly: a heading is renamed, every deep link into it dies, and no
# 404 appears anywhere because the FILE is still there.
github_slug() {
  # GitHub's heading slug: lowercase, strip everything that is not a word
  # character, a space or a hyphen, then spaces to hyphens.
  # The trailing newline is load-bearing. Without it every heading collapses
  # into one line at the caller's `read`, and the newline itself is then
  # stripped as an invalid slug character — which made this check report five
  # broken links against documents that were perfectly correct. A check that is
  # red on correct content gets deleted rather than fixed.
  printf '%s\n' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -e 's/[^a-z0-9 _-]//g' -e 's/ /-/g'
}

anchors_in() {
  # Every anchor a document defines, from its ATX headings and its explicit
  # {#custom} forms.
  sed -n 's/^#\{1,6\}[[:space:]]*\(.*\)$/\1/p' "$1" \
    | sed -e 's/[[:space:]]*{#[^}]*}[[:space:]]*$//' \
    | while IFS= read -r heading; do
        explicit="$(printf '%s' "$heading" | sed -n 's/.*\(#[A-Za-z0-9_-]\{1,\}\)[[:space:]]*$/\1/p')"
        if [ -n "$explicit" ]; then
          printf '%s\n' "${explicit#\#}"
        else
          github_slug "$heading"
        fi
      done
}

assert_links() {
  local doc target link_target anchor resolved
  for doc in "${ROOT_DOCS[@]}"; do
    if [ ! -f "$doc" ]; then
      fail "$doc does not exist but the checker expects it"
      continue
    fi
    local dir
    dir="$(dirname "$doc")"

    # Every markdown link and, separately, the link definitions. Both forms
    # break silently, and a checker that reads only one of them is a checker
    # that checks half the file.
    while IFS= read -r link_target; do
      [ -n "$link_target" ] || continue
      case "$link_target" in
      http://* | https://* | mailto:* | tel:*) continue ;;
      esac

      resolved="${link_target%%#*}"
      anchor=""

      if [ "$link_target" != "${link_target%%#*}" ]; then
        anchor="${link_target#*#}"
      fi

      if [ -n "$resolved" ]; then
        if [ ! -e "$dir/$resolved" ]; then
          fail "$doc links to '$link_target', which does not exist (resolved as '$dir/$resolved')"
          continue
        fi
      else
        resolved="$doc"
      fi

      if [ -n "$anchor" ]; then
        # Captured, not piped. `anchors_in | grep` dies of SIGPIPE (141) under
        # `set -o pipefail` because the heading loop is the read end of a pipe
        # grep closes as soon as it has its answer — so the check reported the
        # link as broken on a link that resolves. Capture first, then match.
        local available
        available="$(anchors_in "$resolved")"
        if ! printf '%s\n' "$available" | grep -qxF "$anchor"; then
          fail "$doc links to '$link_target', but no heading in $resolved produces the anchor '#$anchor'"
        fi
      fi
    done < <(
      sed -n -e 's/[^[]*\[\([^]]*\)\](\([^)]*\)).*/\2/p' \
        -e 's/^\[[^]]*\]:[[:space:]]*\([^ ]*\).*/\1/p' "$doc"
    )
  done
  [ "$failures" -eq 0 ] && pass "every link in the root docs resolves, anchors included"
}

# --- 2. The failure modes are named in the ROOT docs ------------------------
#
# Deliberately the root docs, not apps/web/README.md: the detailed write-up
# already exists there and must not be rewritten, but a newcomer who never
# opens that file has to be able to recognise a blocker from the root docs
# alone. So the name must appear in the root, and the root must link to the
# detailed section.
assert_failure_modes() {
  local root_text mode
  root_text="$(cat README.md CONTRIBUTING.md)"

  for mode in "${FAILURE_MODES[@]}"; do
    if ! printf '%s' "$root_text" | grep -qF -- "$mode"; then
      fail "the failure mode '$mode' is not named in README.md or CONTRIBUTING.md"
    fi
  done

  if ! grep -qF 'apps/web/README.md' README.md; then
    fail "README.md does not link to apps/web/README.md, where the failure modes are detailed"
  fi
  if ! grep -qF 'when-it-fails' README.md; then
    fail "README.md links apps/web/README.md but not to its 'When it fails' section"
  fi

  [ "$failures" -eq 0 ] &&
    pass "all ${#FAILURE_MODES[@]} named failure modes appear in the root docs, and the root links the detail"
}

# --- 3. This repository's licence -------------------------------------------
#
# NOT a grep for "Apache-2.0". THIRD-PARTY-NOTICES.md records agent-world-
# smallville as genuinely Apache-2.0, and the plan's licence table does the
# same. Those are accurate records of someone ELSE's licence; a bare grep
# fails on correct content, which is how a licence check gets deleted.
#
# So the check is two-sided and both halves are needed:
#   (a) an affirmative statement that THIS project is MIT, and
#   (b) no statement that THIS project is something else.
# (b) is scoped by requiring the claim to be about this repository, so a
# third-party row cannot trip it.
assert_licence() {
  local doc
  if ! grep -qiE 'MIT licen[cs]ed|battle-agents is licensed under the MIT' README.md; then
    fail "README.md does not affirmatively state that battle-agents is MIT"
  fi

  for doc in "${ROOT_DOCS[@]}"; do
    # A line that both names a non-MIT licence AND talks about this repo.
    # Third-party rows name the other project, so they do not match.
    if grep -nEi 'battle-agents|this (project|repo)' "$doc" 2>/dev/null |
      grep -qiE 'licen[cs].{0,40}(apache|gpl|agpl|bsd)|(apache|gpl|agpl).{0,40}licen[cs]'; then
      fail "$doc appears to claim a non-MIT licence for battle-agents itself"
    fi
  done

  # The notices file must keep pointing at a licence file that exists. This is
  # asserted by the link checker above, not by grepping for the string
  # './LICENSE': a `grep -F './LICENSE'` also matches './LICENSE.txt', so that
  # version of the check stayed green while the link was broken. Verified by
  # mutation. Do not reintroduce the substring grep.

  [ "$failures" -eq 0 ] && pass "battle-agents is stated as MIT, with no competing claim about this repo"
}

# --- 4. The advertised good-first-issues exist ------------------------------
#
# Reads the committed tracker, not a hardcoded list, so an issue that is closed
# or renamed fails the check. The count is compared AND every advertised id is
# resolved, because a count alone passes when the README advertises three real
# beads and the tracker holds three different ones.
assert_good_first_issues() {
  command -v python3 >/dev/null 2>&1 || {
    fail "python3 is required to read the tracker but is not on PATH"
    return
  }
  [ -f .beads/issues.jsonl ] || {
    fail ".beads/issues.jsonl is missing, so the advertised good-first-issues cannot be verified"
    return
  }

  local advertised
  advertised="$(python3 - "$REPO_ROOT" <<'PY'
import json, re, sys, pathlib

root = pathlib.Path(sys.argv[1])
readme = (root / "README.md").read_text()

m = re.search(r"There are \*\*(\d+)\*\* open good-first-issues", readme)
if not m:
    print("ERROR:no count sentence in README.md")
    raise SystemExit(0)
print(f"COUNT:{m.group(1)}")

# The ids the README actually names. Every `ba-` token, not just the ones whose
# shape looks right: a pattern that only matched `...good-first...` let a
# renamed or typo'd id escape entirely, and it escaped silently. Verified by
# mutation.
for bead in sorted(set(re.findall(r"\bba-[a-z0-9][a-z0-9-]*\b", readme))):
    print(f"ID:{bead}")

live = set()
for line in (root / ".beads" / "issues.jsonl").read_text().splitlines():
    line = line.strip()
    if not line:
        continue
    try:
        issue = json.loads(line)
    except json.JSONDecodeError:
        continue
    if issue.get("status") == "closed":
        continue
    if "good-first-issue" in (issue.get("labels") or []):
        live.add(issue.get("id"))
for bead in sorted(live):
    print(f"LIVE:{bead}")
PY
)"

  if printf '%s' "$advertised" | grep -q '^ERROR:'; then
    fail "$(printf '%s' "$advertised" | grep '^ERROR:')"
    return
  fi

  local count ids
  count="$(printf '%s\n' "$advertised" | sed -n 's/^COUNT://p')"
  ids="$(printf '%s\n' "$advertised" | grep '^ID:' | sed 's/^ID://' || true)"

  local live_count
  live_count="$(printf '%s\n' "$advertised" | grep -c '^LIVE:' || true)"

  if [ "$count" != "$live_count" ]; then
    fail "README advertises $count good-first-issues; the tracker holds $live_count"
  fi

  local bead
  while IFS= read -r bead; do
    [ -n "$bead" ] || continue
    if ! printf '%s\n' "$advertised" | grep -qxF "LIVE:$bead"; then
      fail "README advertises '$bead', which is not an open good-first-issue in the tracker"
    fi
  done <<<"$ids"

  [ "$failures" -eq 0 ] &&
    pass "the $count advertised good-first-issues exist and are open in the tracker"
}

assert_links
assert_failure_modes
assert_licence
assert_good_first_issues

echo
if [ "$failures" -eq 0 ]; then
  printf '%sAll documentation checks passed.%s\n' "$GREEN" "$RESET"
  exit 0
fi
printf '%s%d documentation check(s) failed.%s\n' "$RED" "$failures" "$RESET"
exit 1
