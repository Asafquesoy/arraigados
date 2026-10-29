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
  `overflow-x: clip` (only the ±40px step slide needs clipping), never `overflow: hidden`; on touch
  screens focusing the input scrolls it near the top so the list sits above the keyboard; that's why the form now asks **zona before iglesia**
  (`FormularioRegistro.tsx` and `EditarCamperModal.tsx`). Typing without picking a suggestion is
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
  the sub-1024px card view's own collapsible detail (`admin-row-detalle` in `AdminPanel.tsx`) so the
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
button (`ConfirmButton` for the undo) — no table view, unlike `AdminPanel.tsx`.
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
still works. Order that has worked every time:
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
