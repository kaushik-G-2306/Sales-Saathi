# Supabase Architecture

**Sales Saathi v0.1**

---

## Overview

Supabase provides the entire backend infrastructure for Sales Saathi:

- **Authentication** — Email/Password, Magic Link OTP, Google OAuth
- **Postgres Database** — Users and PreMeetingBriefs tables with RLS
- **Edge Runtime** — Deno-based serverless functions
- **Realtime** — Enabled (not yet used in v0.1)
- **Storage** — Enabled (not yet used in v0.1)

---

## Project Configuration (`supabase/config.toml`)

### Core Settings

| Setting | Value | Notes |
|---|---|---|
| `project_id` | `salessaathi` | Local project identifier |
| `api.port` | `54321` | Local REST API port |
| `db.port` | `54322` | Local Postgres port |
| `db.major_version` | `17` | Must match remote Postgres version |
| `studio.port` | `54323` | Supabase Studio UI port |

### Authentication Configuration

| Setting | Value |
|---|---|
| `auth.site_url` | `http://127.0.0.1:3000` |
| `auth.additional_redirect_urls` | `["https://127.0.0.1:3000"]` |
| `auth.jwt_expiry` | `3600` (1 hour) |
| `auth.enable_signup` | `true` |
| `auth.enable_anonymous_sign_ins` | `false` |
| `auth.email.enable_signup` | `true` |
| `auth.email.enable_confirmations` | `false` |
| `auth.email.otp_length` | `6` |
| `auth.email.otp_expiry` | `3600` |

### Rate Limits

| Limit | Value |
|---|---|
| Email sent per hour | 2 (local dev) |
| Sign in/up per 5 min per IP | 30 |
| OTP verifications per 5 min per IP | 30 |
| Token refresh per 5 min per IP | 150 |

> **Production note:** Increase `auth.rate_limit.email_sent` and configure `auth.email.smtp` for a production SMTP provider.

### Storage

| Setting | Value |
|---|---|
| `storage.file_size_limit` | `50MiB` |
| `storage.s3_protocol.enabled` | `true` |

### Edge Runtime

| Setting | Value |
|---|---|
| `edge_runtime.enabled` | `true` |
| `edge_runtime.policy` | `per_worker` (hot reload) |
| `edge_runtime.deno_version` | `2` |
| `edge_runtime.inspector_port` | `8083` |

---

## Authentication Providers

### Email / Password
Standard Supabase email+password auth. Email confirmations are **disabled** in the current config (`enable_confirmations = false`) — users can log in immediately after signup.

### Magic Link / OTP
`supabase.auth.signInWithOtp({ email })` sends a 6-character OTP to the user's email. The OTP expires after 1 hour. Redirect target: `dashboard.html`.

### Google OAuth
`supabase.auth.signInWithOAuth({ provider: 'google' })`. Requires a Google Cloud Console OAuth 2.0 app with the Supabase callback URL set as an authorised redirect URI.

**Required redirect URI format:**
```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

Configure in Supabase Dashboard → Authentication → Providers → Google.

---

## Database

### Connection Details (local dev)

```
Host:     localhost
Port:     54322
Database: postgres
User:     postgres
Password: postgres
```

### Tables

See [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) for full table definitions and RLS policies.

---

## Auth State Listener

The frontend subscribes to auth state changes:

```javascript
supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        await this.handleSession(session);
    } else if (event === 'SIGNED_OUT') {
        this.clearSession();
    }
});
```

On `SIGNED_IN`, the app fetches (or creates) the user record in `public.Users`, ensuring DB state is always in sync with the Auth state.

---

## User Record Sync Strategy

When a session is detected:

1. Call `db.getUser(session.user.id)` — look up in `public.Users`
2. If not found → call `db.createUser(...)` with data from `session.user`
3. If DB insert fails (e.g. RLS conflict) → construct user object from session data as fallback
4. Ensure `name` field is always populated (fallback: email prefix)

---

## Supabase Client Initialisation

```javascript
// src/db.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = supabaseUrl !== '' && supabaseAnonKey !== '';
export const supabase = isSupabaseConfigured 
    ? createClient(supabaseUrl, supabaseAnonKey) 
    : null;
```

When `isSupabaseConfigured = false`, all auth and DB operations fall back to the `localStorage` mock implementation.

---

## Local Development Setup

### Prerequisites
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker Desktop

### Commands

```bash
# Start local Supabase stack
supabase start

# Apply database schema
supabase db reset
# or manually:
psql -h localhost -p 54322 -U postgres -d postgres -f schema.sql

# Deploy edge functions locally
supabase functions serve generate-brief --env-file .env

# Stop local stack
supabase stop
```

### Local Service URLs

| Service | URL |
|---|---|
| REST API | http://127.0.0.1:54321 |
| Supabase Studio | http://127.0.0.1:54323 |
| Email (Inbucket) | http://127.0.0.1:54324 |
| Analytics | http://127.0.0.1:54327 |

---

## Remote (Production) Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run `schema.sql` via the SQL Editor in Supabase Dashboard
3. Set environment variables in your hosting platform:
   - `VITE_SUPABASE_URL` → Project URL (Settings → API)
   - `VITE_SUPABASE_ANON_KEY` → Anon/Public key (Settings → API)
4. Deploy edge functions:
   ```bash
   supabase functions deploy generate-brief --project-ref <your-ref>
   supabase secrets set GEMINI_API_KEY=<your-key> --project-ref <your-ref>
   ```

See [`DEPLOYMENT_INSTRUCTIONS.md`](../DEPLOYMENT_INSTRUCTIONS.md) for full details.
