# Deploying ReSchedule (one server, HTTPS, PostgreSQL, nightly backups)

What runs: **Caddy** (HTTPS, automatic certificates) → **nginx** (the site and the `/api` proxy) → **API** (FastAPI + the solver) → **PostgreSQL**.
All four are started by one `docker compose` file. The data lives in a Docker volume called `pgdata`.

I could not run Docker in my build sandbox, so the compose file is validated but this exact stack has not been started end to end.
Do the first deployment on a cheap test server, check the list at the bottom, then use the same steps for the real one.

## 0. What you need
- A Linux server (Ubuntu 22.04 or 24.04), 2 GB RAM or more, with ports 80 and 443 open. Any provider works (Hetzner, DigitalOcean, AWS Lightsail, Oracle Cloud).
- A domain name, with an **A record** pointing at the server's IP (for example `reschedule.yourdomain.com`).
- The keys from `deploy/backend.env.prod.example` (Gemini, SMTP at minimum).

## 1. Prepare the server (once)
```bash
ssh root@YOUR_SERVER_IP
apt update && apt -y upgrade
curl -fsSL https://get.docker.com | sh        # installs Docker and the compose plugin
ufw allow OpenSSH && ufw allow 80 && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
mkdir -p /opt/reschedule
```

## 2. Upload the project
From your Windows machine (PowerShell), in the folder that contains `resched`:
```powershell
# skip node_modules and local data; the server builds its own
tar --exclude=node_modules --exclude=.venv --exclude=dist --exclude="*.db" --exclude=backend/.env -czf resched.tgz resched
scp resched.tgz root@YOUR_SERVER_IP:/opt/reschedule/
```
On the server:
```bash
cd /opt/reschedule && tar -xzf resched.tgz --strip-components=1 && rm resched.tgz
```

## 3. Create the two secret files (on the server only)
```bash
cp deploy/compose.env.example .env
cp deploy/backend.env.prod.example backend/.env.prod
nano .env                 # DOMAIN and a long random DB_PASSWORD   (openssl rand -hex 24)
nano backend/.env.prod    # SECRET_KEY (openssl rand -hex 32), your https domain in the three URL lines,
                          # ADMIN_EMAILS, LLM_API_KEY, SMTP_*
chmod 600 .env backend/.env.prod
```
The API refuses to start in production if the secret is short, the database is SQLite, or an origin is `http://`. That is on purpose.
Do **not** put `DEV_ECHO_OTP` in production.

## 4. Start it
```bash
docker compose up -d --build
docker compose ps                 # all four should be "running" (db "healthy")
docker compose logs -f api        # wait for "Application startup complete", then Ctrl+C
curl https://YOUR_DOMAIN/api/health      # {"ok":true,"env":"prod"}
```
The first request can take a minute while Caddy gets the certificate. If it fails, check that the A record points at the server: `docker compose logs caddy`.
Tables are created automatically on first start.

## 5. First account and staff access
Open `https://YOUR_DOMAIN/#/signup`, register with the email you put in `ADMIN_EMAILS`, enter the emailed code. That account is the owner of its shop and can open `#/app/admin` to see pilot requests.

## 6. Turn on the integrations you want
- **Google sign-in:** Google Cloud Console, Credentials, OAuth client (Web). Authorised redirect URI exactly: `https://YOUR_DOMAIN/api/auth/google/callback`. Put the id and secret in `backend/.env.prod`, then `docker compose up -d`.
- **WhatsApp codes:** Meta WhatsApp Cloud API, two approved templates (see README). Approval takes days, so start early.
- **DuckMama:** a paid Gemini key before real customer data (free tiers may use prompts for training).
After any `.env.prod` change: `docker compose up -d` (it recreates the API).

## 7. Backups (do this on day one)
```bash
bash deploy/backup.sh                       # try it once; a file appears in backups/
crontab -e                                  # then add:
30 2 * * * cd /opt/reschedule && bash deploy/backup.sh >> backups/backup.log 2>&1
```
Copy `backups/` off the server regularly (another machine or object storage). A backup on the same disk does not survive losing the server.
**Test a restore** on the test server: `bash deploy/restore.sh backups/<file>`. An untested backup is a guess.

## 8. Updating later
Upload the new project files the same way (keep `.env` and `backend/.env.prod`; the tar command above excludes only local dev files), then:
```bash
bash deploy/backup.sh && docker compose up -d --build
```
There is no migration tool yet. If a release changes the database schema, new tables appear automatically but changed columns do not, so take a backup first and add Alembic before the first schema change that matters.

## 9. Checklist before you tell anyone the URL
- [ ] `https://YOUR_DOMAIN` loads with a padlock; `http://` redirects to it
- [ ] `/api/health` says `"env":"prod"`; `/api/docs` returns 404 (docs are off in production)
- [ ] Sign up, receive the email code, sign in, sign out, sign in again
- [ ] Upload a CSV, build a plan, approve it, report a disruption, approve the repair
- [ ] Wait 20 minutes, stay on the page, click around: you are **not** logged out (the refresh cookie works)
- [ ] DuckMama answers (a wrong Gemini key shows an "API key" message)
- [ ] Request pilot access from the home page; it appears in `#/app/admin`
- [ ] A backup file exists, and a restore worked on the test server
- [ ] `docker compose ps` still shows everything running after `reboot`
- [ ] Keys that were ever pasted into chat or email are rotated

## Useful commands
```bash
docker compose logs -f api            # API logs (DuckMama errors show here, never your key)
docker compose restart api
docker compose exec db psql -U reschedule -d reschedule     # look inside the database
docker compose down                   # stop (data stays). NEVER add -v unless you mean to delete the data
```

## Known limits (be honest with customers)
Rate limits are per process (two workers), no migrations yet, the stack is one server (no automatic failover), and PostgreSQL support is
written but was not exercised against a live database in my sandbox. SECURITY_AUDIT.md lists the rest.
