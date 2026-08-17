# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Registration system for the **Arraigados** camp (Dúnamis, November 13–16 2026, Campamento
Mahanaim, Tamaulipas): a public form where
campers register and upload a payment receipt, plus a protected admin panel to verify payments.
Visual design (colors, fonts, motifs) was derived directly from `frontend/public/logo.png` and
`frontend/public/poster.jpg` — not from a generic template. See **Design system** below before
touching any styling.

Stack: **React + TypeScript + Vite** (served by Nginx in prod) / **FastAPI + SQLAlchemy +
Alembic** / **PostgreSQL** in prod, **SQLite** in local dev. Contenerized for a DigitalOcean
Droplet via `docker-compose.yml`.

## Commands

### Backend (`backend/`)

```bash
python -m venv .venv && .venv\Scripts\activate     # Windows; source .venv/bin/activate on Unix
pip install -r requirements.txt
copy .env.example .env                              # first time only — defaults to SQLite
alembic upgrade head                                 # apply migrations (creates dev.db)
uvicorn app.main:app --reload                        # http://localhost:8000
```

- New migration: `alembic revision -m "description"` (autogenerate is not configured — write
  `upgrade()`/`downgrade()` by hand, following the pattern in `alembic/versions/0001_initial.py`).
- No test suite exists yet. Ad-hoc verification during development used
  `fastapi.testclient.TestClient` against an in-memory/SQLite-backed app instance (see git
  history/conversation for the pattern) — there is no `tests/` directory to run.
- `alembic.ini` lives in `backend/`; alembic commands must be run from that directory (not repo root).

### Frontend (`frontend/`)

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api -> http://localhost:8000 (vite.config.ts)
npm run build       # tsc -b && vite build — this is the only typecheck step, there's no separate lint/test command
```

- `vite.config.ts` sets `server.allowedHosts: true` — Vite 6 otherwise rejects requests whose
  `Host` header it doesn't recognize, which blocks tunneling the dev server through something
  like `ngrok http 5173` to demo it remotely. Dev-only setting, irrelevant to the production
  Nginx-served build.

### Full stack via Docker (prod-parity)

```bash
cp .env.example .env   # root-level, for docker-compose — different from backend/.env.example
docker compose up --build
./deploy.sh             # intended for the DigitalOcean Droplet: builds, starts services,
                         # waits for Postgres healthcheck, runs `alembic upgrade head`,
                         # then restarts backend so it can seed the admin user
```

Two separate `.env.example` files exist and must not be confused: `/​.env.example` (root, for
docker-compose/Postgres) and `backend/.env.example` (for running the backend directly against
SQLite in dev).

## Architecture

### Runtime settings pattern (admin-editable flags)

The shirt-size toggle used to be a compile-time constant in `config.ts` — it no longer is. It's
now a runtime setting stored in the `app_settings` table (single row, `id=1`,
`backend/app/models.py::AppSettings`), seeded on startup by `seed_settings()` in `main.py` (same
shape as `seed_admin()`). Exposed via `GET /api/settings` (public, unauthenticated — the
registration form needs it) and `PATCH /api/admin/settings` (Admin role only). On the frontend,
`src/lib/SettingsContext.tsx` (`useSettings()`) fetches it once at app mount and is the single
source of truth — `showShirtSize` — consumed by `FormularioRegistro.tsx` and `AdminPanel.tsx`.
The toggle UI itself lives inside `components/AdminShirtStats.tsx` (the "Camisetas" panel
section), gated to Admin via a `canEdit` prop, not a route guard.

`app_settings` has a second field, `precio_mxn` (int, pesos — the camp fee, which changes over
time so it isn't a `config.ts` constant either), following the exact same shape: seeded in
`seed_settings()`, exposed via the same GET/PATCH pair, `useSettings().precioMxn` /
`setPrecioMxn()`, edited from `components/AdminAjustes.tsx` ("Costo del campamento" panel
section, same `canEdit` gating), and rendered publicly by `pages/sections/Pago.tsx`.
`AppSettingsUpdate` (`backend/app/schemas.py`) makes every field optional and the PATCH handler
(`routers/admin.py::actualizar_settings`) applies only the fields present via
`model_dump(exclude_unset=True)` — this is what lets the panel controls save independently
without one clobbering the other.

A third field, `pedir_comprobante` (bool, default `True`), toggles whether the registration form
requires a payment receipt upload — same shape again: seeded in `seed_settings()`, exposed via the
same GET/PATCH pair, `useSettings().pedirComprobante` / `setPedirComprobante()`, edited from
`components/AdminComprobanteStats.tsx` ("Comprobante de pago" panel section, same `canEdit`
gating), and consumed by `pages/sections/FormularioRegistro.tsx` to hide/show `FileDrop` and skip
its validation. Because this one gates a required upload rather than just an optional field, the
backend re-checks it server-side in `routers/public.py::crear_registro` (queries `AppSettings`
directly — never trusts the client) before rejecting a registration with no `ticket`; `Camper.ticket_path`/`ticket_mime` are nullable to allow registrations saved with the toggle off.

A fourth field, `registro_abierto` (bool, default `True`), is the master switch for whether the
public registration form accepts new campers at all — same shape again: seeded in
`seed_settings()`, exposed via the same GET/PATCH pair, `useSettings().registroAbierto` /
`setRegistroAbierto()`, edited from `components/AdminRegistroToggle.tsx` ("Registro de camperos"
panel section, first card in `AdminPanel.tsx`, same `canEdit` gating). When off,
`pages/sections/FormularioRegistro.tsx` replaces the form with a "registro cerrado" notice (same
`#registro-form` anchor id) and `pages/sections/Hero.tsx` disables its CTA and swaps its label.
Like `pedir_comprobante`, this is re-checked server-side in `routers/public.py::crear_registro`
(rejects with 403 before any field validation) — the frontend gating is UX only, not the real gate.

**Use this pattern — DB-backed setting + context, not a `config.ts` constant — for any other
value the organizing team should be able to change without a redeploy.** `config.ts` remains the
right place only for values that genuinely need a code change to alter (copy strings, social
links, camp name).

The end-to-end shape to copy for a new optional/toggleable **form field** (as opposed to a
top-level setting) is still: isolated field component (see `components/ShirtSizeField.tsx`) +
nullable backend column + a boolean somewhere the UI can read — branching logic inline is what
this shape exists to avoid.

### Backend request flow

- `app/main.py` wires CORS, mounts routers, and seeds the initial admin user on startup
  (`seed_admin()`, run from the `lifespan` context). Seeding is wrapped to swallow
  `ProgrammingError` silently — this lets the container boot even before migrations have run
  (relevant on first deploy); `deploy.sh` restarts the backend after migrating so seeding
  actually happens.
- Auth is JWT-in-httpOnly-cookie (`security.py`, cookie name `COOKIE_NAME`), not bearer-token —
  `get_current_admin` reads the cookie via a FastAPI `Cookie` dependency, not an `Authorization`
  header. The cookie's `secure` flag is derived from whether `PUBLIC_ORIGIN` starts with
  `https`.
- All `/api/admin/*` routes get `Depends(get_current_admin)` at the router level
  (`routers/admin.py`), so individual endpoints don't need to redeclare the auth dependency.
- Receipt uploads never touch a public static path: `storage.py` sniffs the real MIME type via
  magic bytes (not the client-supplied `Content-Type` or file extension) before saving to
  `settings.tickets_dir` under a random UUID filename. Files are only ever served back through
  the authenticated `GET /api/admin/registros/{id}/ticket` endpoint (`FileResponse`), never
  directly by Nginx.
- `ratelimit.py` is a minimal in-memory per-IP limiter (not Redis-backed) applied via
  `Depends(rate_limit(...))` on `POST /api/registros` and `POST /api/auth/login`. It resets on
  process restart and won't work correctly if the backend is ever scaled to multiple replicas —
  fine for a single-Droplet deployment, but worth knowing if that changes.
- `config.py` (`Settings`, pydantic-settings) is the single source of truth for env-driven
  config and reads `.env` relative to the process's working directory — this is why backend
  commands must be run from `backend/`.

### Frontend structure

- `src/lib/api.ts` is a thin typed `fetch` wrapper (`apiFetch`) that always sends
  `credentials: "include"` so the session cookie round-trips; `ApiError` carries the HTTP status
  for callers that need to branch on it (e.g. 401 → redirect to login). It also always sends
  `ngrok-skip-browser-warning: true` — harmless against the real backend, but without it every
  request gets intercepted by ngrok's browser-warning interstitial (HTML instead of JSON) when
  the app is tunneled for a remote demo. `FormularioRegistro.tsx`'s registration `POST` bypasses
  `apiFetch` (needs raw `fetch` for `FormData`) and sets the same header directly — keep both in
  sync if this ever changes.
- `src/lib/AdminAuthContext.tsx` holds admin session state app-wide (checks `/auth/me` on
  mount); `pages/AdminLogin.tsx` and `pages/AdminPanel.tsx` both redirect via `<Navigate>` based
  on this context rather than route guards/middleware.
- `src/lib/useMediaQuery.ts` is a `matchMedia` hook used to pick between layout variants (e.g.
  `AdminPanel.tsx` table vs. cards) — prefer it over rendering both variants and hiding one with
  CSS, which duplicates the DOM (and duplicates state like `ToggleSwitch`) for no benefit.
- Icons in `src/components/icons/` are hand-drawn SVGs specific to this project (root, leaf,
  church, shirt, receipt, shield-check, etc.) — no icon library is used; add new icons following
  the same `IconProps { size, className, strokeWidth? }` shape (`icons/types.ts`).
- `ToggleSwitch` (`components/ToggleSwitch.tsx`) is the custom animated switch used both for the
  admin payment-verified control and anywhere else a boolean toggle is needed — reuse it rather
  than a plain checkbox.
- `components/AdminResumen.tsx` builds a plain-text summary (total registrations, shirts total +
  breakdown by size) from `GET /admin/stats/tallas` — the same endpoint `AdminShirtStats.tsx`
  already calls — and copies it to the clipboard via `navigator.clipboard.writeText`, for when the
  organizing team needs to share the numbers outside the panel. No backend changes; read-only.
- Animation uses `motion` (Framer Motion v11) — the only animation dependency in the project.
  Reusable motion primitives already exist; reach for them instead of hand-rolling new
  `AnimatePresence`/`useScroll` logic: `components/Reveal.tsx` (scroll fade-up),
  `components/root/generateRoots.ts` + `components/root/AnimatedRoots.tsx` (shared root-drawing
  system — see below), `components/PageTransition.tsx` (route
  transitions), `components/StepProgress.tsx` (multi-step form progress). All must respect
  `useReducedMotion()` — every existing component branches on it, follow that pattern for new ones.
  **Pitfall already hit once:** don't gate an `AnimatePresence` key change behind app state that
  only advances once the animation completes (e.g. "wait for exit, then swap the route") unless
  you're certain the completion callback actually fires — a previous version of
  `PageTransition.tsx` did this and silently froze all navigation because the key never changed
  to begin with. Key `AnimatePresence` directly off real state (e.g. `location.pathname` from
  `useLocation()`), not off a derived/delayed copy of it.
- **Root-drawing system** (`components/root/`) — every decorative root motif on the site
  (`components/RootGrow.tsx` for the Hero/`Confirmacion.tsx`, `components/RootDivider.tsx` for
  the horizontal section dividers) is generated, not hand-drawn: `root/generateRoots.ts` runs a
  seeded-PRNG (`mulberry32`) recursive branching algorithm — trunk → primaries → secondaries →
  fine sprigs, tapering width/opacity per generation, small mid-branch offshoots for a fibrous
  texture — and `root/AnimatedRoots.tsx` draws the resulting segments with the shared
  `pathLength`-via-`whileInView` reveal (respects `useReducedMotion()` like everything else in
  this list).
  - Both consumers call `generateRoots()` with different shape parameters, not different code:
    `primaryAngles`, `primaryLength`, `maxDepth` control the branching; `widthScale` rescales
    stroke width for a smaller root system (the base width formula is calibrated for the Hero's
    long primaries — reuse it at a shorter `primaryLength` without `widthScale` and it reads as
    too thick for its size); `squashY` compresses vertical growth without flattening the curves
    into unnatural zigzags (a much stronger squash was tried first and made the divider look like
    flat spikes instead of roots — keep any squash mild, and prefer narrowing the angle spread
    away from vertical first).
  - `generateRoots()` returns `{ segments, bounds }` — `bounds` is the *real* bounding box of the
    generated paths (control points included, not just endpoints). `RootDivider` builds its
    `viewBox` from `bounds` via `boundsToViewBox()` instead of a guessed fixed size — the shape
    is random per seed, so a fixed `viewBox` could end up shorter than what a given seed actually
    draws, and since the SVG needs `overflow: visible` (to not clip fine root tips) that excess
    would paint outside the space the layout reserved and overlap whatever follows in the DOM.
  - `RootGrow`'s `seed` prop defaults to `7` (the Hero's original, unchanged look); `RootDivider`
    requires a `seed` prop with no default — every call site must pick its own, so the divider
    doesn't silently repeat the same pattern everywhere it's used (`Detalles.tsx`, `Pago.tsx`,
    `AdminPanel.tsx`, `AdminUsers.tsx` each pass a different one; `Confirmacion.tsx` also passes
    its own `seed` to `RootGrow` so it differs from the Hero's).

### Design system

Colors, type, and motion were derived directly from `frontend/public/logo.png` (hand-drawn
yellow/amber root-and-lettering mark) and `poster.jpg` (photo of sunlight through a forest
canopy) — the direction is **"dosel nocturno con luz dorada"** (night canopy, golden light):
a deep green-black base with the logo's yellow/amber acting as light breaking through, and roots
as a recurring structural motif (dividers, form step-progress, hero decoration). Keep new UI
inside this direction rather than introducing an unrelated palette or mood.

- **Tokens live in `src/styles/tokens.css`** (CSS custom properties, Spanish names, all on
  `:root`) and **must be reused** — don't hardcode hex colors, font stacks, radii, shadows, or
  easing curves in component CSS. If a value you need doesn't exist as a token, add it to
  `tokens.css` rather than inlining it.
- **Color:** base `--noche-dosel`/`--corteza`/`--corteza-alta`/`--corteza-baja` (near-black
  greens); light `--amarillo`/`--amarillo-suave`/`--ambar`/`--naranja-raiz` (the logo's palette —
  this is the accent/CTA color family); foliage `--verde-follaje`/`--verde-claro`/
  `--verde-profundo`; sky `--azul-cielo`/`--azul-hondo` (used sparingly, mostly in the original
  background gradient); neutrals `--hueso`/`--hueso-tenue`/`--hueso-apagado` (body text on dark);
  `--coral-error` for validation/error states. `--gradiente-raiz` (yellow→amber→orange) is the
  primary-button fill; `--gradiente-dosel` is the base page background.
- **Type — three fonts, loaded via Google Fonts `<link>` in `index.html`, never add a fourth
  without updating this doc:**
  - `--fuente-display`: **Bagel Fat One** — hero title, page titles (`.display-title`). Chosen to
    echo the hand-drawn lettering in the logo/poster.
  - `--fuente-texto`: **Bricolage Grotesque** — all body copy, labels, buttons, the default.
  - `--fuente-mono`: **IBM Plex Mono** — folios, dates, and tabular/numeric data specifically
    (e.g. the admin table's folio column) via the `.mono` utility class; not for general UI text.
  - Fluid type scale `--t-xs` … `--t-hero` (all `clamp()`) — use these instead of raw `rem`/`px`
    font sizes. `--t-input` (`max(16px, var(--t-base))`) is mandatory on any `<input>`/`<select>`
    — dropping below 16px makes iOS Safari zoom the viewport on focus and never zoom back out;
    this was a real, reported bug (see `.field input`/`.field select` in `global.css`).
- **Spacing/radii/shadows/motion tokens:** `--e-1`…`--e-9` (spacing scale), `--radio-s/m/l/xl`,
  `--sombra-suave/-alta`, `--ease-suave/-resorte/-salida` + `--dur-rapida/-media/-lenta`.
  `--alto-viewport` (100vh, overridden to 100dvh where supported via `@supports`) should back
  any full-viewport-height layout instead of raw `vh` — raw `vh` on mobile is sized to the
  viewport with the URL bar hidden, so content gets clipped while the bar is showing.
- **Glassmorphism is scoped to `Navbar.css` only** — `backdrop-filter: blur(...)` must not
  spread to other components; `.glass-card` (the general card style, `global.css`) also uses a
  light blur but that's the pre-existing baseline, not a new instance to imitate elsewhere.
- **Select dropdown text color:** `<option>` elements ignore the dark-theme `color` set on their
  parent `<select>` once the browser renders its native (usually white) dropdown — always pair
  `.field select` styling with an explicit `.field select option { color: var(--corteza); }`
  rule (already in `global.css`), or new selects will render invisible white-on-white text.
- **Touch targets:** interactive elements should be ≥44px under `@media (pointer: coarse)` —
  see the block in `global.css` for the pattern (`.btn-sm`, chip buttons, icon-only buttons).
- Full context and the original audit trail (design direction rationale, responsive-audit
  findings) lives in the plan files under `~/.claude/plans/` from the sessions that built this —
  not duplicated here, but this doc should stay the source of truth for *current* conventions as
  they evolve.

### Data model

Three tables (`backend/app/models.py`): `campers` (registration + `folio` unique short code +
`pago_verificado`/`verificado_en`/`verificado_por` audit fields), `admin_users`
(username/bcrypt hash/`role`), and `app_settings` (single row, `id=1` — runtime-editable flags,
see the Runtime settings pattern above). `Sexo`, `TallaCamisa`, and `AdminRole`
(`ADMIN`/`VERIFICADOR_PAGO`/`VISUALIZADOR`) are Python/DB enums defined in `models.py` and reused
in `schemas.py`. `campers.ticket_path`/`ticket_mime` are nullable — a registration can exist
without a receipt when the `pedir_comprobante` toggle is off; `CamperOut.tiene_comprobante`
(`schemas.py`, a `computed_field`) is what the frontend checks before showing the "Ver
comprobante" button, since `ticket_path` itself is excluded from the API response.

`folio` is staff-facing only — the backend still generates and returns it from
`POST /api/registros`, and it's how the admin panel (`AdminPanel.tsx` table) identifies a
registration, but `pages/Confirmacion.tsx` deliberately does not display it (or the folio in the
`POST` response at all — `FormularioRegistro.tsx` only reads `data.nombre` off that response).
Payment verification is an internal-only step done from the admin panel; the public confirmation
screen just states the registration succeeded and never promises the camper any follow-up
notification about verification.

**Authorization**: `get_current_admin` (`security.py`) resolves the JWT cookie to a real
`AdminUser` row on every request (not just a decoded claim) — this is deliberate so a role change
or a deleted account takes effect immediately without waiting for the token to expire.
`require_role(*roles)` stacks on top of it as a dependency factory; FastAPI's per-request
dependency caching means stacking it on a route that's already behind the router-level
`Depends(get_current_admin)` doesn't cost a second DB query. The seeded bootstrap admin (from
`ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars) is always created with `role=ADMIN`; every other
account is created from the panel itself (`/admin/usuarios`, Admin role only) — `POST/PATCH/DELETE
/api/admin/usuarios/*` guard against an admin deleting their own account, changing their own
role, or deleting the last remaining Admin.

## Deployment

Three services in `docker-compose.yml`: `db` (Postgres with healthcheck + `pgdata` volume),
`backend` (waits on `db` healthy, mounts `tickets` volume at `/data/tickets`), `frontend`
(Nginx, only service exposing a host port — `80:80`, reverse-proxies `/api/` to `backend:8000`
per `frontend/nginx.conf`). See `README.md` for the full Droplet setup walkthrough (Docker
install, `.env` setup, `./deploy.sh`, useful `docker compose` commands, and the note on adding
TLS via Certbot in front of the `frontend` container).
