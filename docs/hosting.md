# Hosting Rivet

Supabase runs only TypeScript on Deno for compute, so it cannot run this Python API. The split is:

| Part | Where | Why |
| --- | --- | --- |
| Postgres (events, ledger, snapshot) | Supabase | Managed Postgres with backups |
| Evidence photos | Supabase Storage, private bucket `evidence` | Survive redeploys; bytes are checked against the ledger hash on every read |
| OTP login | Supabase Auth | Phone or email OTP matches the spec. **Not wired in yet, see below** |
| FastAPI API | Render (Docker, one instance) | Runs the scheduler and websocket in-process |
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

## Not done yet

- **Login.** With `ENV=production` the sign-in endpoints return 503 on purpose. Supabase Auth has to be connected: verify its token on the API, map each Supabase user to a Rivet user, role and sites, and sign in from the web app with Supabase's OTP. Until then the only way to run a hosted demo is `ENV=demo`, which is open to anyone, including admin reset.
- **Live Postgres run.** The Postgres code path, the immutable-table triggers and the Storage calls have been tested against fakes only. Run `pytest` once with `DATABASE_URL` pointing at a scratch Supabase database before trusting them.
- **Websockets through the web host.** Next.js rewrites do not proxy websockets on Vercel. The control room falls back to polling every 3 seconds. Live push needs a direct `wss://` connection to the API.
