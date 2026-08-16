# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Registration system for the **Arraigados** camp (Dunamis, November 2026): a public form where
campers register and upload a payment receipt, plus a protected admin panel to verify payments.
Visual design (colors, fonts, motifs) was derived directly from `imagenes/logo.png` and
`imagenes/poster.jpg` — not from a generic template.

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

### Feature flag pattern

`frontend/src/config.ts` exports `SHOW_SHIRT_SIZE` (and other constants like `CAMP_NAME`,
`SOCIAL_LINKS`). This is the *only* switch needed to hide the shirt-size field end-to-end:
- The field's UI lives isolated in `components/ShirtSizeField.tsx`; `pages/Registro.tsx` renders
  it conditionally and omits the form key entirely when the flag is off.
- `pages/AdminPanel.tsx` hides the corresponding column with the same constant.
- The backend never needs touching: `talla_camisa` is optional in `schemas.py` and nullable in
  the DB, so toggling the flag requires no migration.

When adding other optional/toggleable fields, follow this same shape: isolated component + flag
in `config.ts` + nullable backend column, rather than branching logic inline.

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
  for callers that need to branch on it (e.g. 401 → redirect to login).
- `src/lib/AdminAuthContext.tsx` holds admin session state app-wide (checks `/auth/me` on
  mount); `pages/AdminLogin.tsx` and `pages/AdminPanel.tsx` both redirect via `<Navigate>` based
  on this context rather than route guards/middleware.
- Design tokens (colors, gradients, fonts) derived from the logo/poster live in
  `src/styles/tokens.css` as CSS custom properties — reuse these (`var(--amarillo)`,
  `var(--gradiente-raiz)`, etc.) instead of introducing new colors.
- Glassmorphism (`backdrop-filter: blur(...)`) is intentionally scoped to `Navbar.css` only —
  don't spread it to other components, per the original design requirement.
- Icons in `src/components/icons/` are hand-drawn SVGs specific to this project (root, leaf,
  church, shirt, receipt, shield-check, etc.) — no icon library is used; add new icons following
  the same `IconProps { size, className }` shape (`icons/types.ts`).
- `ToggleSwitch` (`components/ToggleSwitch.tsx`) is the custom animated switch used both for the
  admin payment-verified control and anywhere else a boolean toggle is needed — reuse it rather
  than a plain checkbox.

### Data model

Two tables (`backend/app/models.py`): `campers` (registration + `folio` unique short code +
`pago_verificado`/`verificado_en`/`verificado_por` audit fields) and `admin_users`
(username/bcrypt hash, seeded from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars — there's no
self-serve admin creation UI). `Sexo` and `TallaCamisa` are Python/DB enums defined in
`models.py` and reused in `schemas.py`.

## Deployment

Three services in `docker-compose.yml`: `db` (Postgres with healthcheck + `pgdata` volume),
`backend` (waits on `db` healthy, mounts `tickets` volume at `/data/tickets`), `frontend`
(Nginx, only service exposing a host port — `80:80`, reverse-proxies `/api/` to `backend:8000`
per `frontend/nginx.conf`). See `README.md` for the full Droplet setup walkthrough (Docker
install, `.env` setup, `./deploy.sh`, useful `docker compose` commands, and the note on adding
TLS via Certbot in front of the `frontend` container).
