# LLM Drift Monitor — Complete Launch Guide

Every exact command, in order, to go from zero to production.

---

## Prerequisites

- Python 3.9+, Node.js 18+, Docker
- [Supabase](https://supabase.com) account (free tier works)
- [Vercel](https://vercel.com) account (free tier works)
- OpenAI or Anthropic API key (for drift evaluation)
- Optional: Stripe account (for billing), SendGrid (for email alerts)

---

## STEP 1 — Supabase Setup (5 min)

### 1a. Create Supabase project
1. Go to [app.supabase.com](https://app.supabase.com) → New project
2. Choose a region close to your users
3. Set a strong database password

### 1b. Run the schema
1. Open: **SQL Editor** (left sidebar)
2. Click **New query**
3. Paste the contents of `docs/schema.sql`
4. Click **Run**

Expected output: `Success. No rows returned`

### 1c. Enable Email Auth
1. **Authentication** → **Providers** → **Email** → Enable
2. Optionally disable "Confirm email" for easier testing

### 1d. Copy your keys
From **Settings** → **API**:
```
Project URL:     https://xxxxx.supabase.co
anon public key: eyJhbGci...
service_role:    eyJhbGci...  ← Keep this secret!
```

---

## STEP 2 — Backend Setup (10 min)

```bash
cd backend

# Copy and edit env
cp .env.example .env
nano .env   # or: code .env
```

Fill in `.env`:
```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...  # service_role key
SUPABASE_ANON_KEY=eyJhbGci...     # anon key
ANTHROPIC_API_KEY=sk-ant-...      # for drift evaluation
OPENAI_API_KEY=sk-proj-...        # optional
SECRET_KEY=$(openssl rand -hex 32) # generate a random secret
```

### Option A: Run with Docker (recommended)
```bash
cd ..   # back to project root
docker compose up -d

# Verify
curl http://localhost:8000/health
# → {"status":"ok","version":"0.1.0","environment":"development"}

docker compose logs -f api   # watch logs
```

### Option B: Run locally
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

uvicorn app.main:app --reload --port 8000
```

### Verify backend
```bash
# Health check
curl http://localhost:8000/health

# API docs (development only)
open http://localhost:8000/docs
```

---

## STEP 3 — Create your first user + project (5 min)

### 3a. Sign up via API docs or run setup wizard

**Option A: Setup wizard**
```bash
cd backend
source .venv/bin/activate
python scripts/setup.py
# → Follow prompts: enter your email
# → Creates a project + API key + demo drift test
# → Prints your SDK quickstart snippet
```

**Option B: Sign up via Supabase**
1. Go to **Supabase → Authentication → Users → Invite user**
2. Enter your email → Invite
3. Check your email → click the link → set password

### 3b. Note your credentials
The setup wizard will print:
```
🔑  API Key:   lmd_xxxxxxxxxxxxxxxxxxxx
📁  Project:   xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

## STEP 4 — Frontend Setup (5 min)

```bash
cd frontend

# Create env file
cat > .env.local << EOF
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
NEXT_PUBLIC_API_URL=http://localhost:8000/v1
EOF

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

Sign in → you'll see the dashboard with your project.

---

## STEP 5 — Test the SDK (2 min)

```bash
pip install llm-monitor

python3 << 'EOF'
from llm_monitor import monitor

monitor.configure(
    api_key="lmd_your_key_from_step_3",
    project_id="your-project-id-from_step_3",
    backend_url="http://localhost:8000/v1",
    debug=True,  # See events being captured
)

# This call will appear in your dashboard within seconds
response = monitor.chat(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Say 'LLM Monitor is working!' in 5 words."}],
)
print(response.choices[0].message.content)

monitor.flush()  # Flush remaining events
print("\n✅ Check your dashboard at http://localhost:3000")
EOF
```

Refresh your dashboard — you should see the request appear with cost and latency.

---

## STEP 6 — Configure Alerts (optional, 5 min)

### Slack alerts
1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create App → Incoming Webhooks
2. Copy the webhook URL: `https://hooks.slack.com/services/T.../...`
3. In your dashboard → **Project Settings** → paste the webhook URL

### Email alerts
1. Get a [SendGrid](https://sendgrid.com) API key (free tier: 100 emails/day)
2. Add to `backend/.env`:
   ```
   SENDGRID_API_KEY=SG....
   SENDGRID_FROM_EMAIL=alerts@yourdomain.com
   ```
3. Restart backend: `docker compose restart api`

---

## STEP 7 — Deploy to Production

### 7a. Deploy backend to a VPS

**Recommended:** DigitalOcean Droplet ($6/month) or AWS EC2 t3.small

```bash
# On your server
git clone https://github.com/your-org/llm-drift-monitor.git
cd llm-drift-monitor

# Copy and fill production env
cp .env.example .env
nano .env
# Set APP_ENV=production, fill all keys

# Start with nginx
docker compose --profile production up -d

# Point your DNS: api.yourdomain.com → server IP
```

### 7b. Deploy frontend to Vercel

```bash
cd frontend

# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod

# Follow prompts — set these environment variables in Vercel dashboard:
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
# NEXT_PUBLIC_API_URL=https://api.yourdomain.com/v1
```

### 7c. Update Supabase Auth URLs
In Supabase → **Authentication** → **URL Configuration**:
- **Site URL**: `https://app.yourdomain.com`
- **Redirect URLs**: `https://app.yourdomain.com/**`

---

## STEP 8 — Publish SDK to PyPI (optional)

```bash
cd sdk

# Set version
# Edit pyproject.toml: version = "0.1.0"

pip install build twine
python -m build
twine upload dist/*
# Enter PyPI credentials when prompted
```

Your users can now: `pip install llm-monitor`

---

## STEP 9 — Set up Stripe Billing (optional)

1. Create [Stripe](https://stripe.com) account
2. Create 3 products with monthly prices: Starter ($49), Growth ($99), Scale ($299)
3. Copy the Price IDs (price_xxxx)
4. Add to `backend/.env`:
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_STARTER_PRICE_ID=price_...
   STRIPE_GROWTH_PRICE_ID=price_...
   STRIPE_SCALE_PRICE_ID=price_...
   ```
5. Set up Stripe webhook:
   - Dashboard → Webhooks → Add endpoint
   - URL: `https://api.yourdomain.com/v1/billing/webhook`
   - Events: `customer.subscription.updated`, `customer.subscription.deleted`

---

## STEP 10 — First Drift Test

In the dashboard → **Drift Tests** → **New Test**:

```
Name: Summarization Quality
Model: gpt-4o
Schedule: Daily

Golden Prompts:
[1] Summarize in 2 sentences: Apollo 11 landed on the Moon on July 20, 1969.
    Expected: A brief, accurate 2-sentence summary.

[2] Translate to French: Good morning, how are you?
    Expected: Bonjour, comment allez-vous ?
```

Click **Run Now** — within ~30 seconds you'll see quality scores (0-10) for each prompt.

---

## Troubleshooting

**Backend not starting:**
```bash
docker compose logs api
# Check for missing env vars or connection errors
```

**SDK not sending data:**
```python
monitor.configure(..., debug=True)
# Should print: "LLM Monitor captured: model=gpt-4o tokens=..."
```

**Dashboard showing no data:**
- Check backend is running: `curl http://localhost:8000/health`
- Check `NEXT_PUBLIC_API_URL` points to running backend
- Wait a few seconds — data appears within the batch flush interval (5s)

**Supabase RLS blocking inserts:**
- The backend uses the `service_role` key which bypasses RLS
- Make sure `SUPABASE_SERVICE_KEY` (not anon key) is set in backend `.env`

---

## Production Checklist

- [ ] Schema deployed to Supabase
- [ ] `SECRET_KEY` is a random 32-byte hex string
- [ ] All API keys set in production `.env`
- [ ] Backend behind HTTPS (nginx with TLS or load balancer)
- [ ] `APP_ENV=production` (disables Swagger UI)
- [ ] Supabase Auth redirect URLs updated
- [ ] Vercel env vars set
- [ ] Stripe webhook configured and verified
- [ ] Monitoring: set up uptime check on `/health`
- [ ] Backups: enable Supabase daily backups in project settings
