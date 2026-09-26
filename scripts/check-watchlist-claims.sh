#!/usr/bin/env bash
# Watchlist citation gate.
#
# Plan section 34 tracks external projects that could invalidate our design, and
# schedules one comparison explicitly: SpaceMolt's session/presence model
# against the frozen section 3 identity split, before M5. That reading is done
# and lives in docs/research/spacemolt.md, whose decision is KEEP.
#
# A research note is only worth what its citations are worth, and the failure
# this gate exists for is a design doc quietly leaning on a mechanic nobody
# verified. That is how a phantom constraint gets built: someone designs around
# a heartbeat interval or a resume rule that was never real, and the real
# constraint then makes the design wrong. Section 34 is the second watch target
# this repository has had this problem with, after Moltbook in section 29.
#
# Seven checks, each of which can fail:
#   1. index row      - docs/research/README.md lists the note. A note the index
#                       does not list satisfies every per-file check and is
#                       invisible to anyone who reads only the index.
#   2. commit SHA     - that row carries a SHA. A reading nobody can pin to a
#                       revision is a claim, not a record.
#   3. uncited claim  - a line naming a watch target and asserting a mechanic
#                       about it, with no citation to a research note, fails.
#   4. granularity    - the note carries a per-claim verdict table, and every
#                       CONFIRMED row names a file. "All claims verified"
#                       satisfies the wording while verifying nothing.
#   5. a decision     - exactly one of ADOPT / KEEP / DEFER, with a consequence.
#                       A comparison that concludes nothing is a comment.
#   6. notices        - THIRD-PARTY-NOTICES.md records the same SHAs, so the two
#                       records of one reading cannot drift apart.
#   7. count agreement- the index row's verdict counts equal the note's table.
#
# Plus a local cross-verification: when .tmp/spacemolt-{client,lib} is present,
# the note's file:line citations are resolved against the real files and 13
# evidence lines are asserted byte-for-byte. It prints SKIPPED loudly when the
# checkouts are absent rather than passing quietly, because a gate that checked
# nothing and reported green is the failure mode this repo keeps paying for.
#
# NOT WIRED INTO THE PIPELINE. scripts/stages.manifest, CANONICAL_STAGES and
# run_stage dispatch are a three-file mutex owned by the main loop for this wave.
# This script is written to be wired; until it is, nothing runs it. Run it by
# hand: scripts/check-watchlist-claims.sh [--self-test] [--root DIR]

set -Eeuo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"

readonly NOTE_REL="docs/research/spacemolt.md"
readonly NOTE_BASENAME="${NOTE_REL##*/}"
readonly INDEX_REL="docs/research/README.md"
readonly PLAN_REL="COMPREHENSIVE_PLAN_FOR_BATTLE_AGENTS.md"
readonly NOTICES_REL="THIRD-PARTY-NOTICES.md"

# Citations are written the way Markdown writes them - `client.ts`:113-126 - so
# the closing backtick sits between the filename and the colon.
readonly BACKTICK=$'\x60'

# The three projects section 34 puts on the watchlist. SpaceMolt is the primary
# target and has a note; the other two are SECONDARY and were never read, which
# is exactly why the uncited-claim check below has to cover all three: a target
# with no note is a target whose mechanics are most likely to be invented.
readonly WATCH_TARGET_PATTERN='SpaceMolt|Agent Intercom|sandbox-agent|agentintercom'

# What counts as asserting a mechanic rather than merely naming the project.
# Deliberately built from CLAIM SHAPES - a directive, an assertion of fact, a
# transport, a duration, a genre - and not from a bare project name, because a
# line that only lists watch targets (plan Appendix A's "named in conversation
# but NOT cloned") asserts nothing and must stay allowed.
#
# Every alternative here was checked against the real design surface first, and
# the two the plan actually got wrong - "STEAL: protocol-vendor-per-adapter
# pattern" and "unified control API across ... over HTTP" - are caught by
# STEAL and by the transport alternative respectively.
#
# NO \b IN THIS PATTERN, and that is load-bearing. bash's [[ =~ ]] compiles with
# the system regcomp, which on Darwin/BSD has no word-boundary escape, so every
# \b-anchored alternative silently matched nothing - the self-test caught it as
# "docs/design asserting an uncited SpaceMolt mechanic PASSED but should have
# FAILED". A regex feature the engine does not have is not a stricter check; it
# is a check that has stopped checking. Since the match is unanchored, a
# leading boundary buys nothing, and a trailing one would need a character class
# the platform also lacks.
readonly MECHANIC_PATTERN='STEAL|AVOID|REUSE|[Pp]roves|exists|Unix-socket|WebSocket|MCP|HTTP|MMO|heartbeat interval|grace window|resume[- ]vs[- ]new|[0-9]+ ?(ms|milliseconds?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?) (heartbeat|grace|timeout|interval|window|cadence)'

# Design surface. The note itself is excluded: it is the record of the claims,
# not an assertion of them, and it necessarily names every mechanic.
#
# The plan is included even though the brief scoped clause 3 to docs/design/,
# and that scope was checked before it was adopted: docs/design/ holds three
# files and zero hits for any watch target, so a check scoped to it passes
# vacuously today. The only uncited SpaceMolt assertion in the repository was
# at the plan, not under docs/design/ - which is the point, not a detail.
design_files() {
  local root="$1"
  printf '%s\n' "${root}/${PLAN_REL}" "${root}/AGENTS.md" "${root}/README.md"
  find "${root}/docs" -name '*.md' -not -path "*/${NOTE_REL}" 2>/dev/null || true
}

# A line is cited if it points at any per-repo note, by path or by bare
# filename. docs/research/README.md links notes as [spacemolt.md](./spacemolt.md),
# so a link is a citation however it is spelled.
is_cited() {
  local line="$1" notes_dir="$2" base
  for base in $(cd "$notes_dir" 2>/dev/null && ls *.md 2>/dev/null); do
    [[ "$line" == *"$base"* ]] && return 0
  done
  [[ "$line" == *"$NOTE_BASENAME"* ]] && return 0
  [[ "$line" == *"docs/research/"* ]] && return 0
  return 1
}

# A CONFIRMED row must name a FILE it came from - that is what the brief asks
# for ("each CONFIRMED naming the file it came from"), and requiring a line
# number as well rejected three legitimate rows whose evidence is a whole file:
# LICENSE, a generated openapi.json whose schemas have no line addresses, and a
# file count.
#
# It must therefore look like a file: either a dotted name, or one of the
# extensionless names a repository actually uses. "the repo" matches neither,
# which is the point - that is the self-test case for a CONFIRMED row citing
# nothing.
#
# The closing backtick is optional because Markdown puts it between the filename
# and the colon (`client.ts`:113), and a matcher that does not allow for the
# citation format the note actually uses matches nothing at all.
readonly FILE_TOKEN="([A-Za-z0-9_./-]+\\.[A-Za-z0-9_]+|LICENSE|README|CHANGELOG|Makefile)${BACKTICK}?"

# The per-repo table row for a note, or empty. The Commit SHA cell is the
# second column; NF is asserted so a pipe in the headline cannot shift the
# columns and hand back an empty SHA that reads as present.
index_row_for() {
  awk -F'|' -v want="$NOTE_BASENAME" '
    index($0, want) { print; found = 1 }
    END { exit(found ? 0 : 1) }
  ' "$1" 2>/dev/null
}

# Every row of the note's verdict table, as TSV: id <TAB> verdict <TAB> source.
# awk rather than sed because BSD sed's greedy matching dropped rows in the
# first attempt at this, and a parser that quietly loses rows is the exact shape
# of extraction bug check-licenses.sh documents.
parse_verdict_table() {
  awk -F'|' '
    /^\| [A-Z]+[0-9]+[[:space:]]*\|/ {
      if (NF != 6) { print "MALFORMED\t" NF > "/dev/stderr"; next }
      id      = $2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", id)
      verdict = $4; gsub(/\*/, "", verdict); gsub(/^[[:space:]]+|[[:space:]]+$/, "", verdict)
      source  = $5; gsub(/^[[:space:]]+|[[:space:]]+$/, "", source)
      print id "\t" verdict "\t" source
    }
  ' "$1"
}

# All five checks, run against one root. Prints violations; returns 1 if any
# fired. The self-test drives this function against mutated copies of the tree,
# so what is tested is the scan a real run performs, not a re-implementation.
check_against() {
  local root="$1" failures=0
  local note="${root}/${NOTE_REL}"
  local -a shas=()
  local index="${root}/${INDEX_REL}"
  local notes_dir="${root}/docs/research"
  local notices="${root}/${NOTICES_REL}"

  if [ ! -f "$note" ]; then
    printf '  VIOLATION %s does not exist. The per-claim verdict IS the deliverable.\n' "$NOTE_REL"
    return 1
  fi
  if [ ! -f "$index" ]; then
    printf '  VIOLATION %s does not exist.\n' "$INDEX_REL"
    return 1
  fi

  # 1 + 2. the index row, and the SHA in it.
  local row sha_cell
  if ! row=$(index_row_for "$index"); then
    printf '  VIOLATION %s carries no row for %s. A note the index does not list is invisible to anyone who reads only the index.\n' \
      "$INDEX_REL" "$NOTE_BASENAME"
    failures=$((failures + 1))
  else
    # One SHA or several: this note was read from two checkouts, so a
    # comma-separated pair is the honest form. What is rejected is an EMPTY
    # cell and a cell that is not made of hex revisions - "TBD", "latest", "the
    # current tree" are all the same failure wearing different clothes.
    sha_cell=$(printf '%s' "$row" | awk -F'|' '{ print $3 }' | tr -d "${BACKTICK}")
    read -r -a shas <<<"$(printf '%s' "$sha_cell" | tr ',' ' ')"
    if [ "${#shas[@]}" -eq 0 ] || [ -z "${shas[0]}" ]; then
      printf '  VIOLATION the %s row carries no commit SHA. A reading that cannot be pinned to a revision is a claim, not a record.\n' \
        "$NOTE_BASENAME"
      failures=$((failures + 1))
    else
      local s
      for s in "${shas[@]}"; do
        if ! printf '%s' "$s" | grep -qE '^[0-9a-f]{7,40}$'; then
          printf '  VIOLATION the %s row carries %q, which is not a commit SHA.\n' "$NOTE_BASENAME" "$s"
          failures=$((failures + 1))
        fi
      done
    fi
  fi

  # 3. uncited mechanic assertions.
  local file line lineno hits=0
  while IFS= read -r file; do
    [ -f "$file" ] || continue
    lineno=0
    while IFS= read -r line; do
      lineno=$((lineno + 1))
      [[ "$line" =~ $WATCH_TARGET_PATTERN ]] || continue
      [[ "$line" =~ $MECHANIC_PATTERN ]] || continue
      is_cited "$line" "$notes_dir" && continue
      printf '  VIOLATION %s:%d names a watch target and asserts a mechanic with no citation to a research note:\n    %s\n' \
        "${file#"${root}/"}" "$lineno" "${line:0:160}"
      hits=$((hits + 1))
    done <"$file"
  done < <(design_files "$root")
  failures=$((failures + hits))

  # 4 + 5. granularity and a decision, read off the note.
  local verdicts
  verdicts=$(parse_verdict_table "$note" || true)
  local total_rows
  total_rows=$(printf '%s\n' "$verdicts" | grep -c . || true)
  if [ "$total_rows" -lt 5 ]; then
    printf '  VIOLATION %s carries %s per-claim verdict rows; the brief requires a verdict PER MECHANIC. A note reading "all claims verified" satisfies the wording while verifying nothing.\n' \
      "$NOTE_REL" "$total_rows"
    failures=$((failures + 1))
  fi
  # A CONFIRMED row has to name the file it came from. "the repo" is not a file.
  local id verdict source
  while IFS=$'\t' read -r id verdict source; do
    [ -n "$id" ] || continue
    [ "$verdict" = "CONFIRMED" ] || continue
    if ! printf '%s' "$source" | grep -qE "$FILE_TOKEN"; then
      printf '  VIOLATION %s claim %s is CONFIRMED but names no file in the checkout (source cell: %q).\n' \
        "$NOTE_BASENAME" "$id" "$source"
      failures=$((failures + 1))
    fi
  done <<<"$verdicts"

  # The RECORDED decision, not every mention of the three words. A note that
  # explains what ADOPT and DEFER would mean before choosing KEEP mentions all
  # three legitimately, so scanning for the words counts the explanation as a
  # second decision. Only the declared heading counts, and there must be one.
  local decisions
  decisions=$(grep -oiE '^#+ .*[Dd]ecision:? \*\*\**(ADOPT|KEEP|DEFER)' "$note" \
    | grep -oiE '(ADOPT|KEEP|DEFER)$' | sort -u | tr '\n' ' ')
  decisions="${decisions% }"
  if [ -z "$decisions" ]; then
    printf '  VIOLATION %s declares no ADOPT / KEEP / DEFER decision heading. A comparison that concludes nothing is a comment, not a decision.\n' \
      "$NOTE_BASENAME"
    failures=$((failures + 1))
  elif [ "$(printf '%s' "$decisions" | wc -w | tr -d ' ')" -ne 1 ]; then
    printf '  VIOLATION %s declares more than one decision (%s). The answer is exactly one.\n' \
      "$NOTE_BASENAME" "$decisions"
    failures=$((failures + 1))
  fi

  # 4b. the index row's headline verdict counts must equal the note's table.
  #     The brief warns the row and the note must not drift; this is the clause
  #     that catches it. It exists because the counts were WRONG on the first
  #     pass - the index said 5 CONFIRMED / 4 REFUTED against a table of
  #     9 / 5 / 1 - and nothing short of a reader counting by hand would have
  #     found it. A summary nobody can check is a summary that will rot.
  local n_conf n_ref n_unver
  n_conf=$(printf '%s\n' "$verdicts" | awk -F'\t' '$2 == "CONFIRMED"' | grep -c . || true)
  n_ref=$(printf '%s\n' "$verdicts" | awk -F'\t' '$2 == "REFUTED"' | grep -c . || true)
  n_unver=$(printf '%s\n' "$verdicts" | awk -F'\t' '$2 == "UNVERIFIED"' | grep -c . || true)
  if [ -n "$row" ]; then
    local headline
    headline=$(printf '%s' "$row" | awk -F'|' '{ print $4 }')
    if printf '%s' "$headline" | grep -qE '[0-9]+ CONFIRMED'; then
      local claim_conf claim_ref claim_unver
      claim_conf=$(printf '%s' "$headline" | grep -oE '[0-9]+ CONFIRMED' | grep -oE '^[0-9]+')
      claim_ref=$(printf '%s' "$headline" | grep -oE '[0-9]+ REFUTED' | grep -oE '^[0-9]+' || true)
      claim_unver=$(printf '%s' "$headline" | grep -oE '[0-9]+ UNVERIFIED' | grep -oE '^[0-9]+' || true)
      if [ "$claim_conf" != "$n_conf" ]; then
        printf '  VIOLATION the index row claims %s CONFIRMED; %s carries %s. The row and the note have drifted.\n' \
          "$claim_conf" "$NOTE_BASENAME" "$n_conf"
        failures=$((failures + 1))
      fi
      if [ "${claim_ref:-0}" != "$n_ref" ]; then
        printf '  VIOLATION the index row claims %s REFUTED; %s carries %s. The row and the note have drifted.\n' \
          "${claim_ref:-0}" "$NOTE_BASENAME" "$n_ref"
        failures=$((failures + 1))
      fi
      if [ "${claim_unver:-0}" != "$n_unver" ]; then
        printf '  VIOLATION the index row claims %s UNVERIFIED; %s carries %s. The row and the note have drifted.\n' \
          "${claim_unver:-0}" "$NOTE_BASENAME" "$n_unver"
        failures=$((failures + 1))
      fi
    fi
  fi

  # 6. the same reading, listed in THIRD-PARTY-NOTICES.md, carrying the same SHAs.
  #    Two records of one reading drift, and the one that drifts is the one
  #    nobody re-reads. The check-moltbook-claims.sh precedent does this for
  #    Moltbook; a watchlist that skips it for its own primary target is the
  #    same gap in new clothes.
  local notices="${root}/${NOTICES_REL}"
  # shas is only populated when the index row was found; under set -u an unset
  # array here aborts the whole run instead of reporting the row that is missing.
  if [ -f "$notices" ] && [ "${#shas[@]}" -gt 0 ]; then
    local idx sha
    for idx in "${!shas[@]}"; do
      sha="${shas[$idx]}"
      # The notices file records a 12-char prefix, so compare on that.
      if ! grep -qiE "spacemolt[^|]*\|[^|]*\|[^|]*${sha:0:12}" "$notices"; then
        printf '  VIOLATION %s lists SHA %s but %s has no spacemolt row carrying it. Two records of one reading drift.\n' \
          "$INDEX_REL" "$sha" "$NOTICES_REL"
        failures=$((failures + 1))
      fi
    done
  fi

  return "$failures"
}

# Re-resolve the note's file:line citations against the real checkouts when they
# are on disk. .tmp/ is gitignored, so this is absent in CI and in a fresh
# clone; saying so is the whole point.
# Locate a file inside a checkout, deterministically. Root first, then by
# shallowest path, then a recursive search. `find | head -1` alone is not
# deterministic - spacemolt-lib has a second README.md under formal/ whose line
# 11 is a table separator, and it won the race, so the check asserted evidence
# against the wrong file and reported a false rotted note.
resolve_in() {
  local dir="$1" name="$2"
  [ -d "$dir" ] || return 0
  if [ -f "${dir}/${name}" ]; then
    printf '%s' "${dir}/${name}"
    return 0
  fi
  find "$dir" -type f -name "$name" -not -path '*/.git/*' 2>/dev/null \
    | awk -F/ '{ print NF - 1 "\t" $0 }' \
    | sort -n -k1,1 | head -1 | cut -f2-
}

cross_check() {
  # Declared in separate statements on purpose: `local a="$1" b="${a}/x"` does not
  # see a yet, and `set -u` turns that into an unbound-variable abort rather
  # than a subtle wrong value.
  local root="$1"
  local note="${root}/${NOTE_REL}"
  local client_dir="${root}/.tmp/spacemolt-client"
  local lib_dir="${root}/.tmp/spacemolt-lib"
  local resolved=0 failed=0 checked=0

  if [ ! -d "$client_dir" ] && [ ! -d "$lib_dir" ]; then
    printf '  cross-check SKIPPED: neither .tmp/spacemolt-client nor .tmp/spacemolt-lib is present (.tmp/ is gitignored). The structural checks above still ran. This line is printed rather than a pass so nobody reads green as "the citations were re-resolved".\n'
    return 0
  fi

  # One line per claim, quoted from the checkout, asserted byte-for-byte when
  # the checkout is available. Without this the cross-check only proves a file
  # is long enough to contain the line number - it would stay green through a
  # rebase that moved every one of these, which is the whole way a research note
  # rots.
  #
  # The checkout is named explicitly because BOTH have a README.md and a
  # LICENSE, and resolving by basename alone picked the client's README for a
  # claim whose evidence is the library's. format: claim|checkout|basename|line|exact substring
  readonly EVIDENCE_CLAIMS=(
    'S1|client|client.ts|1040|X-Session-Id'
    'S2|client|client.ts|1093|await execute('
    'S2|client|client.ts|1006|isSessionExpired'
    'S4|client|client.ts|1012|createSession() : session'
    'S5|lib|errors.ts|73|another connection took your slot'
    'S5|lib|account.ts|1498|that session would replace any newer one'
    'S5|lib|account.ts|299|CLOSE_CODE.SESSION_REPLACED'
    'S6|client|client.ts|1394|friend_online'
    'S8|lib|COMMANDS.md|146|View current battle status'
    'S9|lib|account.ts|1482|subscriptions restored'
    'S11|client|client.ts|2787|Actions execute on the next tick'
    'S12|lib|README.md|11|drives every account you own'
    'S15|lib|LICENSE|1|MIT License'
  )

  local file line_no cited_file found
  while IFS=$'\t' read -r _id _verdict source; do
    [ -n "$source" ] || continue
    # The token has to allow for the closing backtick, or the extraction matches
    # nothing and the cross-check reports "0 citations resolved" in the same
    # breath as a pass. It did exactly that on the first run.
    while IFS= read -r cited_file; do
      [ -n "$cited_file" ] || continue
      file="${cited_file%%:*}"
      # The extracted token keeps Markdown's closing backtick (it is what let the
      # citation match at all), so strip it before asking the filesystem for the
      # file. Left in, every one of the twelve citations resolved to nothing.
      file="${file//${BACKTICK}/}"
      line_no="${cited_file##*:}"
      line_no="${line_no%%-*}"
      [[ "$line_no" =~ ^[0-9]+$ ]] || continue
      # The note cites a basename (`client.ts`), not a checkout-relative path, so
      # the file has to be located rather than joined. A direct join found
      # nothing and quietly resolved nothing.
      found=$(resolve_in "$client_dir" "$file")
      [ -n "$found" ] || found=$(resolve_in "$lib_dir" "$file")
      if [ -z "$found" ]; then
        printf '  VIOLATION citation %s resolves to no file in either checkout.\n' "$cited_file"
        failed=$((failed + 1))
        continue
      fi
      local total
      total=$(wc -l <"$found" | tr -d ' ')
      resolved=$((resolved + 1))
      if [ "$line_no" -gt "$total" ]; then
        printf '  VIOLATION citation %s points past the end of %s (%s lines). The note has rotted.\n' \
          "$cited_file" "${found#"${root}/"}" "$total"
        failed=$((failed + 1))
      fi
    done < <(printf '%s\n' "$source" | grep -oE "${FILE_TOKEN}:[0-9]+(-[0-9]+)?" || true)
  done < <(parse_verdict_table "$note" || true)

  if [ "$resolved" -eq 0 ] && [ "$failed" -eq 0 ]; then
    printf '  VIOLATION cross-check resolved ZERO citations against the on-disk checkouts. The checkouts are present, so extracting nothing is a broken extractor, not a clean result.\n'
    return 1
  fi

  # Byte-for-byte evidence assertions, now that the citations have resolved.
  local row claim_id which ev_file ev_line ev_text target actual
  for row in "${EVIDENCE_CLAIMS[@]}"; do
    claim_id="${row%%|*}"
    row="${row#*|}"
    which="${row%%|*}"
    row="${row#*|}"
    ev_file="${row%%|*}"
    row="${row#*|}"
    ev_line="${row%%|*}"
    ev_text="${row#*|}"
    case "$which" in
      client) target=$(resolve_in "$client_dir" "$ev_file") ;;
      lib) target=$(resolve_in "$lib_dir" "$ev_file") ;;
      *) target="" ;;
    esac
    if [ -z "$target" ]; then
      printf '  VIOLATION evidence for %s names %s in checkout "%s", which is not there.\n' \
        "$claim_id" "$ev_file" "$which"
      failed=$((failed + 1))
      continue
    fi
    actual=$(sed -n "${ev_line}p" "$target")
    if ! printf '%s' "$actual" | grep -qF -- "$ev_text"; then
      printf '  VIOLATION evidence for %s no longer holds: %s:%s no longer contains %s\n' \
        "$claim_id" "$ev_file" "$ev_line" "'$ev_text'"
      printf '      found: %s\n' "${actual:0:100}"
      failed=$((failed + 1))
      continue
    fi
    checked=$((checked + 1))
  done

  if [ "$checked" -eq 0 ]; then
    printf '  VIOLATION cross-check asserted ZERO evidence lines despite present checkouts.\n'
    return 1
  fi

  if [ "$failed" -eq 0 ]; then
    printf '  cross-check: %s file:line citations resolved, %s evidence lines asserted byte-for-byte.\n' \
      "$resolved" "$checked"
  fi
  return "$failed"
}

# A guard nobody has seen fail is not a guard. Each case below is a real mutation
# of the tree, run through the same check_against a normal run uses, asserting it
# goes red. Planted inputs, not greps for the guard's own pattern.
self_test() {
  local failures=0
  local pristine

  # An EXIT trap, not a RETURN trap: RETURN fires on the return of every nested
  # function too, so the probe directory was torn down by expect_red's first
  # call and the next case read from a directory that no longer existed.
  PROBE=$(mktemp -d)
  trap 'rm -rf "${PROBE:-/nonexistent}"' EXIT
  local probe="${PROBE}"
  pristine="${probe}/.pristine"
  mkdir -p "${probe}/docs/research" "${probe}/docs/design" "$pristine"
  local rel
  for rel in "$NOTE_REL" "$INDEX_REL" "$PLAN_REL" "$NOTICES_REL"; do
    cp "${REPO_ROOT}/${rel}" "${probe}/${rel}"
    cp "${REPO_ROOT}/${rel}" "${pristine}/$(basename "$rel")"
  done
  printf '# agents\n' >"${probe}/AGENTS.md"
  printf '# battle-agents\n' >"${probe}/README.md"

  restore_probe() {
    local rel
    rm -rf "${probe:?}/docs"
    mkdir -p "${probe}/docs/research" "${probe}/docs/design"
    for rel in "$NOTE_REL" "$INDEX_REL" "$PLAN_REL" "$NOTICES_REL"; do
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

  # A mutation that matches nothing leaves the tree pristine, and "this case should
  # have gone red" then proves nothing. Two cases in this repo's history did
  # exactly that, so every mutation below is bracketed by a checksum and a no-op
  # fails the self-test loudly.
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

  local b

  # 1. the index row removed. This is the failure the brief calls (a).
  b=$(stamp "${probe}/${INDEX_REL}")
  perl -i -pe 's/^\| \[spacemolt\.md\].*\n$//m' "${probe}/${INDEX_REL}"
  expect_changed "${probe}/${INDEX_REL}" "index row removed" "$b"
  expect_red "index row for the note removed" red
  restore_probe

  # 2. the row survives but its Commit SHA cell is emptied. This is (b), and it is
  #    a separate case on purpose: a row with no SHA is the exact state clause (a)
  #    alone cannot catch.
  b=$(stamp "${probe}/${INDEX_REL}")
  perl -i -pe 's/^(\| \[spacemolt\.md\][^|]*\|)[^|]*\|/${1} |/m' "${probe}/${INDEX_REL}"
  expect_changed "${probe}/${INDEX_REL}" "SHA cell emptied" "$b"
  expect_red "index row present but carrying no commit SHA" red
  restore_probe

  # 3. a design doc asserting a SpaceMolt mechanic with no citation. This is (c),
  #    the clause that earns the check.
  printf 'The world layer follows SpaceMolt: a session resumes automatically after a 30s grace window.\n' \
    >"${probe}/docs/design/phantom.md"
  expect_red "docs/design asserting an uncited SpaceMolt mechanic" red
  rm -f "${probe}/docs/design/phantom.md"

  # 3b. the same line WITH a citation passes. Without this negative control, a
  #     check that greps for the name unconditionally fails on the note's own
  #     index row, and the fix an implementer reaches for is to widen the
  #     exclusion until it greps nothing.
  printf 'The world layer follows SpaceMolt'"'"'s model, per docs/research/spacemolt.md — but we bind battles to sessions instead.\n' \
    >"${probe}/docs/design/cited.md"
  expect_red "the same assertion, cited to the note" green
  rm -f "${probe}/docs/design/cited.md"

  # 3c. the two phrases the plan itself got wrong, restored verbatim. If the
  #     mechanic vocabulary had not been tuned against the real design surface,
  #     these would pass and the check would be decorative.
  printf -- '- sandbox-agent: unified control API across Claude/Codex/OpenCode over HTTP. STEAL: the isolation pattern.\n' \
    >"${probe}/docs/design/uncited-secondary.md"
  expect_red "an unread SECONDARY target asserting a mechanic (transport + STEAL)" red
  rm -f "${probe}/docs/design/uncited-secondary.md"

  # 3d. the negative control for 3c: a bare listing of watch targets, which is
  #     what plan Appendix A legitimately does, must not fire.
  printf 'Named in conversation but NOT cloned: Pixel Agents, Agent Intercom adapters, sandbox-agent, agent-sandbox.\n' \
    >"${probe}/docs/design/listing.md"
  expect_red "a bare listing of watch targets" green
  rm -f "${probe}/docs/design/listing.md"

  # 4. the note collapses to a single blanket verdict, which satisfies the
  #    wording of the deliverable while verifying nothing.
  b=$(stamp "${probe}/${NOTE_REL}")
  perl -i -pe 's/^\| S[0-9]+[[:space:]]*\|.*$//m' "${probe}/${NOTE_REL}"
  expect_changed "${probe}/${NOTE_REL}" "verdict rows stripped" "$b"
  expect_red "per-claim verdict table stripped to a blanket claim" red
  restore_probe

  # 4b. a CONFIRMED row that cites the repo rather than a file in it.
  b=$(stamp "${probe}/${NOTE_REL}")
  perl -i -pe 's/^(\| S5\s*\|.*\|)\s*\*\*CONFIRMED\*\*\s*\|\s*`errors\.ts`:72-83[^|]*\|/${1} **CONFIRMED** | the repo |/m' "${probe}/${NOTE_REL}"
  expect_changed "${probe}/${NOTE_REL}" "S5 source replaced" "$b"
  expect_red "CONFIRMED citing the repo, not a file" red
  restore_probe

  # 5. the decision removed, leaving prose that concludes nothing.
  b=$(stamp "${probe}/${NOTE_REL}")
  perl -i -pe 's/\bKEEP\b/UNDECIDED/g' "${probe}/${NOTE_REL}"
  expect_changed "${probe}/${NOTE_REL}" "decision word removed" "$b"
  expect_red "decision word removed" red
  restore_probe

  # 5b. a SECOND declared decision, which is a note that concluded two things -
  #     the answer is exactly one. The first attempt at this mutation RENAMED the
  #     existing heading, which leaves exactly one decision and so proved
  #     nothing; the case has to ADD a second heading to be the case it claims.
  b=$(stamp "${probe}/${NOTE_REL}")
  printf '\n## 8. The decision: **DEFER**\n\nSuperseded, re-asked at M5.\n' >>"${probe}/${NOTE_REL}"
  expect_changed "${probe}/${NOTE_REL}" "second decision appended" "$b"
  expect_red "two decisions declared" red
  restore_probe

  # 4c. the index row's verdict counts stop matching the note's table. This is
  #     the mutation that corresponds to a mistake actually made while writing
  #     this note, so it is the case that earns its place: the row said
  #     5 CONFIRMED / 4 REFUTED against a table of 9 / 5 / 1.
  b=$(stamp "${probe}/${INDEX_REL}")
  perl -i -pe 's/9 CONFIRMED \/ 5 REFUTED/5 CONFIRMED \/ 4 REFUTED/' "${probe}/${INDEX_REL}"
  expect_changed "${probe}/${INDEX_REL}" "headline counts desynced" "$b"
  expect_red "index headline verdict counts disagree with the note's table" red
  restore_probe

  # 6. the notices file loses the reading while the index keeps it. Two records
  #    of one reading, and nothing tying them together until now.
  b=$(stamp "${probe}/${NOTICES_REL}")
  perl -i -pe 's/^\| spacemolt[^|]*\|[^|]*\|[^|]*\|[^|]*\|[^|]*\|\n//m' "${probe}/${NOTICES_REL}"
  expect_changed "${probe}/${NOTICES_REL}" "spacemolt rows removed from notices" "$b"
  expect_red "notices file no longer records the reading's SHAs" red
  restore_probe

  if [ "$failures" -eq 0 ]; then
    printf '  self-test: all cases behaved as specified.\n'
  fi
  return "$failures"
}

main() {
  # --root makes the script runnable against an arbitrary tree, which is how a
  # gate gets tested against a mutation of the real files rather than a fixture.
  local root="$REPO_ROOT"
  if [ "${1:-}" = "--root" ]; then
    root="$2"
    shift 2
  fi

  if [ "${1:-}" = "--self-test" ]; then
    self_test
    return $?
  fi
  if [ "${1:-}" = "--cross-check" ]; then
    cross_check "$root"
    return $?
  fi

  local failures=0
  check_against "$root" || failures=$?
  cross_check "$root" || failures=$((failures + 1))
  [ "$failures" -eq 0 ] || return "$failures"
  printf '  watchlist claims: ok\n'
}

main "$@"
