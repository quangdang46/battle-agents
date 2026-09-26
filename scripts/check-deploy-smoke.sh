#!/usr/bin/env bash
# Assert a deployed URL is SERVING, not merely reachable.
#
# WHY THIS EXISTS. The bead's own words: "a green pipeline that deploys a broken
# build must not pass, and a Next.js shell with no API behind it renders fine, so
# 'reachable host' is not evidence." A deploy is not observable from inside the
# repository, so the only thing that settles it is a command with an exit code
# run against the deployed URL. This is that command; wiring it to a deploy
# workflow is the half that needs a Vercel account and is written down in
# docs/design/cloud-deploy-docket.md rather than guessed at here.
#
# The statuses below are MEASURED, not read off the handlers. Each was observed
# against a real instance of this app — configured, migrated, serving — and each
# is paired here with the deployment defect it catches. That pairing is the
# point: a probe that merely returns some 2xx is worthless, and these four are
# chosen so that each one has a specific way to be wrong.
#
#   GET  /                 200 text/html      the deploy answers at all. A 404
#                                            here is a deployment that never
#                                            happened.
#   GET  /api/auth/ok      200 {"ok":true}    the Better Auth mount constructs.
#                                            An unconfigured auth server THROWS
#                                            on every /api/auth path and answers
#                                            500 while the root still serves 200 —
#                                            which is exactly this repository's
#                                            local dev container, and the reason
#                                            the root probe alone settles nothing.
#   POST /api/events       401                the ingest route is mounted AND
#                                            fail-closed. A 404 means no route;
#                                            a 200 means the telemetry edge is
#                                            open to the world, which is worse.
#   POST /api/events       413 + Retry-After, on an OVERSIZED batch
#                                            the size gate runs BEFORE auth,
#                                            which is the documented step order
#                                            in apps/web/src/event-routes.ts. It
#                                            is asserted on the body as well as
#                                            the status, because a hosting
#                                            platform's own request limit also
#                                            answers 413 and the two are not the
#                                            same finding.
#
# NO CREDENTIAL IS READ OR REQUIRED. That is a design constraint, not an
# oversight: the assertions a smoke test can make without provisioning a token
# are the ones that catch a broken DEPLOYMENT, and everything past the
# authenticator needs an installation and a live session. The authenticated
# variant — the 200 with {accepted, sessionId, resumed} — is in the docket with
# the exact request that produces it.
#
# Usage: DEPLOY_URL=https://… bash scripts/check-deploy-smoke.sh
#        bash scripts/check-deploy-smoke.sh --self-test

set -Eeuo pipefail

readonly PROTOCOL_VERSION='0.1.0'
readonly REJECT_EVENTS=100
readonly AUTH_PROBE_PATH='/api/auth/ok'
readonly EVENTS_PATH='/api/events'
readonly PROBE_SESSION_ID='00000000-0000-0000-0000-000000000000'
readonly PROBE_AT='2026-01-01T00:00:00.000Z'

failures=0
fail() {
  printf 'deploy-smoke FAILED: %s\n' "$1" >&2
  failures=$((failures + 1))
}
pass() { printf 'ok   %s\n' "$1"; }

# One well-formed event, small enough that a hosting platform's own request
# limit cannot be what refuses a batch later on.
probe_event() {
  printf '{"type":"test.passed","sessionId":"%s","at":"%s","suite":"unit","count":1}' \
    "$PROBE_SESSION_ID" "$PROBE_AT"
}

probe_batch() {
  printf '{"protocolVersion":"%s","events":[%s]}' "$PROTOCOL_VERSION" "$(probe_event)"
}

# A batch one event past the server's refusal threshold. DEFAULT_BATCH_LIMITS
# puts that at 100 and the route reports the number back in the 413 body, so the
# assertion names the limit the server claims rather than the one this file
# believes in.
oversized_batch() {
  local event i
  event="$(probe_event)"
  printf '{"protocolVersion":"%s","events":[' "$PROTOCOL_VERSION"
  for i in $(seq 1 $((REJECT_EVENTS + 1))); do
    [ "$i" -gt 1 ] && printf ','
    printf '%s' "$event"
  done
  printf ']}'
}

# One probe. Passes on the status AND on a required substring of the body: a
# status alone is satisfiable by a platform error page, which is how "reachable
# host" becomes "working deployment" if nobody looks at what came back.
probe() {
  local name=$1 want_status=$2 want_body=$3 method=$4 path=$5 base=$6 payload=${7:-}
  local body status stderr_file rc
  stderr_file="$(mktemp)"
  # --location on the ROOT probe only, and it is a correction rather than
  # leniency: the app answers 307 from / to the board, which is correct
  # behaviour, and a probe that treats a redirect as a failure reports a working
  # deployment as broken. Following the hop is what "the root serves" means; the
  # API probes deliberately do NOT follow, because a 307 out of /api/events is a
  # routing defect rather than a convenience.
  local -a args=(--silent --show-error --max-time 30 --request "$method" --write-out '\n%{http_code}')
  if [ "$path" = '/' ]; then
    args+=(--location --max-redirs 5)
  fi

  if [ -n "$payload" ]; then
    args+=(--header 'content-type: application/json' --data-binary "$payload")
  fi

  rc=0
  body="$(curl "${args[@]}" "$base$path" 2>"$stderr_file")" || rc=$?
  if [ "$rc" -ne 0 ]; then
    fail "$name: $method $path did not complete (curl exit $rc: $(tr '\n' ' ' <"$stderr_file"))"
    rm -f "$stderr_file"
    return 0
  fi
  rm -f "$stderr_file"

  status="${body##*$'\n'}"
  body="${body%$'\n'*}"

  if [ "$status" != "$want_status" ]; then
    fail "$name: $method $path answered $status, expected $want_status. Body: ${body:0:200}"
    return 0
  fi
  case "$body" in
    *"$want_body"*) ;;
    *)
      fail "$name: $method $path answered $want_status but the body did not contain '$want_body'. Body: ${body:0:200}"
      return 0
      ;;
  esac
  pass "$name"
}

run_probes() {
  local base=$1
  # `<html`, not `<!doctype html`: Next.js emits an uppercase DOCTYPE and the
  # case of that first token is not a property worth a probe. What matters is
  # that the body is a document and not the JSON a 404 or a 500 would carry.
  probe 'the root serves' 200 '<html' GET '/' "$base"
  probe 'the auth mount answers' 200 '"ok":true' GET "$AUTH_PROBE_PATH" "$base"
  # No Authorization header on purpose: the refusal IS the assertion. A
  # deployment that ingests an unauthenticated batch has an open write path into
  # every session's event log.
  probe 'the ingest route refuses an unauthenticated batch' 401 '"error"' \
    POST "$EVENTS_PATH" "$base" "$(probe_batch)"
  probe 'the ingest size gate runs before authentication' 413 '"error":"batch too large"' \
    POST "$EVENTS_PATH" "$base" "$(oversized_batch)"
}

# --- the self-test -----------------------------------------------------------
#
# A check that cannot fail is worse than no check, and several in this repository
# were green while checking nothing. Every probe is run against a stub broken in
# exactly the way that probe exists to catch — including the one the bead names,
# a host that serves a perfectly good root with no API behind it. If any stub
# still passes, that probe is decorative and this script must not claim it.
#
# The first version of this had two defects, both found by running it. The stub
# answered /api/events twice and crashed, and the failure path deleted the stub
# the remaining cases depended on — so four "the broken case is caught" lines
# printed beside a stub that did not exist. A self-test whose cleanup can starve
# its own later cases is a self-test that reports green, which is the thing this
# file is arguing against. Each case now builds its own stub and the run stops at
# the first failure.
self_test() {
  local stub_dir port pid output status broken
  stub_dir="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$stub_dir'" EXIT

  write_stub() {
    cat >"${stub_dir}/server.mjs" <<'STUB'
import { createServer } from 'node:http';

// `broken` names the ONE surface this stub gets wrong, so a probe can be shown
// failing against a server that is otherwise healthy. Anything the stub does not
// break answers exactly what the real app answers.
const broken = process.argv[2] ?? 'none';
const html = (res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><html><body>battle-agents</body></html>');
};
const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'text/plain;charset=UTF-8', ...headers });
  res.end(JSON.stringify(body));
};

// The real order, in apps/web/src/event-routes.ts: size gate, then auth, then
// parse. A stub that answered 413 to everything would have made the 401 probe
// look broken instead of the stub, which is what happened the first time.
const ingest = (res, count) => {
  if (count > 100) {
    if (broken === 'no-gate' || broken === 'ingest-open') {
      return json(res, 200, { accepted: count, sessionId: 'stub', resumed: false });
    }
    return json(res, 413, { error: 'batch too large', limit: 100, retryAfterSeconds: 1 }, {
      'retry-after': '1',
    });
  }
  if (broken === 'ingest-open') {
    return json(res, 200, { accepted: count, sessionId: 'stub', resumed: false });
  }
  return json(res, 401, { error: 'no credential presented; send Authorization: Bearer <token>' });
};

createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://stub');

  // A shell with no API behind it: the root is perfect and everything else 404s.
  if (broken === 'shell' && pathname !== '/') return json(res, 404, { error: 'not found' });
  if (pathname === '/') return html(res);
  if (broken === 'auth-throws' && pathname.startsWith('/api/auth')) {
    return json(res, 500, { error: 'auth is not configured' });
  }
  if (pathname === '/api/auth/ok') return json(res, 200, { ok: true });
  if (pathname === '/api/events') {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      let count = 0;
      try {
        count = JSON.parse(raw).events.length;
      } catch {
        count = 0;
      }
      // A deployment that ingests an unauthenticated batch: the 401 never fires.
      return ingest(res, count);
    });
    return;
  }
  json(res, 404, { error: 'not found' });
}).listen(Number(process.argv[3]), '127.0.0.1');
STUB
  }

  run_case() {
    broken=$1
    local want=$2
    write_stub
    port=$(( (RANDOM % 2000) + 40000 ))
    node "${stub_dir}/server.mjs" "$broken" "$port" >/dev/null 2>&1 &
    pid=$!

    local attempt
    for attempt in $(seq 1 50); do
      if curl --silent --max-time 1 --output /dev/null "http://127.0.0.1:$port/" 2>/dev/null; then
        break
      fi
      if ! kill -0 "$pid" 2>/dev/null; then
        printf 'self-test FAILED: the stub for "%s" died before it served a request.\n' "$broken" >&2
        return 1
      fi
      sleep 0.1
    done

    status=0
    output="$(DEPLOY_URL="http://127.0.0.1:$port" bash "${BASH_SOURCE[0]}" 2>&1)" || status=$?
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true

    if [ "$want" = 'pass' ]; then
      if [ "$status" -ne 0 ]; then
        printf 'self-test FAILED: a HEALTHY deployment was reported broken:\n%s\n' "$output" >&2
        return 1
      fi
      printf 'self-test ok: a healthy deployment passes all four probes.\n'
      return 0
    fi

    if [ "$status" -eq 0 ]; then
      printf 'self-test FAILED: a deployment broken as "%s" PASSED, so nothing catches it.\n' \
        "$broken" >&2
      return 1
    fi
    printf 'self-test ok: a deployment broken as "%s" goes red (%s).\n' \
      "$broken" "$(printf '%s' "$output" | grep -c 'deploy-smoke FAILED') probe(s) failed"
  }

  run_case none pass || return 1
  run_case shell fail || return 1
  run_case auth-throws fail || return 1
  run_case ingest-open fail || return 1
  run_case no-gate fail || return 1
  return 0
}

if [ "${1:-}" = '--self-test' ]; then
  self_test
  exit $?
fi

DEPLOY_URL="${DEPLOY_URL:-}"
if [ -z "$DEPLOY_URL" ]; then
  printf 'DEPLOY_URL is not set.\n' >&2
  printf 'Usage: DEPLOY_URL=https://your-deployment bash %s\n' "${BASH_SOURCE[0]}" >&2
  printf 'Or exercise the probes themselves: bash %s --self-test\n' "${BASH_SOURCE[0]}" >&2
  exit 2
fi
DEPLOY_URL="${DEPLOY_URL%/}"

printf 'deploy-smoke: probing %s\n' "$DEPLOY_URL"
run_probes "$DEPLOY_URL"

if [ "$failures" -ne 0 ]; then
  printf 'deploy-smoke: %d probe(s) failed. A deployment that does not answer all four is not working.\n' \
    "$failures" >&2
  exit 1
fi
printf 'deploy-smoke: %s serves, and the API behind it is wired.\n' "$DEPLOY_URL"
