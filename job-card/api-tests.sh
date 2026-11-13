#!/usr/bin/env bash
# =============================================================================
# Invoice Ninja v5 API pre-deployment checks for the Job Card app.
#
# Runs the same calls the Next.js API routes make, directly with curl:
#   1. GET  /api/v1/clients                 token valid? pick a client
#   1b. GET /api/v1/products                labour/travel product keys exist?
#   2. POST /api/v1/invoices                create a draft invoice, capture $INVOICE_ID
#   3. POST /api/v1/invoices/$INVOICE_ID/upload   (_method=PUT, documents[])
#      then GET the invoice with ?include=documents to prove it is attached.
#
# IMPORTANT - document uploads in Invoice Ninja v5:
#   POST /api/v1/documents exists as a route but its store() method is an empty
#   stub in v5, so it does NOT upload or attach anything. Files are attached via
#   the entity's own upload route:  PUT /api/v1/invoices/{id}/upload
#   PHP can't parse multipart/form-data on a real PUT, so send a POST with the
#   Laravel method-spoofing field  _method=PUT  plus one or more  documents[]
#   file parts (optional is_public=true|false). Let curl set the multipart
#   Content-Type and boundary; never set it by hand.
#   Run with --try-documents-endpoint to see what POST /api/v1/documents does.
#
# Usage:
#   export INVOICE_NINJA_TOKEN=xxxxx          # or put it in .env.local
#   ./api-tests.sh                            # leaves the draft invoice in place
#   ./api-tests.sh --cleanup                  # deletes the test invoice at the end
#   CLIENT_ID=abc123 ./api-tests.sh           # use a specific client
#
# Needs: bash, curl, jq
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Pick up values from .env.local if present (shell env wins).
if [[ -f "$SCRIPT_DIR/.env.local" ]]; then
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    value="${value%\"}"; value="${value#\"}"
    [[ -z "${!key:-}" ]] && export "$key=$value"
  done < <(grep -E '^[A-Z_]+=' "$SCRIPT_DIR/.env.local")
fi

INVOICE_NINJA_URL="${INVOICE_NINJA_URL:-http://10.1.10.5:8888}"
INVOICE_NINJA_URL="${INVOICE_NINJA_URL%/}"
INVOICE_NINJA_TOKEN="${INVOICE_NINJA_TOKEN:?Set INVOICE_NINJA_TOKEN (env or .env.local)}"
API="$INVOICE_NINJA_URL/api/v1"

CLEANUP=false
TRY_DOCUMENTS=false
for arg in "$@"; do
  case "$arg" in
    --cleanup) CLEANUP=true ;;
    --try-documents-endpoint) TRY_DOCUMENTS=true ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

for bin in curl jq; do
  command -v "$bin" >/dev/null || { echo "Missing dependency: $bin" >&2; exit 1; }
done

# Headers every Invoice Ninja v5 API call needs.
HDR=(-H "X-API-TOKEN: $INVOICE_NINJA_TOKEN" -H "X-Requested-With: XMLHttpRequest" -H "Accept: application/json")

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass() { printf '  \033[32mPASS\033[0m %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$*"; exit 1; }
warn() { printf '  \033[33mWARN\033[0m %s\n' "$*"; }
step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# call METHOD PATH [curl args...] -> body in $TMP/body, status in $STATUS
call() {
  local method="$1" path="$2"; shift 2
  STATUS=$(curl -sS -o "$TMP/body" -w '%{http_code}' -X "$method" "${HDR[@]}" "$@" "$API$path") || fail "curl could not reach $API$path (VPN up?)"
}

# -----------------------------------------------------------------------------
step "1. Auth & fetch: GET /api/v1/clients"
call GET "/clients?per_page=5&status=active"
[[ "$STATUS" == 200 ]] || { jq . "$TMP/body" 2>/dev/null || cat "$TMP/body"; fail "HTTP $STATUS (403 = bad token, 404 = wrong URL)"; }
TOTAL=$(jq -r '.meta.pagination.total // (.data | length)' "$TMP/body")
pass "Token accepted. $TOTAL active client(s)."
jq -r '.data[] | "       \(.id)  \(.display_name // .name)"' "$TMP/body"

CLIENT_ID="${CLIENT_ID:-$(jq -r '.data[0].id // empty' "$TMP/body")}"
[[ -n "$CLIENT_ID" ]] || fail "No clients found. Create one in Invoice Ninja or set CLIENT_ID."
echo "  Using CLIENT_ID=$CLIENT_ID"

# -----------------------------------------------------------------------------
step "1b. Products used for auto line items"
call GET "/products?per_page=500&status=active"
[[ "$STATUS" == 200 ]] || fail "GET /products returned HTTP $STATUS"
pass "$(jq '.data | length' "$TMP/body") product(s) on the first page."
for var in STANDARD_LABOR_KEY AFTER_HOURS_LABOR_KEY TRAVEL_MILEAGE_KEY; do
  key="${!var:-}"
  if [[ -z "$key" ]]; then warn "$var is not set"; continue; fi
  match=$(jq -r --arg k "$key" '.data[] | select((.product_key|ascii_downcase) == ($k|ascii_downcase)) | "\(.product_key) @ \(.price)"' "$TMP/body" | head -1)
  if [[ -n "$match" ]]; then pass "$var=$key found ($match)"; else warn "$var=$key not found; that line would bill at 0.00"; fi
done
TAR=$(jq '[.data[] | select(.product_key | ascii_upcase | startswith("TAR-"))] | length' "$TMP/body")
echo "  $TAR product(s) start with TAR- (these trigger site photos)."

# -----------------------------------------------------------------------------
step "2. Create draft invoice: POST /api/v1/invoices"
TODAY=$(date +%F)
INVOICE_JSON=$(jq -n --arg client "$CLIENT_ID" --arg date "$TODAY" '{
  client_id: $client,
  date: $date,
  public_notes: "API test from api-tests.sh - safe to delete",
  line_items: [
    { product_key: "API-TEST", notes: "API test line item", cost: 1, quantity: 1.5, type_id: "2" }
  ]
}')
echo "$INVOICE_JSON" | jq -c . | sed 's/^/  payload: /'
call POST "/invoices" -H "Content-Type: application/json" --data "$INVOICE_JSON"
[[ "$STATUS" == 200 ]] || { jq . "$TMP/body"; fail "HTTP $STATUS creating invoice"; }

INVOICE_ID=$(jq -r '.data.id' "$TMP/body")
INVOICE_NUMBER=$(jq -r '.data.number' "$TMP/body")
STATUS_ID=$(jq -r '.data.status_id' "$TMP/body")
[[ -n "$INVOICE_ID" && "$INVOICE_ID" != null ]] || fail "No .data.id in response"
pass "Created invoice $INVOICE_NUMBER  INVOICE_ID=$INVOICE_ID  status_id=$STATUS_ID (1 = draft)"

# -----------------------------------------------------------------------------
step "3. Upload & attach document: POST /api/v1/invoices/$INVOICE_ID/upload (_method=PUT)"
# 1x1 PNG, so the test needs no image on disk.
SAMPLE="$TMP/api-test.png"
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' | base64 -d > "$SAMPLE"

call POST "/invoices/$INVOICE_ID/upload" \
  -F "_method=PUT" \
  -F "documents[]=@$SAMPLE;type=image/png;filename=api-test.png"
[[ "$STATUS" == 200 ]] || { jq . "$TMP/body" 2>/dev/null || cat "$TMP/body"; fail "HTTP $STATUS uploading document"; }
pass "Upload accepted (HTTP 200)."

call GET "/invoices/$INVOICE_ID?include=documents"
DOCS=$(jq '.data.documents | length' "$TMP/body")
if [[ "$DOCS" -ge 1 ]]; then
  pass "Invoice now has $DOCS document(s):"
  jq -r '.data.documents[] | "       \(.id)  \(.name)  \(.size) bytes  is_public=\(.is_public)"' "$TMP/body"
else
  fail "Upload returned 200 but no documents are attached"
fi

# -----------------------------------------------------------------------------
if $TRY_DOCUMENTS; then
  step "Optional: POST /api/v1/documents (expected NOT to attach anything in v5)"
  call POST "/documents" -F "documents[]=@$SAMPLE;type=image/png" -F "documentable_id=$INVOICE_ID" -F "documentable_type=invoices"
  echo "  HTTP $STATUS, body: $(head -c 300 "$TMP/body")"
  call GET "/invoices/$INVOICE_ID?include=documents"
  echo "  Documents on invoice afterwards: $(jq '.data.documents | length' "$TMP/body") (unchanged = endpoint is a stub)"
fi

# -----------------------------------------------------------------------------
if $CLEANUP; then
  step "Cleanup: delete test invoice"
  call POST "/invoices/bulk" -H "Content-Type: application/json" --data "$(jq -n --arg id "$INVOICE_ID" '{action:"delete", ids:[$id]}')"
  [[ "$STATUS" == 200 ]] && pass "Deleted $INVOICE_NUMBER" || warn "Delete returned HTTP $STATUS; remove $INVOICE_NUMBER by hand"
else
  echo
  echo "Test invoice $INVOICE_NUMBER left as a draft. Delete it in Invoice Ninja or re-run with --cleanup."
fi

echo
echo "All checks passed. The Job Card app can talk to $INVOICE_NINJA_URL."
