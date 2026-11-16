#!/usr/bin/env bash
# Smoke test for the admin-pan image: runs it the way production does and checks headers, routes,
# caching and baked config. Usage: scripts/smoke-image.sh <image-ref> <api-origin>
# Used by CI (job `image`), release.yml and reviewers. Never pulls: the caller pulls.
set -euo pipefail

REF="${1:?usage: smoke-image.sh <image-ref> <api-origin>}"
API="${2:?usage: smoke-image.sh <image-ref> <api-origin>}"
PORT="${PORT:-18080}"
NAME=admin-pan-smoke
BASE="http://127.0.0.1:$PORT"
WORK="$(mktemp -d)"
failed=0

pass() { echo "ok $1"; }
fail() { echo "FAIL $1"; failed=1; }
check() { # check <name> <command...>
  local name="$1"; shift
  if "$@"; then pass "$name"; else fail "$name"; fi
}

cleanup() {
  if [ "$failed" -ne 0 ]; then docker logs "$NAME" 2>&1 | tail -n 40 || true; fi
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# Header names are case-insensitive.
header_value() { tr -d '\r' < "$1" | grep -i "^$2:" | head -n 1 | cut -d' ' -f2-; }
status_of() { head -n 1 "$1" | awk '{print $2}'; }
fetch() { # fetch <path> <prefix> [curl args]  -> $WORK/<prefix>.h and .b
  local path="$1" prefix="$2"; shift 2
  curl -sS -D "$WORK/$prefix.h" -o "$WORK/$prefix.b" "$@" "$BASE$path"
}

full_headers() { # full_headers <header-file>
  local f="$1" ok=0 h
  for h in \
    "Strict-Transport-Security: max-age=31536000; includeSubDomains" \
    "X-Content-Type-Options: nosniff" \
    "X-Frame-Options: DENY" \
    "Referrer-Policy: no-referrer" \
    "Cross-Origin-Opener-Policy: same-origin" \
    "Cross-Origin-Resource-Policy: same-origin" \
    "X-Robots-Tag: noindex, nofollow, noarchive"; do
    tr -d '\r' < "$f" | grep -iqF "$h" || { echo "  missing: $h"; ok=1; }
  done
  tr -d '\r' < "$f" | grep -i '^Permissions-Policy:' | grep -qF 'camera=()' || { echo "  missing: Permissions-Policy camera=()"; ok=1; }
  tr -d '\r' < "$f" | grep -i '^Content-Security-Policy:' | grep -qF "default-src 'none'" || { echo "  missing: Content-Security-Policy"; ok=1; }
  return "$ok"
}

check_status_type_cache() { # <prefix> <status> <content-type> <cache-control>
  local f="$WORK/$1.h"
  [ "$(status_of "$f")" = "$2" ] || { echo "  status $(status_of "$f"), want $2"; return 1; }
  [ -z "$3" ] || header_value "$f" Content-Type | grep -qi "$3" || { echo "  content-type: $(header_value "$f" Content-Type)"; return 1; }
  [ -z "$4" ] || [ "$(header_value "$f" Cache-Control)" = "$4" ] || { echo "  cache-control: $(header_value "$f" Cache-Control)"; return 1; }
}

# 1. runs as non-root
user="$(docker image inspect -f '{{.Config.User}}' "$REF")"
case "$user" in ''|root|0|0:*|root:*) fail "image user is non-root (got '$user')" ;; *) pass "image user is non-root ($user)" ;; esac

# 2. start like production and wait for /healthz
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  -p "127.0.0.1:$PORT:8080" "$REF" >/dev/null
healthy=0
for _ in $(seq 1 30); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/healthz" || true)" = "200" ] && [ "$(curl -s "$BASE/healthz")" = "ok" ]; then healthy=1; break; fi
  sleep 1
done
check "/healthz answers 200 ok (read-only, cap-drop ALL)" test "$healthy" = 1
[ "$healthy" = 1 ] || exit 1

# 3. GET /
fetch / root
check "GET / 200 text/html no-cache" check_status_type_cache root 200 text/html no-cache
check "Server header has no version" test "$(header_value "$WORK/root.h" Server)" = nginx
check "GET / security headers" full_headers "$WORK/root.h"
csp="$(header_value "$WORK/root.h" Content-Security-Policy)"
for s in "default-src 'none'" "script-src 'self' https://challenges.cloudflare.com" \
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com" "font-src 'self' https://fonts.gstatic.com" \
  "connect-src 'self' $API;" "frame-src https://challenges.cloudflare.com" "frame-ancestors 'none'" \
  "base-uri 'none'" "object-src 'none'" "form-action 'self'"; do
  check "CSP contains: $s" grep -qF -- "$s" <<<"$csp"
done
check "CSP has no unsafe-eval" test -z "$(grep -F 'unsafe-eval' <<<"$csp" || true)"
check "CSP script-src has no unsafe-inline" test -z "$(grep -F "script-src 'self' 'unsafe-inline'" <<<"$csp" || true)"

# 4. deep link
fetch /users users
check "GET /users 200 html no-cache" check_status_type_cache users 200 text/html no-cache
check "GET /users serves the SPA shell" grep -qF '<div id="root">' "$WORK/users.b"
check "GET /users security headers" full_headers "$WORK/users.h"

# 5. token routes
for p in /reset-password /verify-email /forgot-password; do
  fetch "$p" tok
  check "GET $p 200 html no-store" check_status_type_cache tok 200 text/html no-store
  check "GET $p security headers" full_headers "$WORK/tok.h"
done

# 6. a real asset keeps the headers
asset="$(grep -oE '/assets/[^"]+\.js' "$WORK/root.b" | head -n 1 || true)"
check "index.html references a JS asset" test -n "$asset"
fetch "$asset" asset
check "GET $asset 200 javascript immutable" check_status_type_cache asset 200 javascript "public, max-age=31536000, immutable"
check "asset security headers" full_headers "$WORK/asset.h"

# 7. things that must 404
for p in /assets/does-not-exist.js /.env /.git/config /x.map; do
  fetch "$p" nf
  check "GET $p is 404" test "$(status_of "$WORK/nf.h")" = 404
  check "404 $p security headers" full_headers "$WORK/nf.h"
done
fetch /assets/does-not-exist.js nf
check "asset 404 is not cached as immutable" test -z "$(header_value "$WORK/nf.h" Cache-Control | grep -E 'immutable|max-age=31536000' || true)"

# 8. other methods
fetch / post -X POST
check "POST / is 405" test "$(status_of "$WORK/post.h")" = 405
check "405 security headers" full_headers "$WORK/post.h"

# 9. baked content
check "bundle contains $API" docker exec "$NAME" sh -c "grep -rl -F '$API' /usr/share/nginx/html/assets | grep -q ."
check "no @mmlabs.online addresses in the bundle" docker exec "$NAME" sh -c "! grep -rlE '@mmlabs\\.online' /usr/share/nginx/html | grep -q ."
check "no source maps in the image" docker exec "$NAME" sh -c "! find /usr/share/nginx/html -name '*.map' | grep -q ."

if [ "$failed" -ne 0 ]; then echo "smoke test FAILED"; exit 1; fi
echo "smoke test passed"
