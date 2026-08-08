# Staging Deployment Architecture and Environment Configuration Runbook

This document defines the staging deployment architecture, environmental settings, and operations runbook for the Koranco Farms Digital Farm Management System. It serves as a comprehensive, step-by-step reproduction guide for deploying and validating the existing application in a real staging environment prior to production.

---

## 1. APPROVED STAGING ARCHITECTURE

To ensure high-fidelity verification of the application's online and offline workflows, the first hosted environment is **Staging**. Staging matches the core modular-monolith layout while using separate hosting providers for the frontend and API layers.

```
                  ┌───────────────────────────┐
                  │          Browser          │
                  └─────────────┬─────────────┘
                                │ HTTPS
                                │ (with Cross-Origin Cookies)
                                ▼
  ┌────────────────────────────────────────────────────────┐
  │                        Vercel                          │
  │                  (Next.js Frontend)                    │
  │                      `apps/web`                        │
  └─────────────────────────────┬──────────────────────────┘
                                │ HTTPS Requests
                                │ (with credentials)
                                ▼
  ┌────────────────────────────────────────────────────────┐
  │                        Render                          │
  │                  (FastAPI Backend)                     │
  │                      `apps/api`                        │
  └─────────────────────────────┬──────────────────────────┘
                                │ Private / Internal Network
                                │ (TCP 5432)
                                ▼
  ┌────────────────────────────────────────────────────────┐
  │                  Render PostgreSQL 17                  │
  │                     (Database)                         │
  └────────────────────────────────────────────────────────┘
```

### Constraints & Invariants
- **No Supabase:** The existing PostgreSQL database remains the single authoritative store.
- **No Provider Auth:** Application-managed authentication is maintained; do not replace it with third-party social/provider logins.
- **No Serverless Backend Rewrites:** FastAPI is deployed as a long-running Render Web Service. Vercel is used solely for the Next.js frontend; Next.js API routes are not introduced.
- **No Redis / Celery / Kubernetes / Docker Orchestration:** Avoid premature complexity.

---

## 2. STAGING VS. PRODUCTION POSTURE

The staging environment exists exclusively to isolate and validate runtime concerns without risking real farm data.

- **Synthetic Data Only:** Under no circumstances should real production data or real farm user credentials be populated in staging.
- **Production-Ready Status Deferred:** Staging is **not** declared production-ready. The following remains outstanding as release blockers for the production pilot:
  1. Browser E2E runtime verification in the hosted environment.
  2. Mixed-domain E2E testing (across Vercel and Render).
  3. Physical-device field testing in poor network conditions (e.g. offline Harvest/Attendance).

---

## 3. DEPLOYMENT READINESS AUDIT

An audit of the codebase confirms that the current system is clean and deployment-ready:
- **Pristine Migration History:** Alembic migrations are structured, sequentially ordered, and up-to-date with head revision `0009_reporting_permissions.py`.
- **Quality Checks Passing:** Frontend linting (`pnpm lint`), type-checking (`pnpm typecheck`), and Vitest unit/integration suites (72 passing tests) pass perfectly out-of-the-box.
- **Backend Quality Passing:** Backend type-checking (`mypy`) and linting (`ruff check`) are completely clean.

---

## 4. VERCEL FRONTEND CONFIGURATION

The Next.js frontend is deployed to **Vercel** as a workspace project within a monorepo.

### Project Settings
- **Project Name:** `koranco-web-staging`
- **Framework Preset:** `Next.js`
- **Root Directory:** `apps/web`
- **Build Command:** `pnpm build`
- **Install Command:** `pnpm install --frozen-lockfile`
- **Development Command:** `pnpm dev`
- **Output Directory:** Default (let Vercel automatically handle `.next`). *Do not configure static export; dynamic Next.js runtime features must be supported.*

### Environment Variables
Vercel environment settings must include the explicit HTTPS origin of the Render API:
- **`NEXT_PUBLIC_API_ORIGIN`**: `https://koranco-api-staging.onrender.com` (use the actual staging Render URL).
  - *Security Verification:* Only genuinely public environment variables are exposed on the frontend. No passwords, credentials, or private configuration may contain the `NEXT_PUBLIC_` prefix.

---

## 5. FASTAPI BACKEND ON RENDER

The existing FastAPI backend is deployed to **Render** as a Python Web Service.

### Service Configuration
- **Name:** `koranco-api-staging`
- **Region:** Colocated with the staging database (e.g., Oregon `us-west` or Frankfurt `eu-central`).
- **Runtime:** `Python`
- **Root Directory:** `apps/api`
- **Build Command:** `pip install uv && uv sync --frozen --no-dev`
- **Start Command:** `uv run uvicorn koranco.main:app --host 0.0.0.0 --port $PORT`
  - *Port Binding:* Render automatically supplies the `$PORT` environment variable. The start command dynamically binds to `$PORT` instead of hardcoding `8000`.
- **Pre-Deploy Command:** `uv run alembic upgrade head`
  - *Rationale:* Running migrations as part of the Pre-Deploy / Release phase prevents database race conditions from multiple concurrent web workers at startup.

---

## 6. RENDER POSTGRESQL DATABASE

A managed Render PostgreSQL instance is provisioned alongside the API service.

### Database Settings
- **Name:** `koranco-db-staging`
- **PostgreSQL Version:** `17`
- **Plan:** `Free` (or standard developer tier).
- **Access Limits:** The database should use the private/internal connection URL provided by Render (e.g., `postgresql://user:pass@dpg-xxx-a/db_name`), ensuring that the database is inaccessible from the public internet. Frontend applications never connect to the database directly.

---

## 7. ENVIRONMENT VARIABLE MATRIX

The complete staging environment-variable matrix is detailed below.

### Render API (Backend)

| Environment Variable | Type | Secret? | Purpose | Staging Example |
| :--- | :--- | :--- | :--- | :--- |
| `KORANCO_ENVIRONMENT` | Literal | No | Enables production-grade hardening behaviors. | `production` |
| `KORANCO_DATABASE_URL` | String | Yes | Private PostgreSQL 17 connection string. | `postgresql+psycopg://koranco_staging_user:pass@dpg-xxx-a:5432/koranco_staging` |
| `KORANCO_CORS_ORIGINS` | JSON Array | No | Explicit allowed frontend origins (must use HTTPS). | `["https://koranco-web-staging.vercel.app"]` |
| `KORANCO_CSRF_TRUSTED_ORIGINS` | JSON Array | No | Explicit trusted origins for state-changing CSRF checks. | `["https://koranco-web-staging.vercel.app"]` |
| `KORANCO_COOKIE_SAMESITE` | Literal | No | Configures cookie SameSite security behavior. | `none` (Required for cross-site Vercel + Render staging) |
| `KORANCO_LOG_LEVEL` | Literal | No | Granularity of backend structured logging. | `INFO` |
| `KORANCO_SESSION_TTL_HOURS` | Integer | No | Session cookie TTL in hours. | `12` |
| `KORANCO_LOGIN_FAILURE_LIMIT` | Integer | No | Max failures before temporary lockout. | `5` |
| `KORANCO_LOGIN_FAILURE_WINDOW_MINUTES` | Integer | No | Rate limit tracking window. | `15` |

### Vercel (Frontend)

| Environment Variable | Type | Secret? | Purpose | Staging Example |
| :--- | :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_API_ORIGIN` | String | No | Public HTTPS URL of the hosted Render API. | `https://koranco-api-staging.onrender.com` |

---

## 8. STAGING SECURITY & AUTHENTICATION STRATEGY

### Cookie SameSite & Cross-Origin Behavior
In local development, both frontend and backend are hosted under `localhost`, meaning cookies are treated as same-site. However, in staging, the frontend (`.vercel.app`) and backend (`.onrender.com`) belong to different registrable domains on the Public Suffix List.
- **The Problem:** Modern browsers refuse to send cookies with `SameSite=Lax` or `SameSite=Strict` on cross-site subrequests (such as an API fetch from the Vercel app to the Render API).
- **The Staging Solution:**
  1. Set `KORANCO_ENVIRONMENT=production` to ensure that `secure_cookies` is evaluated as `True` (meaning cookies are only transmitted over HTTPS).
  2. Set `KORANCO_COOKIE_SAMESITE=none` (SameSite=None). This is the only secure way cross-site subrequest cookies can work.
  3. The frontend is already pre-configured to use `credentials: "include"` on all `fetch` operations.
- **The Production Recommendation:**
  In a production environment, Koranco **must** use custom subdomains under a single shared root domain:
  - Frontend: `app.korancofarms.com`
  - API Backend: `api.korancofarms.com`
  Since both subdomains share the same registrable domain (`korancofarms.com`), cookies are same-site. This enables returning the security posture to `SameSite=Lax` or `SameSite=Strict` and avoids needing `SameSite=None`.

### CORS & CSRF
- **CORS:** Wildcards are rejected on authenticated API routes. `KORANCO_CORS_ORIGINS` must explicitly match the frontend HTTPS origin.
- **CSRF:** Origin checks and token matches remain fully enforced. `KORANCO_CSRF_TRUSTED_ORIGINS` must contain the exact frontend origin.
- **Security Headers:** Hardened security headers (HSTS, CSP, Framing protection) remain active. Content Security Policy is preserved but deferred from restrictive staging modifications to prevent breaking the offline PWA / Service Worker script.

---

## 9. MIGRATION RUNBOOK

Staging migrations are entirely automated using the Render Blueprint configuration:
1. When code is pushed, the build process triggers.
2. Once built, the Render pre-deploy command runs `uv run alembic upgrade head` inside the `apps/api` root.
3. The migration is applied against the fresh PostgreSQL 17 instance.
4. If migrations succeed, the web service starts. If migrations fail, the deployment is aborted, preserving the previous running state.

---

## 10. FIRST MANAGER BOOTSTRAP

Since public registration is disabled and default credentials are prohibited, the staging environment requires a secure manual bootstrap of the first Manager.

### Step-by-Step Procedure
1. Log into the Render Dashboard and navigate to the `koranco-api-staging` Web Service.
2. In the sidebar, click on the **Shell** tab to open an interactive terminal.
3. Run the secure bootstrap command:
   ```sh
   uv run python -m koranco.identity.bootstrap \
     --login manager@koranco-staging.local \
     --display-name "Staging Manager" \
     --confirm-bootstrap
   ```
4. When prompted, enter a secure, staging-specific password twice.
5. The script securely hashes the password using Argon2id and writes the user record.
6. The terminal is closed. Staging credentials should be generated using cryptographic randomness:
   ```sh
   python3 -c "import secrets; print(secrets.token_hex(16))"
   ```

---

## 11. STAGING VALIDATION RUNBOOK (SMOKE TEST)

Once both Vercel and Render services are successfully deployed, execute this 15-step smoke test using **Synthetic Data only**.

| Step | Action | Expected Behavior |
| :--- | :--- | :--- |
| **1** | Load Frontend | Access `https://koranco-web-staging.vercel.app`. Verify login page loads. |
| **2** | Check Health/Readiness | Load `https://koranco-api-staging.onrender.com/api/v1/health` and `/api/v1/readiness`. Confirm statuses are `"ok"` and `"ready"`. |
| **3** | Manager Login | Log in using bootstrapped Manager credentials. Confirm redirect to the dashboard. |
| **4** | Create Supervisor | Navigate to Admin -> Accounts. Create a new account with the `Supervisor` role. |
| **5** | Create Worker | Navigate to Workers. Create a new worker (e.g. Code: `W101`, Name: `Synthetic Worker A`). |
| **6** | Create Field/Block | Navigate to Farm Structure. Create a block (e.g. Code: `B01`, Name: `Staging Block 1`). |
| **7** | Submit Attendance | Navigate to Attendance. Prepare a roster, mark `W101` as Present, and submit. |
| **8** | Submit Harvest | Navigate to Harvest. Search and select `B01`, input `150` Kilograms, and submit. |
| **9** | Inspect Reports | Navigate to Reports. Confirm both submitted records are visible in Overview, Attendance, and Harvest tables. |
| **10** | CSV Export | Click "Export CSV" on the report. Confirm file downloads successfully and contains correct values. |
| **11** | Supervisor Restrictions | Log out, and log in as the newly created Supervisor. Attempt to access administrative accounts. Confirm access is denied (least-privilege). |
| **12** | Worker-Role Access Denial | Attempt to access management routes directly as a Supervisor. Confirm proper authorization denial. |
| **13** | Session Persistence | Refresh the browser or navigate away and return. Confirm the authenticated session persists. |
| **14** | Logout | Click "Log Out". Confirm cookies are cleared, and subsequent requests redirect back to `/login`. |
| **15** | Audit Event Verification | Check database logs or inspect backend audit events to verify creation of operational and security audit entries. |

---

## 12. OFFLINE PWA CAPTURE & SYNC TEST

Verify the offline capabilities of the PWA on a real browser or tablet:
1. Log in as a Supervisor and open the Attendance roster or Harvest form.
2. In the browser settings (or network tab), activate **Offline / Airplane Mode**.
3. Capture a new Attendance session and a new Harvest record.
4. Save the records. Verify that they are securely queued in the local IndexedDB and labeled as **"Pending Sync"** in the UI.
5. Reload the browser page. Confirm that the offline shell loads successfully and the queued records persist.
6. Reconnect to the network.
7. Click the **"Sync"** button.
8. Verify that the records are successfully uploaded to the Render API, cleared from the local queue, and marked as **"Synchronized"**.

---

## 13. PLAYWRIGHT INTEGRATION

To run Playwright tests against Staging without destructive behavior:
1. Set up an isolated database instance or run against the dedicated staging test database.
2. Override the Playwright base URL using the environment variable:
   ```sh
   PLAYWRIGHT_BASE_URL=https://koranco-web-staging.vercel.app pnpm e2e
   ```

---

## 14. PROVIDER COSTS & HANDOVER PLAN

### Cost Estimation (Staging vs. Production)
- **Staging:**
  - Vercel: Free Hobby Plan.
  - Render API: Free Tier (spins down on inactivity).
  - Render PostgreSQL 17: Free Tier (no automated backups, limited duration).
- **Production (Recommended minimal paid tier):**
  - Vercel: Pro plan ($20/user/month).
  - Render API: Starter Tier ($7/month) to prevent spin-down delays.
  - Render PostgreSQL: Standard Developer Tier ($15/month) which includes automated daily backups and point-in-time recovery.

### Ownership Handover
All production accounts must eventually be transferred to an organization controlled by Koranco. Avoid personal student or developer credentials. Configure GitHub repository secrets securely to manage deployment pipelines.
