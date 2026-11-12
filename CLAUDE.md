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

- Optional, for the payment-receipt reader (see *Conciliación de comprobantes*): put `GEMINI_API_KEY=`
  in `backend/.env` (free key from aistudio.google.com) and, for the local fallback, install Tesseract
  (`winget install UB-Mannheim.TesseractOCR`, then `TESSERACT_CMD=C:/Program Files/Tesseract-OCR/tesseract.exe`
  — use forward slashes, a Windows-style path with backslashes gets its backslash-t read as a tab character). `python -m app.procesar_comprobantes [--todos]`
  reads receipts from the command line. Without either, everything still runs; receipts are just
  captured by hand.
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
- The conditional validation/normalization rules for a camper's data (consejero requires
  teléfono, campero's `bautizado` gates `bautismo_mes`/`bautismo_anio`, `tiene_promocion` gates
  `promocion_detalle`, `talla_camisa == OTRA` gates `talla_otra`) live in one place,
  `app/validacion_camper.py` (`validar_datos_camper`/`normalizar_datos_camper`, pure functions,
  no FastAPI-routing or DB session — same shape as `equipos_balance.py`). Both
  `POST /api/registros` (`routers/public.py::crear_registro`) and
  `PATCH /api/admin/registros/{id}` (`routers/admin.py::actualizar_registro`, Admin-only — lets
  an admin correct a registrant's captured data from the panel) call these so the two can never
  diverge on what counts as valid. The client-side mirror is
  `frontend/src/lib/camperForm.ts` (`fieldError`), shared by
  `pages/sections/FormularioRegistro.tsx` and `components/EditarCamperModal.tsx` — adding a field
  to the registration form means touching both of these modules, not duplicating the rule.
  `actualizar_registro` deliberately never touches `folio`, the receipt, the
  `pago_verificado`/`asistio` audit fields, or `equipo_id`/`equipo_fijado` — those stay behind
  their own endpoints (`/pago`, `/asistencia`, `/equipo`, `/admin/equipos`) — and it does not
  re-run the team-balancing pass even if edad/sexo/iglesia/zona/bautismo change.
- **Church names are unified, because `equipos_balance` compares `iglesia` as text** — the same church
  used to arrive as "Iglesia Bautista Eliacim" / "Eliacim" / "ELIACIM", so the team balancer saw
  several churches. `app/iglesias.py` (pure module + two DB helpers) fixes this at write time:
  `clave_iglesia()` ignores case, accents, punctuation and filler words (iglesia, bautista, ib, el,
  de…) and expands the sigla `pib` → `primera`; `canonicalizar_iglesia(db, texto, zona)` replaces
  what was typed with the official spelling **only when its key is exactly equal** to an existing
  church *in the same zona* (same name in another zona is another church) — never by similarity, so
  Betania/Betsaida or "Emanuel"/"Emanuel de Ciudad Madero" stay separate. Called from
  `public.py::crear_registro` and `admin.py::actualizar_registro`. `GET /api/iglesias?zona=` (public,
  rate-limited, names only) feeds `components/IglesiaField.tsx`, an autocomplete combobox whose
  suggestion list **floats** (`position: absolute` under the input, inside `.iglesia-field-control`) —
  it used to be in the page flow, which pushed the form buttons down ~250px, left a blank gap next to
  the neighbouring field and jumped on every keystroke. For it not to be clipped, `.form-card` uses
  `overflow-x: clip` (only the ±40px step slide needs clipping), never `overflow: hidden` — don't
  put it back or the list gets cut off at the card's bottom edge; its stacking comes from the
  `--z-desplegable` token (`tokens.css`, between content and navbar). On touch screens focusing the
  input scrolls it near the top so the list sits above the keyboard. Any new dropdown/popover that
  must overlap form content should follow this same shape (absolute inside a `position: relative`
  wrapper + `--z-desplegable`), not render in flow. That's why the form now asks **zona before
  iglesia** (`FormularioRegistro.tsx` and `EditarCamperModal.tsx`). Typing without picking a suggestion is
  still allowed. It does **not** fix typos ("Eliasim") — suggestions are what prevent those. The
  one-time cleanup of the production data was done by hand (backup + mapping in a single
  transaction), not by this code. The suggestion box is deliberately **two layers**
  (`.iglesia-field-lista` = rounded border + `overflow: hidden` + padding; inner
  `.iglesia-field-opciones` = the scroller): with a single `overflow: auto` element that has a
  `border-radius`, the OS scrollbar sits flush against the rounded corners and sticks out of them.
  Its thin amber scrollbar uses `::-webkit-scrollbar*` (which can hide the arrow buttons) and
  falls back to `scrollbar-width`/`scrollbar-color` only under `@supports not
  selector(::-webkit-scrollbar)` — never declare both, in Chrome the standard properties cancel the
  pseudo-elements.

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
  mount — which answers `200 null`, not 401, when there is no session, via
  `security.get_optional_admin`, so public pages don't log a console error on every load; every
  other `/api/admin/*` route still uses `get_current_admin` and 401s as before); `pages/AdminLogin.tsx` and `pages/AdminPanel.tsx` both redirect via `<Navigate>` based
  on this context rather than route guards/middleware.
- `src/lib/useMediaQuery.ts` is a `matchMedia` hook used to pick between layout variants (e.g.
  `AdminPanel.tsx` table vs. cards, breakpoint `1024px`, kept in sync with the same value in
  `AdminPanel.css`) — prefer it over rendering both variants and hiding one with CSS, which
  duplicates the DOM (and duplicates state like `ToggleSwitch`) for no benefit. The desktop table
  itself merges `CamperOut`'s ~16 fields into 7 fixed-width columns (`table-layout: fixed` +
  `<colgroup>`, so it can never overflow) — folio/nombre/iglesia, tipo+zona+edad+sexo, equipo,
  fecha de pago + `ToggleSwitch`, comprobante, llegó, and an expand chevron. Secondary fields
  (talla, teléfono, bautizado, promoción, ciudad, verification/attendance audit fields, borrar)
  live in a single per-row expandable detail (`admin-table-detail-row`, one row open at a time via
  `expandido` state, `AnimatePresence`/`m.div` height animation respecting `useReducedMotion()`)
  instead of adding columns — adding a field back as a column is what caused the horizontal-scroll
  bug this pattern replaced. That detail's contents are `components/CamperDetalle.tsx`, shared with
  the sub-1024px card view's own collapsible detail (`components/AdminCamperCard.tsx` — avatar with
  initials, side stripe and team pill in the team's color, a green/amber payment strip with the
  verification toggle, comprobante/detalle buttons; 2 columns of cards from 640px) so the
  two layouts can never again show different fields for the same registro — which fields it shows
  depends on `tipo`: teléfono only for `CONSEJERO`, bautismo only for `CAMPERO` (mirroring the same
  rule in `lib/camperForm.ts::fieldError`, the registration form's source of truth for which fields
  each participant type is even asked). Dates in the panel (`created_at`, `verificado_en`,
  `asistio_en`, `fecha_pago`) are formatted with `lib/fecha.ts` (`formatFechaHora`/`formatFechaCorta`)
  rather than inline `toLocaleString` calls — it exists specifically to dodge two timezone traps:
  SQLite (dev) stores datetimes naive (no offset), so `formatFechaHora` appends `Z` before parsing
  since the backend always writes UTC (`models.py::_now`); and `fecha_pago` is a date-only string,
  which `new Date(s)` would parse as UTC midnight and render one day early in Mexico's timezone, so
  `formatFechaCorta` builds the `Date` from its y/m/d parts instead.
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
  Loaded via `LazyMotion` (`App.tsx`, `features={domAnimation}`, `strict`) instead of the full
  `motion` import — this is what lets the animation engine be tree-shaken out of the initial
  bundle. **Consequence: every component uses `m.div`/`m.img`/etc. (imported as `{ m }` from
  `"motion/react"`), never `motion.div`** — `strict` on the provider throws at runtime if a raw
  `motion.*` component renders, specifically to catch this. `domAnimation` covers everything the
  project actually uses (animate/exit/variants/whileHover/whileTap/whileInView) but not
  drag/layout animations (`domMax`) — if a future feature needs those, swap the features import,
  don't reach for `domMax` by default. `AnimatePresence`, `useReducedMotion`, `useScroll`,
  `useTransform` etc. stay named imports from `"motion/react"` as before — only the `motion.*`
  component namespace is affected by lazy-loading.
  Reusable motion primitives already exist; reach for them instead of hand-rolling new
  `AnimatePresence`/`useScroll` logic: `components/Reveal.tsx` (scroll fade-up),
  `components/root/generateRoots.ts` + `components/root/AnimatedRoots.tsx` (shared root-drawing
  system — see below), `components/PageTransition.tsx` (route
  transitions), `components/StepProgress.tsx` (multi-step form progress),
  `components/FieldReveal.tsx` (height+fade collapse/expand for a single grid item, used to animate
  a conditional form field appearing/disappearing based on a previous answer — e.g.
  `FormularioRegistro.tsx`'s teléfono/bautismo/promoción fields, `ShirtSizeField.tsx`'s `talla_otra`
  — wrap it in `<AnimatePresence initial={false}>` with a stable `key`; don't hand-roll another
  height-collapse animation). All must respect
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
    `Carta.tsx` each pass a different one; `Confirmacion.tsx` also passes its own `seed` to
    `RootGrow` so it differs from the Hero's).
  - **Roots are for the public site only.** None of the admin screens (`AdminPanel`, `AdminUsers`,
    `Recepcion`, `Equipos`, `Conciliacion`) uses `RootDivider`/`RootGrow` — they're work screens and
    the team wants them uncluttered. Don't add roots to a new admin page; an earlier version of
    `Conciliacion.tsx` had a divider and it was removed on request.

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
- **Images:** `poster.jpg`/`poster-{800,1600,2200}.jpg` and `logo.png` each have a WebP sibling
  (`.webp`, same base name, generated with `sharp-cli`) — every place that renders one wraps it in
  `<picture><source type="image/webp" srcSet="..."/><img src="....jpg|png" .../></picture>`
  (`Hero.tsx`, `AdminLogin.tsx`, `Navbar.tsx`) so browsers without WebP support still get the
  original file; regenerate the `.webp` if the source image ever changes (`npx sharp-cli -i
  poster-800.jpg -o poster-800.webp -f webp -q 62 --effort 6 --smartSubsample` for photos, `-q
  lossless` for the flat-color logo). `index.html`'s hero-poster `<link rel=preload>` and the
  favicon `<link rel=icon>` both point at the `.webp` variant directly (no fallback needed there —
  `type="image/webp"` makes unsupporting browsers skip the preload harmlessly, and virtually every
  browser still receiving updates supports WebP) — **keep the favicon on the same file the
  Navbar/Hero `<picture>` already loads** (currently `logo.webp`); pointing it at a different file
  than the visible logo defeats the cache reuse and doubles the bytes downloaded for what's
  visually the same image.
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
- **Background cost / `.equipo-ligero`:** `CanopyBackground` (fixed, mounted outside `<Routes>`,
  so it animates on every route) is the most expensive layer on a slow PC. Its light rays are
  plain `radial-gradient`s that fade to 0 at their own edge (`--gradiente-luz`/
  `--gradiente-luz-verde`, `ellipse closest-side`) — **no `filter: blur` and no `mix-blend-mode`**
  on any full-screen layer; don't reintroduce them. An inline script in `index.html` adds
  `equipo-ligero` to `<html>` when `navigator.hardwareConcurrency <= 4` or
  `navigator.deviceMemory <= 4` (Chromium-only; ignored if absent), and `CanopyBackground.css`
  trims the same layers it already trims under `max-width: 640px` (second ray, grain, leaves;
  slower first ray). Any new decorative full-screen effect should respect both that class and
  `prefers-reduced-motion`.
- **Select dropdown text color:** `<option>` elements ignore the dark-theme `color` set on their
  parent `<select>` once the browser renders its native (usually white) dropdown — always pair
  `.field select` styling with an explicit `.field select option { color: var(--corteza); }`
  rule (already in `global.css`), or new selects will render invisible white-on-white text.
- **Form fields must be allowed to shrink:** `.form-grid` uses `minmax(0, 1fr)` columns and `.field`
  has `min-width: 0` (both in `global.css`). With plain `1fr` (= `minmax(auto, 1fr)`) a grid column
  never goes below the natural width of its content, and a `<select>` is as wide as its longest
  `<option>` — the Zona select ("Metro (Tampico, Madero, Altamira)", ~298px) stuck out of the card on
  phones ≤375px and, once the iglesia input was focused with long text, scrolled the whole
  `overflow: hidden` card sideways ("se ve cortado"). Don't revert those two rules; selects also
  get `text-overflow: ellipsis` so a long chosen option truncates instead of overflowing.
- **Password fields — always `components/PasswordInput.tsx`, never a bare `<input type="password">`:**
  it draws its own eye button, so `PasswordInput.css` hides Edge/Windows' native one
  (`::-ms-reveal`/`::-ms-clear`) — without that Edge showed two eyes (Chromium/Playwright can't
  reproduce it). The input's right padding (room for the eye, `--ojo-ancho`) is set by
  `.password-input > input.password-input-field[type]`, deliberately more specific than
  `.field input[type="password"|"text"]` (global.css) and any screen-level `.x input` rule — the field
  flips to `type=text` when the password is shown, so don't anchor it to `[type=password]`, and in a
  screen's own CSS never use the `padding` shorthand on it (use `padding-block`/`padding-left`).
- **Touch targets:** interactive elements should be ≥44px under `@media (pointer: coarse)` —
  see the block in `global.css` for the pattern (`.btn-sm`, chip buttons, icon-only buttons).
- Full context and the original audit trail (design direction rationale, responsive-audit
  findings) lives in the plan files under `~/.claude/plans/` from the sessions that built this —
  not duplicated here, but this doc should stay the source of truth for *current* conventions as
  they evolve.

### Data model

Four tables (`backend/app/models.py`): `campers` (registration + `folio` unique short code +
`pago_verificado`/`verificado_en`/`verificado_por` audit fields, plus the matching
`asistio`/`asistio_en`/`asistio_por` trio for camp-day check-in, plus `equipo_id`/`equipo_fijado`/
`es_staff` — see Equipos below), `admin_users` (username/bcrypt hash/`role`), `equipos` (id/nombre/color/
orden — see below), and `app_settings` (single row, `id=1` — runtime-editable flags, see the
Runtime settings pattern above). `Sexo`, `TallaCamisa`, and `AdminRole`
(`ADMIN`/`VERIFICADOR_PAGO`/`VISUALIZADOR`/`RECEPCION`) are Python/DB enums defined in `models.py`
and reused in `schemas.py`. `campers.ticket_path`/`ticket_mime` are nullable — a registration can
exist without a receipt when the `pedir_comprobante` toggle is off; `CamperOut.tiene_comprobante`
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

The `RECEPCION` role exists solely for camp-day check-in: `PATCH
/api/admin/registros/{id}/asistencia` (`routers/admin.py`) is gated to
`require_role(AdminRole.ADMIN, AdminRole.RECEPCION)`, same shape as the existing pago-verification
endpoint (sets `asistio`/`asistio_en`/`asistio_por`, clearing the audit fields when unchecked).
Everything else stays behind its existing role checks — `RECEPCION` accounts can list registros
and read `stats/*` (router-level auth only) but get 403 on `/pago`, `DELETE`, `/settings`, and
`/usuarios/*`. On the frontend, `lib/roles.ts` centralizes `ROLE_LABELS`/`ROLES` and
`destinoPorRol()` (used by `AdminLogin.tsx` to route each role to its landing page after login).
`pages/Recepcion.tsx` (`/admin/recepcion`) is a dedicated, deliberately simple screen for
non-technical staff at the entrance table — one big search box (name/iglesia/ciudad/teléfono/folio,
the same broadened `_apply_filters` search used by the admin panel), three segmented filter
buttons instead of a `<select>`, and large touch-friendly cards with a single "Marcar llegada"
button (`ConfirmButton` for the undo) — no table view, unlike `AdminPanel.tsx`. The camper's
**team goes first and big** (`components/EquipoDestacado.tsx`: a tile filled with the team's color and the name in
the display font, text dark/light chosen by the color's brightness) because the name-badge (gafete) is picked from
it; without a team it says why (Staff / consejero / "Avisa al admin"). The same component, `variante="pastilla"`,
is the team label in `RegistroSitio.tsx`'s "Registrados ahora" list.
`AdminPanel.tsx` guards `RECEPCION` accounts straight back to `/admin/recepcion` and, for every
other role, surfaces attendance read-only (a "Llegó" column/chip and an asistencia filter) since
marking arrivals is recepción's job, not the organizing panel's.

### Equipos (balanced team assignment)

`/admin/equipos` (`pages/Equipos.tsx`) lets Admin create teams (name + color from
`components/ColorSwatches.tsx`, an 8-swatch palette pulled from `tokens.css` plus a native
`<input type="color">` escape hatch) and either let people fall into a team automatically or move
them by hand — no drag-and-drop, deliberately, for a non-technical staff audience: `MoverMiembro.tsx`
expands a row of one big button per team instead. Every other role sees the same screen read-only
(`canEdit = role === "ADMIN"`, same prop convention as `AdminRegistroToggle`/`AdminAjustes`).

**UX for scale (~10 teams × ~15 people ≈ 150 rows):** the screen doesn't render every team's full
member list at once — that was the original layout and it became an unusable multi-screen scroll
once tested with realistic camp numbers. Instead:
- `components/EquiposToolbar.tsx` collapses what used to be three always-open cards (new team /
  criteria / repartir) into one row of three buttons, each expanding its panel via
  `FieldReveal`/`AnimatePresence initial={false}` — only one panel open at a time.
  `components/EquiposCriterios.tsx` no longer owns its own `glass-card`/`Reveal`; it's just the
  panel content now, since the toolbar supplies the card.
- `components/EquiposTabs.tsx` is the screen's navigation bar, sticky under the navbar from 1024px
  up (same `position: sticky` pattern as `.admin-filters` in `AdminPanel.css`). Only the fixed
  views (Resumen / Sin equipo / Staff) are pills; **teams are not one tab each** — that was a
  horizontally scrolling / multi-row bar that got unusable at ~10 teams. They sit behind
  `components/EquipoSelector.tsx` (‹ current team ›): the button opens a bottom sheet on mobile
  (portal, body-scroll lock, Esc/Tab trap, same pattern as `TicketModal.tsx`) and an anchored menu
  on desktop (outside-click/Esc to close), picked via `useMediaQuery("(min-width: 1024px)")` and
  both rendering the same `EquipoPickerGrid`. The bar is two rows on mobile and one row on desktop,
  and is the same height with 3 teams as with 10. `Equipos.tsx` keeps the active view as
  `EquiposTabId = "resumen" | "sin-equipo" | "staff" | number` state. A team's detail card uses the
  full content width (no `max-width`), and every list of people (team detail, Sin equipo, Staff,
  search results) wraps its `MoverMiembro` rows in `.mover-lista` (`MoverMiembro.css`), which is
  2 columns from 1024px up — keep new person lists inside that wrapper so they lay out the same.
- The default "Resumen" tab shows every team as a **compact** `EquipoCard` (`variant="resumen"`
  prop on `components/EquipoCard.tsx`) — stats chips only, no member list, plus a CSS-only
  relative size bar (`--color-equipo`-tinted, width = team size ÷ largest team) so imbalance is
  visible without reading numbers. Clicking a card jumps to that team's tab, which renders the
  same `EquipoCard` with `variant="detalle"` (the original full member-list layout).
- Typing in the search box switches to a flat, all-teams results list (bypasses whichever tab is
  active) — each `MoverMiembro` row gets an `equipoChip` prop showing which team that person is
  in (or "Sin equipo"), since that's no longer implied by which card the row lives in. Search
  input is debounced 250ms client-side before filtering.
- `Equipos.tsx::handleMover` is optimistic (mirrors `togglePago` in `AdminPanel.tsx`): it moves
  the member between the local `equipos`/`sin_equipo` arrays and recomputes that team's stats
  with a client-side mirror of `resumen_equipo()` (`recalcularStats()` in `Equipos.tsx`) instead
  of re-fetching the full distribution after every move — with ~150 rows a full refetch per move
  was a visible stall. `handleRepartir` still replaces the whole `dist` from the server response,
  since a full reshuffle really does change everything.

The balancing algorithm lives in `backend/app/equipos_balance.py` — a pure module (no FastAPI, no
DB session), deterministic (never uses `random`). One cost function
(`costo_agregar(candidato, miembros_equipo, ...)`) backs both individual assignment
(`elegir_equipo`, called from `routers/public.py::crear_registro` right after a camper is saved)
and the bulk reshuffle (`repartir`, called from `routers/equipos.py::repartir_equipos`) — the same
"which team least unbalances if I add this person" question, asked once per registration or once
per person during a full reshuffle. Five independently-toggleable criteria (`Criterios` dataclass):
team size, average age, average time-since-baptism (people with no baptism data don't count toward
that average but are still spread evenly across teams via a "missing data" cost term), church
diversity (since the public form no longer collects `ciudad`, "spread out people who know each
other" is implemented on `iglesia`, weighted 0.7, with `zona` as a 0.3-weighted tiebreaker — see
Data model above), and sex ratio. `repartir()` also runs a bounded local-search refinement pass
(`_refinar`, up to 3 sweeps, stops at the first sweep with no improving move) that tries moving
each movable person to a cheaper team — this is what keeps averages close instead of just
"reasonable" from the greedy pass alone.

**`TipoParticipante.CONSEJERO` never enters `elegir_equipo`/`repartir()`'s automatic placement at
all** — counselors only get a team if an Admin moves them by hand from `Equipos.tsx`
(`PATCH /api/admin/registros/{id}/equipo`, which sets `equipo_fijado=True`); this holds even when
`POST /api/admin/equipos/repartir` is called with `incluir_fijados=True` (a full reshuffle that
*does* override manually-placed campers, but never touches a manually-placed counselor — see the
`consejeros_fijados`/`consejeros_sueltos`/`no_consejeros` split at the top of `repartir()`). A
counselor's registration (`routers/public.py::crear_registro`) skips the auto-assignment block
entirely regardless of `equipos_auto`. Because of this there is no `eq_balance_consejeros`
criterion — since counselors are never candidates in `elegir_equipo`, there's nothing about them
left to balance.

**`campers.es_staff` (bool, default `false`, migration `0013`) keeps people out of teams entirely** —
for staff who are registered but don't go in a team. `PATCH /api/admin/registros/{id}/staff`
(`routers/admin.py::marcar_staff`, Admin-only) sets it and, when turning it on, clears
`equipo_id`/`equipo_fijado`; turning it off leaves the person in "Sin equipo" (never reassigned
automatically). The exclusion lives in the routers, not in `equipos_balance.py` (which stays pure):
`repartir_equipos` and `crear_registro` query `Camper.es_staff.is_(False)` before building the
balancing context, so staff also don't skew team averages. `GET /admin/equipos/distribucion`
returns them in a separate `staff` list (never in `sin_equipo`), `?equipo_id=0` ("Sin equipo"
filter) excludes them, `PATCH .../equipo` rejects assigning a staff member (409), and the export's
"Equipo" column says "Staff". Staff still count everywhere else — payments, attendance, shirts,
exports. UI: "Es staff (sin equipo)" button inside `MoverMiembro.tsx`'s "Mover" options and a "Staff"
tab in `EquiposTabs.tsx` (with "Ya no es staff" to undo; `Equipos.tsx::handleStaff` is optimistic
like `handleMover`), plus "Marcar como staff"/"Quitar de staff" next to "Editar" in `AdminPanel.tsx`
(both layouts). The public form never asks for it — only an admin can mark staff.

`campers.equipo_fijado` is the key to combining automatic and manual assignment without one
undoing the other: `PATCH /api/admin/registros/{id}/equipo` (`routers/admin.py::mover_de_equipo`,
Admin-only) sets it to `True` whenever a human moves someone by hand, and `repartir()` skips
fijados by default — `POST /api/admin/equipos/repartir` takes an `incluir_fijados` flag (surfaced
as a checkbox in `Equipos.tsx`) for the rare case of wanting a truly clean reshuffle, which also
clears the flag on every camper it touches since it just overrode their manual placement (not on
counselors, whose placement it never touches).

The six `equipos_auto`/`eq_balance_*` booleans live in `app_settings` (same
seed/PATCH-with-`exclude_unset` shape as `show_shirt_size` etc. — see Runtime settings pattern
above) but are a **deliberate exception** to that pattern: they're read/written only through
`GET`/`PATCH /api/admin/equipos/config`, never added to `AppSettingsOut` or the public
`GET /api/settings` (the registration form has no use for them, and they're not consumed via
`useSettings()`/`SettingsContext.tsx` — `Equipos.tsx` fetches and patches them directly). Deleting
a team (`DELETE /api/admin/equipos/{id}`) sets its members' `equipo_id` to `NULL` explicitly in
the same request — SQLite doesn't enforce the `ON DELETE SET NULL` foreign key that Postgres gets
(see `alembic/versions/0011_equipos.py`, which only creates that FK when `bind.dialect.name ==
"postgresql"`, same conditional pattern as prior migrations), so the explicit `UPDATE` is what
keeps dev/SQLite and prod/Postgres behaving the same way. Auto-assignment on registration is
wrapped in `try/except Exception` that only logs — a balancing failure must never fail the
registration itself, which already committed; anyone left unassigned this way just shows up under
"Sin equipo" in `Equipos.tsx`, recoverable with "Repartir a todos".

### Registro en el campamento (`/admin/registro-sitio`) y concurrencia

Para quien llega sin haberse registrado (se captura por iglesia completa, 2–3 personas a la vez).
Roles: Admin y `RECEPCION`.

- **Endpoint**: `POST /api/admin/registros` (`admin.py::crear_registro_sitio`, JSON `RegistroSitioCreate`). La
  persona queda con llegada marcada (`asistio*`) y **pago verificado** (más un evento `PAGO_VERIFICADO` con
  `origen: registro_en_sitio`), sin comprobante, y `campers.registrado_por` (migración `0016`, null = se registró
  sola por el formulario público) guarda quién la dio de alta. Ignora `registro_abierto`/`pedir_comprobante` y no
  tiene rate limit. La fecha de bautismo es **opcional** (`validar_datos_camper(exigir_fecha_bautismo=False)`;
  mes sin año o al revés sigue siendo 422). La pantalla no pide promoción ni fecha de pago (se manda la de hoy).
- **Duplicados**: sin `forzar`, un nombre igual (`registro_sitio.py::clave_nombre`: sin acentos/mayúsculas/orden)
  responde 409 con `detail = {codigo: "POSIBLE_DUPLICADO", mensaje, existentes: [CamperOut]}` (`ApiError.detail`
  lo conserva en el frontend). `GET /api/admin/registros/similares?nombre=` alimenta el aviso "¿Ya está
  registrado?" mientras se escribe. "Deshacer" = `DELETE /registros/{id}`, que Recepción solo puede usar sobre lo
  que registró su propia cuenta.
- **Candado de equipos** (`concurrencia.py::candado_equipos`): `RLock` + `pg_advisory_xact_lock` en Postgres. Lo toman
  `asignar_equipo_auto` (`routers/equipos.py`, usado por el alta pública y la de sitio), `repartir_equipos` y todo el
  alta en sitio (chequeo de duplicados + insert + equipo). Sin él, dos altas simultáneas decidían equipo con la misma
  foto. Asume **un solo worker** de uvicorn (como `ratelimit.py`); el advisory lock cubre el caso de varios, pero el
  rate limit en memoria no. `guardar_con_folio_unico` reintenta si el folio aleatorio choca.
- **Marcar llegada es idempotente**: si dos recepcionistas marcan a la misma persona, la primera marca manda
  (`asistio_en/por` no se pisan).
- **Proxy headers**: el `Dockerfile` arranca uvicorn con `--proxy-headers --forwarded-allow-ips=*`. Antes
  `request.client.host` era siempre la IP del Nginx del contenedor, así que "10 registros / 10 min" y "8 logins / 5
  min" eran globales para todo el sitio (en el campamento, con wifi compartido, se bloquean entre sí). Ojo: ahora se
  confía en `X-Forwarded-For`; el nginx del host debe mandarlo.
- **Medido (2026-11-08, copia de datos reales, Postgres 16 real, 1 worker)**: 25 de una misma iglesia → 2–3 por
  equipo en los 10 equipos, tamaños de equipo con rango 2; 3 operadores × 30 + 2 marcando llegadas + "Repartir a
  todos" a mitad → 0 errores 5xx, nombres solapados creados una sola vez (409), todos con equipo, equipos de 18–19.
  `repartir()` con ~200 personas ≈ 1 s (3.7 s con otros registrando a la vez).
- **El tamaño es una regla dura, no solo un costo** (`equipos_balance.py`, `HOLGURA_TAMANO = 0`): con
  `Criterios.tamano` encendido `elegir_equipo` solo considera los equipos de **menor tamaño** en ese momento, así que
  ningún equipo queda con más de 1 persona de diferencia aunque lleguen muchas de una en una (a quien se registra en
  sitio se le dice su equipo al instante, no se puede "arreglar" con un reparto general después). `_refinar` tampoco
  acepta movimientos que ensanchen esa diferencia. Medido con 40 secuencias de ~110 altas sobre los 113 reales:
  rango de tamaños **2.0 de media y hasta 3** con la política anterior → **0–1 siempre**. Costo: iglesias y sexo se
  mezclan algo peor (exceso de iglesia 0.05 → 2.8 en total por secuencia; spread de % mujeres 9 → 16 puntos), porque
  la última persona de cada "ronda" solo puede ir a los equipos que quedan. `HOLGURA_TAMANO = 1` mezcla casi igual
  que antes (exceso 0.6, % mujeres 11) pero permite diferencia de hasta 2. Con el interruptor de tamaño apagado en
  /admin/equipos no se aplica nada de esto.
  **Plan del campamento: "Repartir a todos" el día antes y ese día solo altas una por una.** Arrancando de un reparto
  general recién hecho (rango inicial 0–1), 40 secuencias de ~110 altas: tamaños siempre 0–1 (la política anterior,
  sin regla dura, se disparaba hasta 7 de diferencia). La mezcla por iglesia depende de cuántos registradores
  capturan a la vez: **1 → perfecta** (exceso 0), 2 → 2.6, 3 → 3.8 en total por secuencia. Edad (≈2.9 años entre el
  equipo más joven y el más grande vs 1.7 de un reparto general), % mujeres (≈4 personas vs 2.6) y bautismo quedan
  peores que con un reparto general completo: es el costo de decidir en línea con el tamaño parejo como prioridad.
- **Pool de conexiones** (`database.py`): 20 + 30 (Postgres). Con el de fábrica (5 + 10) una ráfaga de ~25 clientes
  lo agotaba (`QueuePool timeout`, 500 y esperas de 30 s) porque cada petición retiene su conexión mientras espera el
  candado. Simulación del estrés (20 registradores + 4 marcadores + 3 observadores sin pausas, ~280 registrados):
  0 errores, 30 conexiones máx., alta p50 1.3 s; día normal (3 + 2 + 1 con pausas): alta p50 40–70 ms, máx. 0.9 s
  mientras corre "Repartir a todos" (≈3 s).
- **Aviso de datos sin guardar** (`lib/useAvisoSalida.ts`): `beforeunload` + un `click` en captura que pregunta con
  `confirm` antes de seguir un enlace interno (`BrowserRouter` no tiene `useBlocker`); anclas a la misma ruta y
  enlaces externos pasan. Lo usan `RegistroSitio.tsx` (cuenta solo los campos de la persona; tipo/zona/iglesia se
  conservan) y `FormularioRegistro.tsx`. El botón "atrás" no se puede interceptar: por eso `RegistroSitio.tsx`
  guarda y restaura un borrador en `sessionStorage` (`arraigados-registro-sitio-borrador`).
- `Recepcion.tsx` refresca cifras/lista cada 20 s y al volver a la pestaña; `Equipos.tsx` recarga la distribución al
  volver a la pestaña. `camperForm.ts::HOY` ya es fecha local (antes UTC: tras las 6 pm en México "hoy" se rechazaba
  como futuro).

### Juegos (`/admin/juegos`) — calificaciones por equipo

Para sumar las hojas de los jueces/encargados de los juegos del campamento (Sketch, Búsqueda del tesoro, Rally
sucio, Voleibol gigante) en vez de llevarlas en un Excel aparte. Todos los roles del panel ven (menos
`RECEPCION`, que se redirige a `/admin/recepcion`); **solo Admin captura/edita/borra** (`canEdit`).

- **Los juegos son datos, no código**: `backend/app/juegos.py` (módulo puro, como `equipos_balance.py`) es el
  catálogo `JUEGOS` — cada `Juego` con sus `Criterio` (`tipo` `escala` = el juez pone 0–100 y se convierte
  proporcional, o `si_no` = todo o nada, más los `puntos` que vale). El formulario y las tablas del frontend se
  dibujan a partir de `GET /api/admin/juegos`, así que **agregar un juego = agregar/llenar una entrada en
  `JUEGOS`** (Voleibol gigante existe con `criterios=()` y sale como "Reglas pendientes"); sin migración ni
  cambios de UI. Hay **dos modos** (`Juego.modo`): `jueces` (Sketch: varios jueces, promedio — lo de abajo) y
  `estaciones` (Rally sucio y Búsqueda del tesoro — ver el siguiente bloque). Sketch (600 pts): Historia 200 y Originalidad 200 y Adaptación 100 (escala), Inclusión 50 y
  Tiempo 50 (sí/no).
- **Se guarda lo que puso el juez, no los puntos**: `calificaciones.valores` (JSON: `{"historia": 80,
  "tiempo": true}`), una fila por juez+equipo+juego (`UniqueConstraint`, y el chequeo case-insensitive del router
  responde 409 — se edita la hoja, no se duplica). Si cambia lo que vale un criterio todo se recalcula solo.
  `validar_valores` es estricto (todos los criterios, ninguno de más, enteros 0–100, booleanos de verdad);
  `puntos_hoja` es tolerante (criterio faltante = 0) para no romper hojas viejas si el catálogo crece.
- **Puntaje del equipo = promedio de sus hojas** criterio por criterio (`resultados()`), redondeado a 1 decimal; las
  posiciones se calculan sobre ese total redondeado (empates comparten lugar: 1, 1, 3) y un equipo sin hojas no
  tiene posición. `tabla_general()` suma los juegos (`GET /posiciones`).
- **Modo `estaciones` (Rally sucio 1000 pts, Búsqueda del tesoro 800)**: las reglas están en
  `reglas-juegos/Concentrado de puntajes 2026.md` (y las hojas de papel de los encargados en los PDF de esa carpeta);
  `juegos.py` las implementa tal cual, **incluidos los supuestos ⚠ del concentrado** (el borde de una franja cuenta
  en la de arriba: 2:40 = 100, 8:00 = 60; nivel ¼ ½ ¾ sin marcar = 0; redondeo al entero más cercano con la mitad
  hacia arriba, hecho con `Fraction` — el `round` de Python redondea 0.5 al par). Cada juego es una tupla de
  `Estacion` (rally: 10 juegos con su límite de 8 ó 10 min y qué se anota si no terminan — `nivel`/`conteo`/
  `son_logro`/`lados`; búsqueda: Raíz + 9 frutos con su señal y **el orden de equipos de SU hoja de papel**, que cambia
  en cada estación, + la capilla). **No hay migración**: se reusa `calificaciones` con **una fila por equipo y estación**
  y la clave de la estación en el campo `juez`; `valores` guarda lo que marcó el encargado (✔/✖, F/D, tiempo en segundos,
  «x de y»), nunca puntos. `validar_fila` es estricta y devuelve el renglón limpio (un rally que terminó no guarda
  «nivel»); `puntos_fila` es tolerante. El total del equipo es la **suma** de sus estaciones (no promedio) y
  `resultados()` recibe `(equipo_id, juez, valores)`. **Posición dentro del juego = más puntos y, a igual puntaje, menos
  tiempo** (`_posiciones_con_desempate`): rally suma lo que tardó en cada juego, y un juego sin terminar o sin jugar
  cuenta con su límite; búsqueda suma el tiempo de las estaciones capturadas (la capilla no cuenta); empatan solo los
  que igualan en las dos cosas. `tiempo_seg` sale `None` si no hay tiempo.
  - **API**: `PUT /api/admin/juegos/{clave}/estaciones/{estacion}` (Admin; `routers/juegos.py::guardar_estacion`)
    guarda la hoja **completa** de una estación en una transacción — crea/actualiza los renglones que vienen y
    **borra** los que ya no (renglón vaciado), 422 con «Equipo: motivo» y no guarda nada si un renglón es inválido, 409
    si dos personas chocan al crear la misma fila. La capilla además exige lugares distintos (1.º/2.º/3.º) y no
    acepta huecos en la pantalla. `POST /hojas` y `PATCH /hojas/{id}` responden 422 para estos juegos.
  - **UI**: `components/EstacionesCaptura.tsx` (fichas de estaciones con «n/10» y ✔ al completarse; al guardar pasa sola
    a la siguiente sin capturar; pregunta antes de cambiar de estación con datos sin guardar) → `HojaEstacion.tsx`
    (rally/búsqueda: **un renglón por equipo, en el orden del papel**, con las mismas marcas ✔/✖, F/D y «min : seg»;
    un renglón sin tocar no se guarda, uno a medias marca en rojo qué falta; puntos en vivo) o `HojaCapilla.tsx` (aquí el
    renglón es el *lugar* y se elige el equipo); controles en `ControlesHoja.tsx` (`MarcaSiNo`, `OpcionesChip`,
    `CampoTiempo`); toda la lógica de borradores/validación/cuentas del lado del cliente en `lib/estaciones.ts`
    (**espejo de `juegos.py`**: si cambia una regla hay que tocar los dos; la cuenta de verdad la hace el servidor);
    resultados por estación en `ResultadosEstaciones.tsx` (tabla de columnas fijas desde 1024px — las 10 estaciones caben
    a ~70px cada una —, tarjetas debajo). Rally en tabla desde 1024px; **la búsqueda solo desde 1280px con mouse**
    (`pointer: fine`): son 7 pares ✔/✖ y con marcas de 44px (tableta) no caben, ahí se queda en tarjetas. El tiempo se
    captura en dos casillas «min : seg» como el papel (no un campo «2:15», que en el teclado numérico del celular no
    tiene dos puntos). Trampa ya vista: el botón «×» de vaciar renglón dentro de la celda del equipo truncaba «Ahuehuetes»;
    vive en la columna de puntos.
- Borrar un equipo borra sus calificaciones explícitamente (`equipos.py::borrar_equipo`; SQLite no aplica el
  `ON DELETE CASCADE`). Migración `0017`: **hay que correr `alembic upgrade head`** — sin la tabla, borrar un equipo
  y toda la pantalla dan 500.
- UI: `pages/Juegos.tsx` (pestañas Posiciones + una por juego; tabla desde 1024px, tarjetas debajo, vía
  `useMediaQuery`; sin raíces, como toda pantalla admin) + `components/HojaCalificacion.tsx` (formulario
  genérico: Sí/No de 44px, subtotal en vivo, conserva el juez al guardar y deshabilita los equipos que ese juez ya
  calificó). Trampa ya vista: `flex: 1 1 14rem` en un contenedor `flex-direction: column` es **alto** (dejó 224px de
  hueco por criterio en celular) — esa base solo va en el diseño en fila.

### Conciliación de comprobantes (`/admin/conciliacion`)

Lee cada comprobante para sacar monto/fecha/referencia, agrupa los registros que comparten una
transferencia y avisa si el dinero no alcanza. Roles: Admin y `VERIFICADOR_PAGO` (el resto 403).

- **Lectura** (`app/comprobante_lector.py`): Gemini (`GEMINI_API_KEY`, plan gratis de Google AI Studio,
  `gemini_model` en `config.py`) con respaldo **Tesseract local** (`comprobante_ocr.py`: `huellas`,
  `extraer_texto_local`, `parsear`) si no hay key, hay 429 o la respuesta no es JSON. Sin ninguno
  de los dos el encargado captura a mano. `ocr_fuente` guarda `gemini`/`local`/`manual`. Ojo: la
  imagen sale a Google solo si hay key (el plan gratis puede usarla para mejorar sus productos).
- **Datos** (migración `0014`, columnas `campers.ticket_sha256/ticket_phash/ocr_*/comp_*`): lo
  corregido a mano pone `comp_editado=True` y una relectura ya no lo pisa. `comp_revisado*` marca
  que el encargado ya aprobó el grupo.
- **Proceso** (`app/procesar_comprobantes.py`): `procesar_registro_nuevo` corre en `BackgroundTasks` tras
  `POST /api/registros` (nunca propaga errores); `procesar_lote` lo dispara el botón del panel
  (`POST /api/admin/comprobantes/procesar`, avance en `.../estado`, estado en memoria como
  `ratelimit.py`); también `python -m app.procesar_comprobantes [--todos]` desde `backend/`.
  Gemini gratis ≈ 15 pet/min → pausa de 4.5 s entre llamadas.
- **Reglas** (`app/conciliacion.py`, puro): `TARIFAS` por fecha de la transferencia (16–31 ago $350,
  sep $450, oct $500, 1–12 nov $550) — constante a propósito, es historia de la campaña 2026 (la
  tarifa actual del formulario sigue en `app_settings.precio_mxn`). Se agrupa por imagen idéntica
  (sha256), clave de rastreo, referencia y phash. **Trampas ya vistas con datos reales:** (1) el
  phash une capturas *distintas* del mismo banco (misma plantilla), así que nunca une si lo leído se
  contradice y, si solo coincide el parecido visual, la alerta baja a "posible" (`media`); (2) la
  referencia SPEI suele ser la fecha (`221026`) o un valor fijo (`2309260` en 8 pagos de semanas
  distintas), por eso solo une con mismo monto, ±1 día y sin contradicciones; (3) el OCR confunde O/0
  → las claves se comparan normalizadas; (4) montos < $100 se descartan como error de lectura.
- **UI**: `pages/Conciliacion.tsx` (no root motifs, like every admin screen) + `components/ConciliacionGrupo.tsx` + `ComprobanteDatosForm.tsx`;
  filtros y búsqueda se aplican en el cliente sobre `GET /api/admin/conciliacion` (~100–200 grupos).
  Los datos corregidos se aplican a todo el grupo (un PATCH por miembro).
- **Historial y aprobación** (migración `0015`): tabla `comprobante_eventos` (`models.py::ComprobanteEvento`,
  solo se agrega) escrita por `app/historial.py::registrar` — no hace commit, lo hace el endpoint que
  llama, así evento y cambio van juntos. Acciones: `PAGO_VERIFICADO/PAGO_DESMARCADO` (también las del
  panel y el modal, porque se registran en `admin.py::actualizar_pago`), `REVISADO/REVISION_QUITADA`,
  `APROBADO`, `DATOS_CORREGIDOS` (antes/después), `LEIDO` (usuario `sistema`), `SEPARADO/UNIDO_DE_NUEVO`.
  `APROBADO`/`REVISADO` guardan una **foto** de lo que se veía (monto, tarifa, chequeos, alertas) para poder
  volver a comprobarlo meses después. `POST /api/admin/comprobantes/aprobar` = revisado + pago verificado de
  todo el grupo en un paso (el botón "Aprobar pago"); `GET .../comprobantes/historial?camper_id=`.
  Corregir datos de algo ya aprobado, o cambiar la composición de un grupo (separar/unir), **quita el
  "revisado"** — lo aprobado ya no es lo que hay. Borrar un registro borra su historial a mano
  (`admin.py::borrar_registro`): SQLite no aplica el `ON DELETE CASCADE`.
- **Chequeos y separar**: `conciliacion.py::_chequeos` arma "lo que se comprobó" (`LEIDO`, `MONTO`,
  `FECHA`, `SIN_COPIAS`; `ok` = true/false/null si no hubo con qué comprobar) para mostrar también lo
  que está bien, no solo las alertas; `Grupo.clase` es `individual`/`grupal`. `campers.comp_separado`
  ("No es el mismo pago", `PATCH /registros/{id}/comprobante/separar`) hace que `agrupar()` nunca una a
  ese registro, ni por imagen, clave, referencia ni phash.
- **UI en pestañas** (`Conciliacion.tsx`): Por revisar / Sin alertas / Verificados / Historial, para que
  lo que tiene alertas nunca se mezcle con lo ya verificado; dentro, Todos/Individuales/En grupo y, solo
  en "Por revisar", chips de motivo. Las tarjetas se ordenan en el cliente por urgencia (verificados: por
  fecha de aprobación). `ConciliacionChequeos.tsx` y `ComprobanteHistorial.tsx` son los dos bloques nuevos.
- **Despliegue**: el `Dockerfile` instala `tesseract-ocr tesseract-ocr-spa`; `GEMINI_API_KEY` va en el
  `.env` raíz (opcional) y `docker-compose.yml` la pasa al backend. Tras el primer deploy, usar el
  botón "Leer comprobantes pendientes" (o el script) para leer los ya existentes.
- **Precisión medida (112 comprobantes reales, 2026-11-05):** Gemini (`gemini-3.5-flash-lite`) leyó
  monto en el 100 % de transferencias/depósitos (los 10 sin monto son cupones), referencia en 81 y
  clave/folio único en 63; la lectura local solo acertó el monto en ~74 % y fallaba con decimales
  en superíndice. Las 21 sin fecha son capturas cortadas (sin fecha visible), no un fallo: se usa la
  fecha que escribió la persona. Costó ~112 peticiones por pasada (el plan gratis da ~500/día).
- **Trampas de Gemini:** `gemini-2.5-flash-lite` ya devuelve 404 (los modelos se retiran: ante un 404
  listar `GET /v1beta/models`); responde 503 "alta demanda" a ratos (hay 3 reintentos antes de caer a
  local); a veces invierte día/mes (04/10 → 10 abr), así que el prompt lo exige y
  `_corregir_dia_mes` lo arregla si la fecha cae fuera de `VENTANA_PAGOS`. El prompt pide
  `folio_operacion` (único por operación) y se guarda en `comp_clave_rastreo` cuando no hay clave de
  rastreo: la "referencia numérica" no sirve para distinguir pagos (suele ser fija o la fecha).
- Solo se afirma "captura repetida" (alerta alta) si hay imagen idéntica, misma clave/folio o mismo
  n.º de cupón (`MOTIVOS_FUERTES`); si el vínculo es solo referencia o parecido visual, queda como
  "posible" (media) para que lo confirme una persona.

## Deployment

Three services in `docker-compose.yml`: `db` (Postgres with healthcheck + `pgdata` volume),
`backend` (waits on `db` healthy, mounts `tickets` volume at `/data/tickets`), `frontend`
(Nginx, only service exposing a host port — `80:80`, reverse-proxies `/api/` to `backend:8000`
per `frontend/nginx.conf`). See `README.md` for the full Droplet setup walkthrough (Docker
install, `.env` setup, `./deploy.sh`, useful `docker compose` commands, and the note on adding
TLS via Certbot in front of the `frontend` container).

**Production topology and what it means for performance** (measured against arraigados.lat, not
in the README): a second, host-level nginx on the Droplet (Certbot TLS, HTTP/1.1, site file
`/etc/nginx/sites-enabled/arraigados`) terminates HTTPS and proxies to the `frontend` container on
`127.0.0.1:8080`. That host nginx talks to the container over **HTTP/1.0** and only compresses
`text/html` — so `frontend/nginx.conf` sets `gzip_http_version 1.0` + `gzip_proxied any` on
purpose: without them nginx (which only gzips HTTP/1.1+ by default) served the main JS (295KB →
96KB) and CSS uncompressed while the HTML looked fine. Don't remove those two lines; check with
`curl -sI -H "Accept-Encoding: gzip" https://arraigados.lat/assets/<index-*.js>` (expect
`Content-Encoding: gzip`). Likewise Google Tag Manager (~300KB with the Analytics script it pulls
in, ~31% of the page weight) is **injected after the window `load` event** from the inline
script in `index.html`, not at the top of `<head>`: on a slow phone it was delaying the load by
~39% (6.0s → 3.7s). Only `dataLayer` and its first event are created immediately, so
`src/lib/analytics.ts` can push events at any time — they queue until GTM arrives. The logo was
also looked at: `logo.webp` (66KB) doesn't shrink usefully with lossy, near-lossless or smaller
variants (it's detailed art and the hero shows it large), so it was left as is.

### Deploy runbook (what has been done in practice)

The Droplet keeps the repo at `/root/arraigados` (SSH as `root`; ask the owner for access — no
credentials belong in this repo or in any file) and database dumps at `/root/backups/`. Its
`deploy.sh` shows as modified there only because of the executable bit — `git pull --ff-only`
still works.

Access is by SSH password, not key; the owner gives it for each deploy. From Windows there is no
`sshpass`/`plink` — use `ssh -o PubkeyAuthentication=no` with `SSH_ASKPASS` pointing at a throwaway
script that echoes an env var, plus `SSH_ASKPASS_REQUIRE=force` and `DISPLAY=x`; delete the script
afterwards. Never write the password into the repo, a file or the docs.

Order that has worked every time:
1. Push to `main`.
2. On the server: `pg_dump` into `/root/backups/arraigados_pre_deploy_<timestamp>.sql`
   (`docker compose exec -T db pg_dump -U $POSTGRES_USER $POSTGRES_DB`, values from `.env`).
3. `git pull --ff-only origin main`.
4. **If `frontend/nginx.conf` changed, validate it before touching the live site** — a bad config
   leaves the `frontend` container crash-looping and the site down:
   `docker run --rm --network arraigados_default -v /root/arraigados/frontend/nginx.conf:/etc/nginx/conf.d/default.conf:ro nginx:1.27-alpine nginx -t`
   (it must run on the compose network so the `backend` upstream resolves; the
   "duplicate MIME type text/html" warning is harmless and long-standing).
5. `./deploy.sh` (builds, restarts, runs `alembic upgrade head`, re-seeds the admin).
6. Verify read-only: `/api/settings` 200, `/api/iglesias?zona=METRO`, row counts in `campers`,
   `alembic_version`, and `docker compose logs --tail 20 backend`. A `CancelledError` traceback
   right before "Application startup complete" is just the old process shutting down.
The registration form is open to the public, so a deploy means a few seconds of downtime; prefer
quiet moments.

**Lo aprendido al subir la conciliación (2026-11-05, migraciones `0014`+`0015`):**
- **No subir la base de datos local a producción.** Primero se compara (por SSH, solo lectura: `count(*)`,
  `max(created_at)`, pagos verificados, `alembic_version`) y se sube solo el código. La copia local
  solo traía lecturas de la IA, que se reproducen gratis; subirla pisaría registros, pagos verificados y
  cuentas que entren después de la copia. Las migraciones solo agregan columnas/tablas, no tocan datos.
- **`GEMINI_API_KEY` debe estar en el `.env` del Droplet** (el del servidor, no solo el local): `deploy.sh`
  reinicia el backend y ahí la toma. Sin ella la lectura cae al Tesseract (~74 % de acierto en monto).
  Pasarla por `stdin` (`printf ... | ssh ... 'cat >> .env'`), con copia previa del `.env`, para no
  imprimirla ni dejarla en la línea de comandos.
- **Leer los comprobantes tras el deploy** sin contraseña de admin:
  `docker compose exec -T backend python -m app.procesar_comprobantes` (solo pendientes/ERROR; `--todos` relee
  todo). Son ~15 min para 112 (Gemini devuelve 503 a ratos y se reintenta); un registro que cayó al lector local
  se reintenta solo con `procesar_uno` sobre ese folio. Correrlo y `deploy.sh` en segundo plano con
  `setsid nohup ... > /root/log 2>&1 < /dev/null &` y sondear el log aparte — **no** encadenar
  `a && b && c &`, porque el `&` toma toda la cadena y el `ssh` se cuelga hasta el timeout.
- **Cotejar** la lectura de producción con la local por folio (tipo, monto, fecha, estado) para confirmar que
  la IA leyó lo mismo; las diferencias pequeñas (una fecha que antes no se leyó) son normales.
- **Producción ya tiene historial real** (`comprobante_eventos`): el equipo usa `/admin/conciliacion` a los
  pocos minutos del deploy, así que no asumir que la tabla está vacía ni borrarla al probar.
- Las credenciales SSH viven en el `.env` raíz local (gitignored); nunca van al repo ni a este archivo.

### Copying production data into the dev database (for realistic tests)

`backend/dev.db` (SQLite, gitignored) can be refreshed from production: (1) copy the current
`dev.db` into `backend/data/` first (that folder is gitignored; a stray `dev.db.bak` in `backend/`
is not); (2) over SSH run read-only `SELECT row_to_json(t) FROM (SELECT * FROM <table> ORDER BY id)
t` for `equipos`, `campers` and `app_settings` (never `ORDER BY` the JSON column itself — Postgres
can't order `json`); (3) load the rows through the SQLAlchemy models in one transaction (`delete`
+ insert preserving ids; coerce date/datetime strings and map enum names with `col.type.enum_class`).
Deliberately **not** copied: `admin_users` (don't spread production password hashes — keep the dev
logins) and the receipt files (`ticket_path` points at images that only exist on the server, so
"Ver comprobante" 404s in dev). The result holds real names and counselors' phone numbers — keep it
out of git and don't share the file. Delete any temporary export right after importing.

### Testing the app with the Playwright MCP — gotchas

- Navigating to the same URL that differs only by `#hash` does **not** reload the page; after
  `goto` call `page.reload()` (or change the query string) when each run must start fresh — the
  multi-step registration form otherwise stays on the step it was left on.
- The dev servers on `:8000`/`:5173` may already be running and belong to the developer
  (`uvicorn --reload`, Vite HMR): reuse them, don't kill them, and don't leave test rows behind —
  delete only what you created (e.g. folios prefixed `QA`, a temporary admin) and never touch real
  records.
- Throttle with CDP, not `page.route`, when measuring (`Emulation.setCPUThrottlingRate`,
  `Network.emulateNetworkConditions`, `Network.setCacheDisabled`). A route handler that waits for
  the page's `load` event deadlocks if the routed request is an async script, because async scripts
  delay `load`.
- Element screenshots of sections under the sticky navbar show the navbar painted in the middle of
  the image; that's a capture artifact, not a layout bug.
