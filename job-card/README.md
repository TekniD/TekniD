# Job Card

An offline-first PWA for capturing field service call-outs (IT, networking and
WISP work) on an Android phone and turning each one into a **draft invoice** in
a self-hosted **Invoice Ninja v5** instance.

Built with Next.js 16 (App Router), React 19, Tailwind CSS 4, Dexie (IndexedDB),
`react-signature-canvas` and `browser-image-compression`.

## What it does

- **Works offline.** Clients and products are cached in IndexedDB; job cards are
  queued in `pending_syncs` and pushed when the phone is back on the VPN.
- **Form:** searchable client picker with *Add new client*, time in / time out,
  round-trip travel distance (km by default), searchable product multi-select
  with quantities, work notes, optional client signature.
- **Tarana photos:** when any selected product's key starts with `TAR-`, a camera
  input appears. Photos are compressed in a web worker (max 1.5 MB, 1920 px)
  before they are stored as Base64.
- **Auto lines:** labour hours are calculated in decimal (90 min = 1.5) and billed
  against `STANDARD_LABOR_KEY` or `AFTER_HOURS_LABOR_KEY` (toggle). Travel
  distance > 0 is billed against `TRAVEL_MILEAGE_KEY`. Prices and descriptions
  for these come from the matching Invoice Ninja products.
- **Sync order:** new client first, then the draft invoice, then the signature
  and each photo attached to that invoice. Progress is saved after every step,
  so a dropped connection never creates a duplicate client or invoice.

## Invoice Ninja v5: attaching documents

`POST /api/v1/documents` exists as a route but is an **empty stub in v5** and
does not upload or attach anything. Files are attached through the invoice's own
upload route:

```
POST /api/v1/invoices/{invoice_id}/upload
X-API-TOKEN: …
X-Requested-With: XMLHttpRequest
Content-Type: multipart/form-data   (let the client set the boundary)

_method=PUT
documents[]=<file>          (repeatable; optional is_public=true|false)
```

The route is declared as `PUT`, but PHP can't parse multipart bodies on a real
PUT, so the request is a `POST` with Laravel's `_method=PUT` override. This is
what `src/lib/server/invoiceNinja.ts` and `api-tests.sh` both do.

## Setup

1. **Products in Invoice Ninja.** Create three products and note their
   *product key*: standard labour (price per hour), after-hours labour (price per
   hour) and travel (price per km). Tarana install products should have keys
   starting with `TAR-`.
2. **API token.** Invoice Ninja → Settings → Account Management → Integrations →
   API Tokens.
3. **Environment.**
   ```bash
   cp .env.example .env.local   # then edit
   ```
   | Variable | Purpose |
   | --- | --- |
   | `INVOICE_NINJA_URL` | e.g. `http://10.1.10.5:8888` (no `/api/v1`) |
   | `INVOICE_NINJA_TOKEN` | API token (server-side only, never sent to the phone) |
   | `STANDARD_LABOR_KEY` | product key for normal-hours labour |
   | `AFTER_HOURS_LABOR_KEY` | product key for after-hours / weekend labour |
   | `TRAVEL_MILEAGE_KEY` | product key for travel |
   | `NEXT_PUBLIC_DISTANCE_UNIT` | `km` (default) or `mi`, label only |
4. **Check the API before deploying:**
   ```bash
   ./api-tests.sh            # leaves a test draft invoice
   ./api-tests.sh --cleanup  # deletes it afterwards
   ```
   It verifies the token, lists clients, checks the three product keys exist,
   creates a draft invoice and attaches a test image to it.

## Run

```bash
npm install
npm run dev                      # http://localhost:3000 (service worker off in dev)
npm run build && npm start       # production, standalone server
```

### Docker + Traefik

`Dockerfile` builds a standalone image. `docker-compose.example.yml` shows the
Traefik labels (HTTPS router, LAN/WireGuard IP allow-list, CORS headers blanked).

> **HTTPS is required.** Browsers only allow service workers, "Add to Home
> screen" and camera capture on a secure origin. Plain `http://10.x.x.x` will
> load the page but it won't install or work offline. Give it an internal host
> name with a certificate from Traefik (Let's Encrypt DNS-01 or your own CA).

## Security notes

- The Invoice Ninja token lives only in the server environment. The phone only
  ever talks to `/api/clients`, `/api/products` and `/api/sync`.
- API routes send no `Access-Control-*` headers, refuse `OPTIONS` preflights,
  and reject browser requests whose `Origin` doesn't match the host, so another
  site open on the phone can't use the proxy.
- No proxy/middleware runs on `/api/*` on purpose: Next.js caps buffered bodies
  at 10 MB when one does.

## File structure

```
job-card/
├── api-tests.sh                 # curl checks against Invoice Ninja
├── .env.example
├── Dockerfile, docker-compose.example.yml
├── public/
│   ├── manifest.json            # PWA manifest
│   ├── sw.js                    # service worker (shell cache, background sync)
│   └── icons/
└── src/
    ├── app/
    │   ├── layout.tsx, page.tsx, globals.css
    │   └── api/
    │       ├── clients/route.ts   # GET active clients
    │       ├── products/route.ts  # GET active products (auto-line keys hidden)
    │       └── sync/route.ts      # POST client | invoice | document
    ├── components/
    │   ├── JobCardApp.tsx         # shell, online state, cache refresh
    │   ├── JobCardForm.tsx        # the form + calculations
    │   ├── ClientPicker.tsx, NewClientModal.tsx, ProductPicker.tsx
    │   ├── SignatureField.tsx, PhotoCapture.tsx, QueuePanel.tsx
    │   └── ServiceWorkerRegister.tsx
    └── lib/
        ├── db.ts                  # Dexie: clients, products, pending_syncs
        ├── calc.ts                # decimal hours, TAR- detection
        ├── images.ts              # compression → Base64
        ├── sync.ts                # cache refresh + queue processor
        ├── types.ts
        └── server/
            ├── invoiceNinja.ts    # server-only Invoice Ninja client
            └── http.ts            # no-CORS JSON helpers
```

`public/vendor/browser-image-compression.js` is copied from `node_modules` on
install, because the library otherwise fetches its web worker from a CDN, which
isn't reachable on the VPN.
