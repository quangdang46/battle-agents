#!/usr/bin/env bash
# Per-claim Moltbook verification gate.
#
# Plan section 29 said no Moltbook implementation detail was trustworthy, because
# skill.md could not be fetched. That was overtaken, and docs/research/moltbook.md now
# carries a per-claim verdict. A verdict is only worth something if two things hold:
# every claim is individually tagged with the file it came from, and every claim that
# was NOT confirmed has actually left the design. The second half is the half that
# matters. A note reading "claim UNVERIFIED" beside a plan that still designs around
# the claim has changed nothing - the label survives, the phantom constraint keeps
# doing the work it was invented to do. That is the specific failure this gate exists
# to make impossible.
#
# Five checks, each of which can fail:
#   1. per-claim verdict  - every claim is tagged, and CONFIRMED names a real file
#   2. claims-dropped      - no dropped claim is asserted anywhere in the design
#   3. uncited-claims grep - a Moltbook mechanic asserted with no source citation fails
#   4. index row           - the note is reachable from docs/research/README.md, and its
#                            SHA agrees with THIRD-PARTY-NOTICES.md
#   5. date + staleness    - a research note with no shelf life is a claim, not a record
#
# Plus a local cross-verification: when .tmp/moltbook is present, every file:line the
# verdict table cites is resolved against the real file and one representative line per
# claim is matched by content. It prints SKIPPED loudly when the checkout is absent
# rather than passing quietly, because a gate that checked nothing and reported green
# is the failure mode this repo keeps paying for.

set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"

readonly NOTE_REL="docs/research/moltbook.md"
readonly INDEX_REL="docs/research/README.md"
readonly NOTICES_REL="THIRD-PARTY-NOTICES.md"
readonly PLAN_REL="COMPREHENSIVE_PLAN_FOR_BATTLE_AGENTS.md"

# The nine files git ls-files reports outside .github at dd452e852de3, which is the
# whole of the checkout. Frozen here rather than read from disk because .tmp/ is
# gitignored: in CI and in a fresh clone there is nothing to read, and a check that
# silently has no input is a check that reports green forever.
readonly MOLTBOOK_FILES=(
  skill.md heartbeat.md messaging.md SECURITY.md skill.json
  README.md examples/integration.md LICENSE assets/logo.png
)

readonly NOTE_BASENAME="${NOTE_REL##*/}"
# Citations are written the way Markdown writes them - `skill.md`:7 - so the closing
# backtick sits between the filename and the colon. The first version of this check
# matched on "<name>:<digit>" and therefore matched NO citation in the note: the
# per-claim source test failed every CONFIRMED row and the line-resolution pass
# silently resolved nothing, reporting green while checking nothing. A matcher has to
# be run against the real citation format before its result means anything.
readonly BACKTICK=$'\x60'

# Design surface: where a Moltbook mechanic could be doing work. The note itself is
# excluded - it is the record of the claims, not an assertion of them.
design_files() {
  local root="$1"
  printf '%s\n' "${root}/${PLAN_REL}" "${root}/AGENTS.md" "${root}/README.md"
  find "${root}/docs" -name '*.md' -not -path "*/${NOTE_REL}" 2>/dev/null || true
}

# Claims that did not survive verification, and the shape each takes if the design is
# quietly leaning on it. Keyed to the verdict table in the note.
#
# The patterns are the MOLTBOOK phrasings, not our own vocabulary. "same Agent ID" and
# "version pin" appear in this plan for reasons that have nothing to do with Moltbook
# (they are section 3.2's session contract and section 29.1's protocol versioning), and
# a dropped-claim grep that fires on those teaches people to ignore the check. What is
# forbidden is the specific unverified assertion, which always carries its Moltbook
# phrasing with it.
readonly DROPPED_CLAIM_PATTERNS=(
  'C2|same[ -]*(API[ -]*)?key[ ]*=[ ]*same'
  'C2|every later process presents Bearer'
  'C2|same ID even as processes churn'
  'C2|key=identity'
  'C2|register once[ ]*-[>]'
  'C4|Moltbook ~4h'
  'C4|heartbeat cron ~4h'
  'C7|SECURITY\.md[^.]{0,60}rate limit'
  'C7|rate limit[^.]{0,60}SECURITY\.md'
  'C7|SECURITY\.md[^.]{0,60}escalat'
  'C7|escalat[^.]{0,60}SECURITY\.md'
  'C8|verification URL'
  'C8|claim link'
  'C8|pending_claim'
  # "claim flow" is the one ambiguous phrase here: claiming a BOUNTY is our own
  # verb, so a bare match fires on ordinary design prose. Verified - "Our claim
  # flow: an agent claims a bounty" failed this check with no Moltbook claim
  # anywhere in the sentence, which is how a gate learns to be ignored. So this
  # one requires a Moltbook marker on the same line, the way check 3 already
  # does. The three tokens above stay unguarded because "claim link",
  # "verification URL" and "pending_claim" are Moltbook-only vocabulary: none
  # of them occurs anywhere in our own design surface, so a co-mention
  # requirement would buy nothing and could let the real claim-flow assertion
  # through unflagged.
  'C8|(claim flow[^|]{0,120}[Mm]oltbook|[Mm]oltbook[^|]{0,120}claim flow)'
  'C11|Moltbook[^.]{0,80}version pin'
  'C11|skill\.json version pin'
  'C12|[Mm]oltbook[^.]{0,40}server source'
  'C13|skill-spec repo, 7 files'
)

# One line per claim, quoted from the checkout, asserted byte-for-byte when the
# checkout is available. A verdict whose evidence cannot be re-found has rotted.
# format: claim|relative-file|line|exact substring
readonly EVIDENCE_CLAIMS=(
  'C1|skill.md|7|receive an API key'
  'C1|messaging.md|285|All endpoints require: `Authorization: Bearer YOUR_API_KEY`'
  'C3|skill.md|47|0 */4 * * * curl -s'
  'C4|heartbeat.md|194|gentle reminder, not a rule'
  'C5|heartbeat.md|210|HEARTBEAT_OK - Checked Moltbook, all good!'
  'C6|skill.md|13|1 post per 30 minutes'
  'C9|heartbeat.md|168|When to tell your human'
  'C9|messaging.md|232|When to Escalate to Your Human'
  'C10|skill.json|3|"version": "1.7.0"'
  'C10|skill.json|6|"license": "MIT"'
  'C11|heartbeat.md|10|version'
  'C15|SECURITY.md|24|Use pinned commits for production deployments'
  'C15|examples/integration.md|31|pin to a specific commit'
)

# Tokens that name a Moltbook mechanic. Concrete on purpose: check 3 only fires on a
# line that also says Moltbook, so this list can be specific without crying wolf at our
# own protocol vocabulary.
readonly MECHANIC_PATTERN='api_key|Bearer|HEARTBEAT_OK|pending_claim|claim link|verification URL|rate limit|same[ -]*(API[ -]*)?key[ ]*=[ ]*same|same Agent ID|key=identity|skill\.json version|version pin|submolt|needs_human_input|per 30 min|per 20 sec|every 4 hours|~4h|4\+ hours'

# Does this source cell cite <file>:<line> for one of the frozen checkout files?
# `file.json` has to be matched literally, and the trailing backtick is optional so
# that both `skill.md:7 and '`skill.md`:7' are recognised.
cites_file_line() {
  local source="$1" file pat
  for file in "${MOLTBOOK_FILES[@]}"; do
    pat="${file//./\\.}${BACKTICK}?:[0-9]"
    [[ "$source" =~ $pat ]] && return 0
  done
  return 1
}

# A line is cited if it points at a file the verdict table could have read, at the note
# itself, or at a verdict word. Anything else asserting a mechanic is uncited.
# The note may be named by path or by bare filename - docs/research/README.md links it
# as [moltbook.md](./moltbook.md), and a link is a citation however it is spelled.
is_cited() {
  local line="$1" file
  for file in "${MOLTBOOK_FILES[@]}"; do
    [[ "$line" == *"$file"* ]] && return 0
  done
  [[ "$line" == *"$NOTE_BASENAME"* ]] && return 0
  [[ "$line" =~ (CONFIRMED|UNVERIFIED|REFUTED) ]] && return 0
  return 1
}

# The verdict table, parsed once, as TSV: claim_id <TAB> verdict <TAB> source.
# awk rather than sed because BSD sed's greedy matching dropped three of the fifteen
# rows in the first attempt - a parser that quietly loses rows is the exact shape of
# the extraction bugs check-licenses.sh documents. NF is asserted so a claim whose text
# contains a pipe cannot shift the columns and be read as a different claim.
parse_verdict_table() {
  awk -F'|' '
    /^\| C[0-9]+[[:space:]]*\|/ {
      if (NF != 6) { print "MALFORMED\t" NF > "/dev/stderr"; next }
      verdict = $4; gsub(/\*/, "", verdict); gsub(/^[[:space:]]+|[[:space:]]+$/, "", verdict)
      source  = $5; gsub(/^[[:space:]]+|[[:space:]]+$/, "", source)
      id      = $2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", id)
      print id "\t" verdict "\t" source
    }
  ' "$1"
}

# All five checks, run against one root. Prints violations; returns 1 if any fired.
# The self-test drives this function against mutated copies of the tree, so what is
# tested is the scan a real run performs, not a re-implementation of it.
check_against() {
  local root="$1" failures=0
  local note="${root}/${NOTE_REL}"

  if [ ! -f "$note" ]; then
    printf '  VIOLATION %s does not exist. The per-claim verdict IS the deliverable.\n' "$NOTE_REL"
    return 1
  fi

  # --- 1. per-claim verdict -----------------------------------------------------
  local table rows verdict_rows
  table="$(parse_verdict_table "$note")"
  rows=$(printf '%s\n' "$table" | grep -c . || true)
  verdict_rows=$rows

  if [ "$verdict_rows" -eq 0 ]; then
    printf '  VIOLATION no per-claim verdict rows parsed from %s. A note asserting "all claims verified" with no per-claim tags is the failure mode, not a pass.\n' "$NOTE_REL"
    failures=1
  elif [ "$verdict_rows" -lt 10 ]; then
    printf '  VIOLATION %s yields only %s verdict row(s); the section 29 question list has 7 claim areas and each needs its own row.\n' "$NOTE_REL" "$verdict_rows"
    failures=1
  fi

  local cid verdict source seen
  while IFS=$'\t' read -r cid verdict source; do
    [ -n "$cid" ] || continue
    case "$verdict" in
      CONFIRMED | UNVERIFIED | REFUTED) ;;
      *)
        printf '  VIOLATION claim %s carries verdict "%s"; each claim must be tagged CONFIRMED, UNVERIFIED or REFUTED on its own.\n' "$cid" "$verdict"
        failures=1
        continue
        ;;
    esac
    seen=$(printf '%s\n' "$table" | cut -f1 | grep -cx "$cid" || true)
    if [ "$seen" -ne 1 ]; then
      printf '  VIOLATION claim %s appears %s times in the verdict table\n' "$cid" "$seen"
      failures=1
    fi
    if [ -z "$source" ]; then
      printf '  VIOLATION claim %s carries a verdict but no source column\n' "$cid"
      failures=1
      continue
    fi
    if [ "$verdict" = "CONFIRMED" ]; then
      # "confirmed against the repo" is compatible with having read only a README,
      # which is how an internal detail gets asserted from a summary. Hence a file
      # from the frozen set, with a line number - not the repo name.
      if ! cites_file_line "$source"; then
        printf '  VIOLATION claim %s is CONFIRMED but its source "%s" names no file:line from the frozen %s-file set\n' \
          "$cid" "$source" "${#MOLTBOOK_FILES[@]}"
        failures=1
      fi
    else
      # A dropped claim records how it was dropped, so the next reader can re-run the
      # negative grep instead of trusting the label.
      if ! printf '%s' "$source" | grep -qE 'negative grep|§|git ls-files|wc -l'; then
        printf '  VIOLATION claim %s is %s but does not record how it was checked ("%s")\n' "$cid" "$verdict" "$source"
        failures=1
      fi
    fi
  done < <(printf '%s\n' "$table")

  # --- 2. unverified claims dropped from the design -----------------------------
  # A line that names a dropped claim AND cites this note is a deliberate citation of
  # a refuted claim, which is allowed. Anything else is the design still asserting it.
  local pattern claim regex hit hit_file hit_line
  for pattern in "${DROPPED_CLAIM_PATTERNS[@]}"; do
    claim="${pattern%%|*}"
    regex="${pattern#*|}"
    while IFS= read -r hit; do
      [ -n "$hit" ] || continue
      hit_file="${hit%%:*}"
      hit_line="${hit#*:}"
      [[ "$hit_line" == *"${NOTE_BASENAME}"* ]] && continue
      printf '  VIOLATION %s:%s asserts dropped claim %s without citing the verdict: %s\n' \
        "${hit_file#${root}/}" "${hit%%:*}" "$claim" "$(printf '%s' "$hit_line" | cut -c1-100)"
      failures=1
    done < <(design_files "$root" | while read -r f; do
      [ -f "$f" ] || continue
      grep -nIiE "$regex" "$f" 2>/dev/null || true
    done)
  done

  # --- 3. the uncited-claims grep ----------------------------------------------
  # A design line that names Moltbook and a specific mechanic, with nothing pointing
  # at where the mechanic was read, is how a phantom constraint gets built quietly.
  while IFS= read -r hit; do
    [ -n "$hit" ] || continue
    hit_file="${hit%%:*}"
    hit_line="${hit#*:}"
    is_cited "$hit_line" && continue
    printf '  VIOLATION %s:%s asserts a Moltbook mechanic with no source citation: %s\n' \
      "${hit_file#${root}/}" "${hit%%:*}" "$(printf '%s' "$hit_line" | cut -c1-100)"
    failures=1
  done < <(design_files "$root" | while read -r f; do
    [ -f "$f" ] || continue
    grep -nIiE "moltbook" "$f" 2>/dev/null | grep -iE "$MECHANIC_PATTERN" || true
  done)

  # --- 4. index row, SHA agreement ---------------------------------------------
  local index="${root}/${INDEX_REL}" notices="${root}/${NOTICES_REL}"
  if [ ! -f "$index" ]; then
    printf '  VIOLATION %s does not exist\n' "$INDEX_REL"
    failures=1
  else
    local row_sha
    row_sha=$(grep -i 'moltbook' "$index" | grep -oE '`[0-9a-f]{7}`' | head -1 | tr -d '`' || true)
    if [ -z "$row_sha" ]; then
      printf '  VIOLATION %s has no Moltbook row with a 7-hex commit SHA. A note the index does not list is invisible to the reader the design work starts from.\n' "$INDEX_REL"
      failures=1
    fi
    grep -qi 'moltbook\.md' "$index" || {
      printf '  VIOLATION %s does not link moltbook.md\n' "$INDEX_REL"
      failures=1
    }
    if [ -n "$row_sha" ] && [ -f "$notices" ]; then
      local notice_sha
      notice_sha=$(grep -i '^| moltbook' "$notices" | grep -oE '`[0-9a-f]{12}`' | head -1 | tr -d '`' || true)
      if [ -z "$notice_sha" ]; then
        printf '  VIOLATION %s has no 12-hex SHA for moltbook to agree with\n' "$NOTICES_REL"
        failures=1
      elif [ "$row_sha" != "${notice_sha:0:7}" ]; then
        printf '  VIOLATION index SHA %s does not match %s SHA %s\n' "$row_sha" "$NOTICES_REL" "$notice_sha"
        failures=1
      fi
    fi
  fi

  # --- 5. date and staleness ----------------------------------------------------
  # The existing notes carry these as a leading "- " bullet, so the anchor is on the
  # bold key, not the start of the line.
  grep -qE '^\-?[[:space:]]*\*\*Date determined:\*\* [0-9]{4}-[0-9]{2}-[0-9]{2}' "$note" || {
    printf '  VIOLATION %s has no dated determination line\n' "$NOTE_REL"
    failures=1
  }
  grep -qE '^\-?[[:space:]]*\*\*Commit studied:\*\* `[0-9a-f]{7,40}`' "$note" || {
    printf '  VIOLATION %s does not name the commit it studied\n' "$NOTE_REL"
    failures=1
  }
  # The heading is matched with its section number optional. No note in this directory
  # uses a bare "## Staleness" - the only one that does is the index, README.md - so a
  # strict anchor rejected the note's own "## 6. Staleness" and failed a section that
  # was present. What criterion 4 actually asks for is that the staleness be recorded
  # and name the unstarted beads; that is what the second half of this check tests.
  # The section is located by line number from the same ERE, because a second copy of
  # the pattern in a different regex dialect is a second thing to get wrong.
  local staleness_at
  staleness_at=$(grep -nE '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Staleness' "$note" | head -1 | cut -d: -f1 || true)
  if [ -z "$staleness_at" ]; then
    printf '  VIOLATION %s has no Staleness section\n' "$NOTE_REL"
    failures=1
  elif ! tail -n "+${staleness_at}" "$note" | grep -qE 'ba-[a-z0-9-]+'; then
    printf '  VIOLATION the Staleness section names no beads, so a later reader cannot tell how much of the plan postdates it\n' "$NOTE_REL"
    failures=1
  fi

  # --- local cross-verification of the citations --------------------------------
  local checkout="${root}/.tmp/moltbook"
  if [ -d "$checkout" ]; then
    printf '  cross-check: resolving every cited file:line against .tmp/moltbook\n'
    local eclaim efile eline esub actual total
    while IFS='|' read -r eclaim efile eline esub; do
      [ -n "$eclaim" ] || continue
      if [ ! -f "${checkout}/${efile}" ]; then
        printf '  VIOLATION claim %s cites %s, which is not in the checkout\n' "$eclaim" "$efile"
        failures=1
        continue
      fi
      actual=$(sed -n "${eline}p" "${checkout}/${efile}" || true)
      if [[ "$actual" != *"$esub"* ]]; then
        printf '  VIOLATION claim %s: %s:%s no longer contains "%s" (found: %s)\n' \
          "$eclaim" "$efile" "$eline" "$esub" "$(printf '%s' "$actual" | cut -c1-80)"
        failures=1
      fi
    done < <(printf '%s\n' "${EVIDENCE_CLAIMS[@]}")

    # The whole point of citing file:line is that the pointer resolves. A pointer past
    # the end of the file is the failure this catches, and it is invisible to anyone
    # reading the note. The pattern must match the note's real citation form
    # (`skill.md`:7, backtick included) or this pass silently resolves nothing and
    # reports green - which is what it did until the format mismatch was found.
    local file target_file target_line src pat resolved
    while IFS=$'\t' read -r cid verdict source; do
      [ "$verdict" = "CONFIRMED" ] || continue
      src="$source"
      resolved=0
      for file in "${MOLTBOOK_FILES[@]}"; do
        pat="(${file//./\\.})${BACKTICK}?:([0-9]+)"
        while [[ "$src" =~ $pat ]]; do
          target_file="${BASH_REMATCH[1]}"
          target_line="${BASH_REMATCH[2]}"
          src="${src#*"${BASH_REMATCH[0]}"}"
          resolved=$((resolved + 1))
          [ -f "${checkout}/${target_file}" ] || continue
          total=$(wc -l <"${checkout}/${target_file}" | tr -d ' ')
          if [ "$target_line" -gt "$total" ]; then
            printf '  VIOLATION claim %s cites %s:%s but the file has only %s lines\n' \
              "$cid" "$target_file" "$target_line" "$total"
            failures=1
          fi
        done
      done
      if [ "$resolved" -eq 0 ]; then
        printf '  VIOLATION claim %s is CONFIRMED but "%s" contains no resolvable file:line. A citation this check cannot parse is a citation nobody can check.\n' \
          "$cid" "$source"
        failures=1
      fi
    done < <(printf '%s\n' "$table")
  else
    printf '  cross-check SKIPPED: .tmp/moltbook is absent (it is gitignored), so the quoted evidence could not be re-read here.\n'
    printf '  cross-check SKIPPED: the structural checks above still ran. This line is printed rather than a pass so nobody reads green as "the quotes were re-verified".\n'
  fi

  return "$failures"
}

# A guard nobody has seen fail is not a guard. Each case below is a real mutation of
# the tree, run through the same check_against a normal run uses, asserting that it
# goes red. Planted inputs, not greps for the guard's own pattern: several checks in
# this repo's history passed while scanning nothing.
self_test() {
  local failures=0
  local probe pristine

  probe=$(mktemp -d)
  pristine="${probe}/.pristine"
  mkdir -p "${probe}/docs/research" "${probe}/docs/design" "$pristine"
  local rel
  for rel in "$NOTE_REL" "$INDEX_REL" "$NOTICES_REL" "$PLAN_REL"; do
    cp "${REPO_ROOT}/${rel}" "${probe}/${rel}"
    cp "${REPO_ROOT}/${rel}" "${pristine}/$(basename "$rel")"
  done
  printf '# agents\n' >"${probe}/AGENTS.md"
  printf '# battle-agents\n' >"${probe}/README.md"

  restore_probe() {
    local rel
    rm -rf "${probe:?}/docs"
    mkdir -p "${probe}/docs/research" "${probe}/docs/design"
    for rel in "$NOTE_REL" "$INDEX_REL" "$PLAN_REL"; do
      cp "${pristine}/$(basename "$rel")" "${probe}/${rel}"
    done
  }

  expect_red() {
    local label="$1" expect="$2" out status
    set +e
    out=$(check_against "$probe" 2>&1)
    status=$?
    set -e
    if [ "$expect" = "red" ] && [ "$status" -eq 0 ]; then
      printf '  self-test: %s PASSED but should have FAILED. The check is not reading what it claims to.\n' "$label" >&2
      printf '%s\n' "$out" | sed 's/^/    /' >&2
      failures=1
    fi
    if [ "$expect" = "green" ] && [ "$status" -ne 0 ]; then
      printf '  self-test: %s FAILED but should have passed:\n%s\n' "$label" "$(printf '%s\n' "$out" | sed 's/^/    /')" >&2
      failures=1
    fi
  }

  # A mutation that matches nothing leaves the tree pristine, and "this case should have
  # gone red" then proves nothing at all. Two cases were doing exactly that - their sed
  # patterns had drifted from the note's current text - and the self-test could only see
  # it once the check was fixed enough to run. So every mutation below is bracketed by a
  # stamp of the file it touches, and a no-op fails the self-test loudly.
  stamp() { cksum <"$1"; }

  expect_changed() {
    local file="$1" label="$2" before="$3"
    if [ "$before" = "$(stamp "$file")" ]; then
      printf '  self-test: %s left %s byte-identical. The mutation matched nothing, so this case was testing nothing.\n' \
        "$label" "${file##*/}" >&2
      failures=1
    fi
  }

  # The unmutated copy must be green, or "red" below proves nothing.
  expect_red "pristine copy" green

  # 1. a note that says everything is fine, with no per-claim tags
  local b; b=$(stamp "${probe}/${NOTE_REL}")
  sed -i '' -E 's/^\| C[0-9]+[[:space:]]*\|/| X |/' "${probe}/${NOTE_REL}"
  expect_changed "${probe}/${NOTE_REL}" "verdict table stripped" "$b"
  expect_red "verdict table stripped of per-claim rows" red
  restore_probe

  # 2. a CONFIRMED claim citing the repo rather than a file in it
  #    Anchored on the claim ID and the citation TOKEN, never on the cell padding.
  #    It was anchored on the padded cell `| `heartbeat.md`:206-221 |`, and a
  #    prettier --write that re-flowed the table's column widths silently turned
  #    this mutation into a no-op - the case then "passed" against an unchanged
  #    note and proved nothing. expect_changed is what caught it, which is the
  #    only reason the self-test was worth having.
  b=$(stamp "${probe}/${NOTE_REL}")
  perl -i -pe 's/^(\| C5\s*\|.*\|)\s*`heartbeat\.md`:206-221\s*\|$/${1} the repo |/' "${probe}/${NOTE_REL}"
  expect_changed "${probe}/${NOTE_REL}" "C5 source replaced" "$b"
  expect_red "CONFIRMED citing the repo, not a file" red
  restore_probe

  # 3. a dropped claim back in the design, uncited
  b=$(stamp "${probe}/${PLAN_REL}")
  printf '\nSame API key = same Agent across processes, so the character persists.\n' >>"${probe}/${PLAN_REL}"
  expect_changed "${probe}/${PLAN_REL}" "dropped claim appended" "$b"
  expect_red "dropped claim reintroduced in the plan" red
  restore_probe

  # 3b. the same claim, but citing the note - allowed, or the gate cannot be passed
  #     without a footnote on every mention
  b=$(stamp "${probe}/${PLAN_REL}")
  printf '\nSame API key = same Agent across processes, per docs/research/moltbook.md C2.\n' >>"${probe}/${PLAN_REL}"
  expect_changed "${probe}/${PLAN_REL}" "cited dropped claim appended" "$b"
  expect_red "dropped claim cited to the note" green
  restore_probe

  # 3c. a dropped claim in a design doc that links the note by bare filename, the way
  #     the research index does. A link is a citation however it is spelled; the first
  #     version matched only the full path and fired on the index row itself.
  printf 'Moltbook is a reference. See [moltbook.md](../research/moltbook.md).\n' >"${probe}/docs/design/shape.md"
  printf 'Same API key = same Agent across processes. See [moltbook.md](../research/moltbook.md).\n' >>"${probe}/docs/design/shape.md"
  expect_red "dropped claim in a doc that links the note" green
  rm -f "${probe}/docs/design/shape.md"
  restore_probe

  # 4. the uncited-claims grep: a mechanic asserted, nothing pointing at a source
  b=$(stamp "${probe}/${PLAN_REL}")
  printf '\nMoltbook caps posts at one per 30 minutes.\n' >>"${probe}/${PLAN_REL}"
  expect_changed "${probe}/${PLAN_REL}" "uncited mechanic appended" "$b"
  expect_red "uncited Moltbook mechanic" red
  restore_probe

  # 4b. a FALSE POSITIVE guard, and the only one here. Every other case proves a
  #     check fires; this proves one stays quiet. "claim flow" is our own verb -
  #     an agent claims a bounty - and a bare match on it fired the dropped-claim
  #     grep on ordinary design prose with no Moltbook claim in the sentence. A
  #     gate that cries wolf gets switched off, so the quiet case is worth as much
  #     as the loud one. The companion case immediately after proves the narrowed
  #     pattern still catches the real Moltbook assertion.
  printf 'Our claim flow: an agent claims a bounty, then submits a PR.\n' >"${probe}/docs/design/shape.md"
  expect_red "our own 'claim flow' vocabulary" green
  printf 'Moltbook: the human claims the account, so the claim flow is documented.\n' >>"${probe}/docs/design/shape.md"
  expect_red "Moltbook claim-flow assertion past the narrowed pattern" red
  printf 'If status is pending_claim, send the claim link again.\n' >>"${probe}/docs/design/shape.md"
  expect_red "pending_claim assertion with no Moltbook on the line" red
  rm -f "${probe}/docs/design/shape.md"
  restore_probe

  # 5. the index row deleted - a note nobody can find
  b=$(stamp "${probe}/${INDEX_REL}")
  sed -i '' '/moltbook\.md/d' "${probe}/${INDEX_REL}"
  expect_changed "${probe}/${INDEX_REL}" "index row deleted" "$b"
  expect_red "index row removed" red
  restore_probe

  # 6. index SHA drifting from the notices SHA
  b=$(stamp "${probe}/${INDEX_REL}")
  sed -i '' 's/`dd452e8`/`deadbee`/' "${probe}/${INDEX_REL}"
  expect_changed "${probe}/${INDEX_REL}" "index SHA drifted" "$b"
  expect_red "index SHA disagreeing with THIRD-PARTY-NOTICES" red
  restore_probe

  # 7. the date stripped off a research note
  b=$(stamp "${probe}/${NOTE_REL}")
  sed -i '' -E 's/^-[[:space:]]*\*\*Date determined:\*\*.*$//' "${probe}/${NOTE_REL}"
  expect_changed "${probe}/${NOTE_REL}" "date stripped" "$b"
  expect_red "date stripped from the note" red
  restore_probe

  # 8. a claim whose verdict is a shrug
  b=$(stamp "${probe}/${NOTE_REL}")
  sed -i '' -E 's/\*\*CONFIRMED\*\*/**PROBABLY**/' "${probe}/${NOTE_REL}"
  expect_changed "${probe}/${NOTE_REL}" "verdict replaced with a shrug" "$b"
  expect_red "verdict replaced with PROBABLY" red
  restore_probe

  # 9. the staleness section emptied of beads - present, but says nothing
  b=$(stamp "${probe}/${NOTE_REL}")
  sed -i '' -E 's/ba-[a-z0-9-]+//g' "${probe}/${NOTE_REL}"
  expect_changed "${probe}/${NOTE_REL}" "bead names removed" "$b"
  expect_red "staleness section naming no beads" red
  restore_probe

  rm -rf "${probe:?}"

  if [ "$failures" -ne 0 ]; then
    printf 'self-test FAIL: a check did not go red on a deliberately broken input.\n' >&2
    exit 1
  fi
  printf 'self-test ok: every check went red on the mutation that is supposed to defeat it.\n'
}

printf 'moltbook claims check: per-claim verdicts, dropped claims, uncited assertions, index row\n'

if ! check_against "$REPO_ROOT"; then
  printf '\nmoltbook claims check FAILED.\n'
  printf 'Every Moltbook claim in %s must carry its own verdict, and a claim that is not\n' "$NOTE_REL"
  printf 'CONFIRMED must not be doing work anywhere in the design. A dropped claim still in the\n'
  printf 'plan is the failure this gate exists to catch: the label survives, the constraint does.\n'
  exit 1
fi

self_test

printf 'Moltbook claims check passed.\n'
