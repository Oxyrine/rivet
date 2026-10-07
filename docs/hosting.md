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

## Demo mode on a hosted server

Signing in and demo controls are separate switches. `ENV=production` means only Supabase sign-ins are accepted. Setting `DEMO_CONTROLS=1` on top of that lets an **admin** use the scripted clock and the data reset, on the **Team access** page of the web app:

- The M-104 story runs on scripted times (09:02 to 12:26). Without the switch the server follows the real clock, the seeded jobs of 7 October look overdue, and the background job drops technicians for missed check-ins on its own.
- **Reset** restores the clean seed after a rehearsal. Who is linked to which sign-in is kept.
- Turn the switch off for real use. Leave it unset and the clock and reset endpoints refuse every request.

The same page links each person to a Supabase sign-in, and can create the demo sign-ins itself.

**Demo logins.** With `DEMO_CONTROLS=1` and `SUPABASE_SERVICE_KEY` set on the API, the Team access page has a **Demo logins** panel. *Create demo logins* makes one real Supabase account per demo role (coordinator, manager, supervisor, requester, storekeeper, auditor, and technicians ravi and priya) and links each to its person. The accounts are plus-addresses of the administrator's own inbox (for example `you+rivet-ravi@gmail.com`), so a password reset can only reach the administrator. Passwords are random and shown once, never stored; running it again rotates them. A person who already has a real address linked is skipped. Sign in with the email and password from the top bar. After the demo, press *Remove demo logins* (or turn `DEMO_CONTROLS` off) so no shared passwords stay live.

**One-click entry.** Once the logins exist, the Sign in menu shows *Enter as...* buttons for them, so nobody types a password on stage. The server hands the browser a one-time Supabase token for the demo account (no password involved). It only works while `DEMO_CONTROLS=1`, never offers a real person's account, and is rate limited to 20 tries a minute per address. Admin is left out because an admin can reset data and create accounts; set `DEMO_ENTER_ADMIN=1` on the API to add it, and unset it afterwards. While `DEMO_CONTROLS=1` is on, anyone who opens the site can enter as these demo roles, so keep it on only for the demo and turn it off afterwards.

## Local fallback

The whole stack also runs on a laptop with no internet. Start the API (`ENV=demo`) and the web app with `NEXT_PUBLIC_AUTH_MODE=demo`, which forces the built-in demo sign-in even if the Supabase values are present. The `rivet-api` and `rivet-web-demo` launch entries do exactly this.

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
