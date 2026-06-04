# Deployment Instructions

**Sales Saathi v0.1**

---

## Overview

Sales Saathi is a static frontend (Vite MPA) backed by a Supabase project and a single Deno edge function. Deployment involves three steps:

1. **Supabase project setup** (database schema + auth + edge function)
2. **Frontend build and deploy** (Vercel / Netlify / AWS Amplify)
3. **Post-deployment verification**

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| npm | ≥ 9 | Included with Node.js |
| Supabase CLI | Latest | `npm install -g supabase` |
| Git | Any | [git-scm.com](https://git-scm.com) |
| psql (optional) | Any | [PostgreSQL downloads](https://www.postgresql.org/download/) |

---

## Step 1 — Supabase Project Setup

### 1.1 Create a Supabase Project

1. Sign in to [supabase.com](https://supabase.com)
2. Click **New Project**
3. Choose a name: `salessaathi`
4. Set a strong database password and save it securely
5. Select a region closest to your users
6. Wait for the project to initialise (~2 minutes)

### 1.2 Apply the Database Schema

1. In Supabase Dashboard → **SQL Editor**
2. Click **New Query**
3. Paste the contents of [`schema.sql`](../../schema.sql)
4. Click **Run**
5. Apply the missing column fix:
   ```sql
   ALTER TABLE public."PreMeetingBriefs" 
   ADD COLUMN generation_time_ms INTEGER;
   ```
6. Verify tables exist: Dashboard → **Table Editor** → check `Users` and `PreMeetingBriefs`

### 1.3 Configure Google OAuth (optional but recommended)

#### Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project or select an existing one
3. Enable the **Google+ API**
4. Navigate to **Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add Authorised Redirect URI:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
7. Copy the **Client ID** and **Client Secret**

#### Supabase Dashboard

1. Navigate to **Authentication → Providers → Google**
2. Toggle **Enable Sign in with Google**
3. Paste the Client ID and Client Secret
4. Save

### 1.4 Collect Your API Keys

From Supabase Dashboard → **Settings → API**:

| Key | Where to find |
|---|---|
| Project URL | API Settings → Project URL |
| Anon/Public key | API Settings → Project API keys → anon |

---

## Step 2 — Deploy the Edge Function

### 2.1 Link CLI to Your Project

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref <your-project-ref>
```

Find your project ref in: Dashboard → Settings → General → Reference ID.

### 2.2 Set Edge Function Secrets

```bash
# Required
supabase secrets set GEMINI_API_KEY=<your-google-ai-studio-key>

# Optional: enable debug logging
supabase secrets set DEBUG_MODE=false

# Verify
supabase secrets list
```

Get your Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

### 2.3 Deploy the Function

```bash
# Deploy generate-brief function
supabase functions deploy generate-brief

# Verify deployment
supabase functions list
```

### 2.4 Test the Edge Function

```bash
# Quick health check (should return 401 — auth working)
curl -X POST https://<your-ref>.supabase.co/functions/v1/generate-brief \
  -H "Content-Type: application/json" \
  -d '{"prospect_name":"Test","company":"TestCo"}'
```

Expected: `{"error":"Missing Authorization header"}` with status 401 — this confirms the function is deployed and auth validation is working.

---

## Step 3 — Frontend Deployment

### Configure Environment Variables

Create your `.env` file (or set variables in your hosting platform):

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_DEBUG_MODE=false
```

### Build Locally

```bash
# Install dependencies
npm install

# Build production bundle
npm run build

# Preview locally before deploying
npm run preview
```

The build output is in the `dist/` folder — static HTML, CSS, and JS.

---

### Option A — Deploy to Vercel (Recommended)

#### Via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy (follow prompts)
vercel

# For production deployment
vercel --prod
```

#### Via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repository
3. Framework Preset: **Vite**
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_DEBUG_MODE` = `false`
7. Click **Deploy**

#### Vercel Configuration (no config file needed)

Vite output is fully static — no special routing rules required for this MPA.

---

### Option B — Deploy to Netlify

#### Via Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build and deploy
npm run build
netlify deploy --dir=dist

# Deploy to production
netlify deploy --dir=dist --prod
```

#### Via Netlify Dashboard

1. Go to [netlify.com](https://netlify.com) → New Site from Git
2. Connect your GitHub repository
3. Build Settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Add environment variables (Site Settings → Build & Deploy → Environment):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_DEBUG_MODE` = `false`
5. Click **Deploy site**

#### `netlify.toml` (optional, for redirects)

```toml
[build]
  command   = "npm run build"
  publish   = "dist"

[build.environment]
  NODE_VERSION = "20"
```

---

### Option C — Deploy to AWS Amplify

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify)
2. Click **New App → Host Web App**
3. Connect your GitHub repository
4. App Settings:
   - Build command: `npm run build`
   - Output directory: `dist`
5. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_DEBUG_MODE` = `false`
6. Click **Save and Deploy**

---

## Step 4 — Update Supabase Auth Redirect URLs

After deploying the frontend, add your production URL to Supabase Auth:

1. Dashboard → **Authentication → URL Configuration**
2. Add to **Redirect URLs**:
   ```
   https://your-domain.com/**
   https://your-domain.com/dashboard.html
   https://your-domain.com/onboarding.html
   ```
3. Update **Site URL** to `https://your-domain.com`
4. Save

---

## Step 5 — Post-Deployment Verification Checklist

### Authentication
- [ ] Landing page (`/`) loads correctly
- [ ] Sign Up with email/password works → redirects to `dashboard.html`
- [ ] Sign In with email/password works
- [ ] Magic Link OTP email is received and works
- [ ] Google OAuth redirects correctly and logs in
- [ ] Signing out redirects to `auth.html`
- [ ] Accessing `dashboard.html` directly while logged out redirects to `auth.html`

### Brief Generation
- [ ] Brief generation form on `dashboard.html` submits without error
- [ ] Brief appears on `brief-result.html` with all 13 sections populated
- [ ] Brief is visible in `brief-history.html` after generation
- [ ] Deleting a brief removes it from history

### Database
- [ ] User record appears in Supabase Dashboard → Table Editor → Users
- [ ] Brief record appears in PreMeetingBriefs table after generation
- [ ] `generation_time_ms` column is populated

### Edge Function
- [ ] Supabase Dashboard → Edge Functions → `generate-brief` shows as Active
- [ ] Function logs show successful invocations (no errors)

---

## Environment Variable Reference

### Frontend (Vite)

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | **Yes** | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | Supabase publishable anon key |
| `VITE_DEBUG_MODE` | No | `true` for dev verbose logs; `false` in production |

### Edge Function (Supabase Secrets)

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Auto | Injected automatically by Supabase runtime |
| `SUPABASE_ANON_KEY` | Auto | Injected automatically by Supabase runtime |
| `GEMINI_API_KEY` | **Yes** | Google AI Studio API key |
| `DEBUG_MODE` | No | `true` for verbose edge function logs |

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| Blank page after deploy | Missing env variables | Confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in hosting platform |
| Auth redirects to wrong URL | Site URL mismatch | Update Supabase Auth → Site URL to match production domain |
| Google OAuth fails | Redirect URI not added | Add production callback URL to Google Cloud Console OAuth app |
| Brief generation returns 500 | GEMINI_API_KEY not set | Run `supabase secrets set GEMINI_API_KEY=<key>` and redeploy |
| Brief generation returns 401 | JWT expired or invalid | Ensure frontend sends the current session token |
| DB insert fails on brief | Missing `generation_time_ms` column | Run the `ALTER TABLE` fix in SQL Editor |
| Email OTP not received | Rate limit reached | Wait for the rate limit window or configure SMTP provider |
| Build fails locally | Stale node_modules | Delete `node_modules/` and `package-lock.json`, then `npm install` |
