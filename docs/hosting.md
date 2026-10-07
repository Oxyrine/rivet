# Hosting Rivet

Supabase runs only TypeScript on Deno for compute, so it cannot run this Python API. The split is:

| Part | Where | Why |
| --- | --- | --- |
| Postgres (events, ledger, snapshot) | Supabase | Managed Postgres with backups |
| Evidence photos | Supabase Storage, private bucket `evidence` | Survive redeploys; bytes are checked against the ledger hash on every read |
| OTP login | Supabase Auth (email code) | The API verifies Supabase's signed token; phone OTP needs an SMS provider enabled in Supabase |
| FastAPI API | Render (Docker, one instance, free plan works) | Runs the scheduler in-process |
| Web app | Vercel or Render | Needs `API_URL` set to the API origin at build time |

## What is ready

- `RIVET_SIGNING_KEY` supplies the provider signing key as a secret. Without it the key is a local file, and a hosted container would mint a new key on every deploy, which breaks every package a customer has already pinned.
- Evidence goes to Supabase Storage when `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set, and to local disk otherwise.
- `DATABASE_URL` accepts the `postgres://` or `postgresql://` form Supabase shows. Connections work behind a transaction-mode pooler.
- On Postgres, startup enables row-level security (with no policies) on every Rivet table, so Supabase's public REST keys cannot read them. The API connects as the database owner, which is not affected.

## One-time setup

1. Create a Supabase project. Under Storage, create a **private** bucket named `evidence`.
2. Copy the Postgres connection string (session pooler) for `DATABASE_URL`.
3. Generate the signing key once and store it somewhere safe:
   `python -c "import base64,os;print(base64.b64encode(os.urandom(32)).decode())"`
   Share the public key fingerprint with customers at onboarding. Losing this key means rotating it for every customer.
4. In Render choose New, then Blueprint, point it at this repo, and fill in the variables marked `sync: false`.
5. For the web app set `API_URL` to the Render URL when building, and add the web origin to `CORS_ORIGINS`.

## Login

With `ENV=production` the demo login is off. The web app emails a one-time code through Supabase, and the API checks the signed token against Supabase's published keys (no secret needed). Signing in to Supabase is not enough: the address must also be **linked to a Rivet user**, which carries the role and site scope. An unlinked address gets `NOT_PROVISIONED` (403).

1. Set `BOOTSTRAP_ADMIN_EMAIL` on the API. That address maps to the `admin` user, so a fresh deployment cannot lock itself out.
2. Sign in as that admin, then link everyone else: `POST /admin/users/{user_id}/link` with `{"email": "..."}`. One address maps to one user. The audit trail stores only a hash of the address.
3. In the Supabase dashboard turn off **Allow new users to sign up** once the admin account exists, and invite people from there. Without that, anyone can create a Supabase account (they still get no access in Rivet).
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` where the web app is built. Both are public. See `web/.env.example`.

## Running on free plans

Everything here has a free tier: Render, Supabase and Vercel.

- **Render free sleeps** after 15 minutes without traffic. The next request takes about a minute while it wakes. The 60-second scheduler pauses while asleep (hold expiry, missed check-ins, deemed acceptance), then catches up on the first tick after it wakes. Open `/health` shortly before a demo, or ping it every 10 minutes with a free uptime monitor. Free instance hours (about 750 a month) are shared across a Render workspace.
- **Keep it warm.** `.github/workflows/keep-warm.yml` pings the API, the database (`/health/db`) and the web app every 5 minutes. GitHub's scheduler can run late, so also add a free monitor, for example UptimeRobot: an HTTP(s) monitor on `https://<your-api>.onrender.com/health/db` with a 5-minute interval. Together they keep Render awake (it sleeps after 15 minutes idle) and Supabase active.
- **Supabase free pauses** a project after about a week of inactivity, which stops the database. Use the app or open the project before a demo, and restore it from the dashboard if it paused.
- **Supabase's built-in email sender** is rate-limited and only reaches members of your Supabase organization. Add custom SMTP before anyone else signs in.

## Not done yet

- **Phone OTP.** Supabase has the phone provider off. Technicians on shared phones would need it plus an SMS provider.
- **Live Postgres run.** The Postgres code path, the immutable-table triggers and the Storage calls have been tested against fakes only. Run `pytest` once with `DATABASE_URL` pointing at a scratch Supabase database before trusting them.
- **Websockets through the web host.** Next.js rewrites do not proxy websockets on Vercel. The control room falls back to polling every 3 seconds. Live push needs a direct `wss://` connection to the API.
