# Release Notes — Sales Saathi v0.1 Stable

**Release Date:** 2026-06-04  
**Version:** 0.1.0  
**Type:** First Stable Release

---

## What Is Sales Saathi?

Sales Saathi is an AI-powered pre-meeting intelligence platform for enterprise sales teams. Before every client call, it generates a structured, actionable brief covering company context, pain points, buying signals, stakeholder analysis, discovery questions, objection handling playbooks, and a recommended meeting strategy — all in seconds.

---

## What's Included in v0.1

### ✅ Core Features Shipped

| Feature | Status |
|---|---|
| User Sign Up (Email/Password) | ✅ Live |
| User Sign In (Email/Password) | ✅ Live |
| Magic Link / OTP Sign In | ✅ Live |
| Google OAuth Sign In | ✅ Live |
| Route Protection (dashboard, settings, briefs) | ✅ Live |
| AI Pre-Meeting Brief Generation (Gemini 2.5 Flash) | ✅ Live |
| Structured JSON output (13 brief sections) | ✅ Live |
| Brief persistence in Supabase Postgres | ✅ Live |
| Brief history & retrieval | ✅ Live |
| Row-Level Security (user-scoped data) | ✅ Live |
| Offline / Demo mode (localStorage fallback) | ✅ Live |
| Marketing pages (Landing, Features, Pricing, Solutions) | ✅ Live |
| Role pages (AEs, RevOps, Sales Leaders) | ✅ Live |

---

## Architecture Snapshot

```
Browser (HTML/Alpine.js/Vanilla CSS)
        │
        ▼
  Vite 5 MPA Build
        │
        ├── src/auth.js       (Alpine auth store — Supabase Auth)
        ├── src/db.js         (DB abstraction — Supabase + mock fallback)
        └── src/main.js       (Entry point — loads db, auth, css)
        │
        ▼
  Supabase Platform
        │
        ├── Auth              (Email, Magic Link, Google OAuth)
        ├── Postgres          (Users, PreMeetingBriefs tables + RLS)
        └── Edge Function     (generate-brief → Gemini 2.5 Flash)
```

---

## Environment Variables Required

### Frontend (Vite — prefix `VITE_`)
| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable anon key |
| `VITE_DEBUG_MODE` | `true` to enable verbose console logs (development only) |

### Edge Function (Supabase Secrets)
| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Injected automatically by Supabase runtime |
| `SUPABASE_ANON_KEY` | Injected automatically by Supabase runtime |
| `GEMINI_API_KEY` | Google AI Studio API key for Gemini 2.5 Flash |
| `DEBUG_MODE` | `true` to enable verbose edge function logs |

---

## What's NOT in v0.1

The following features are **planned but not yet implemented**:

- CRM integrations (Salesforce, HubSpot)
- Google Calendar sync
- Email automation (SendGrid)
- Pipeline webhook endpoints
- Team / multi-workspace support
- Mobile app / PWA
- Brief search, filtering, and tagging
- Export to PDF / DOCX

---

## Known Limitations

| # | Limitation | Workaround |
|---|---|---|
| 1 | `generation_time_ms` field is written by the edge function but not present in the current `schema.sql`. The insert will silently ignore the column on some Postgres configurations or raise a column-not-found error. | Add the column manually: `ALTER TABLE public."PreMeetingBriefs" ADD COLUMN generation_time_ms INTEGER;` |
| 2 | Google OAuth requires a configured OAuth app in Google Cloud Console with the correct redirect URIs. | Follow the Supabase OAuth setup guide in `docs/DEPLOYMENT_INSTRUCTIONS.md`. |
| 3 | Mock mode stores data in `localStorage` — data is lost when browser storage is cleared. | This mode is intended for demos only. Connect Supabase for persistence. |
| 4 | Email rate limit is set to 2 emails/hour in `supabase/config.toml` for local dev. | Raise `auth.rate_limit.email_sent` for production or use an SMTP provider. |

---

## Breaking Changes

None. This is the first stable release.

---

## Deprecated in This Release

| File | Reason | Location |
|---|---|---|
| `src/api/mockApi.js` | Dashboard-level mock API — superseded by live Supabase/Gemini stack. Never imported in production. | `archive/deprecated/mockApi.js` |
| `src/api/mockData.js` | Static fixture data for mockApi — no longer needed. | `archive/deprecated/mockData.js` |

---

## Debug Mode

Development console logs have been gated behind environment flags:

- **Frontend:** Set `VITE_DEBUG_MODE=true` in `.env`
- **Edge Function:** Set `DEBUG_MODE=true` in Supabase edge function secrets

All `[DEBUG]`-prefixed log lines are silent in production unless the flag is explicitly enabled.

---

## How to Deploy

See [`docs/DEPLOYMENT_INSTRUCTIONS.md`](docs/DEPLOYMENT_INSTRUCTIONS.md) for the full step-by-step deployment guide covering Vercel, Netlify, and AWS Amplify.

---

## How to Back Up

See [`docs/BACKUP_INSTRUCTIONS.md`](docs/BACKUP_INSTRUCTIONS.md) for database backup, environment variable backup, and Git tagging procedures.

---

## Architecture Documentation

Full architecture documentation is available in the [`docs/architecture/`](docs/architecture/) directory:

- [Frontend Architecture](docs/architecture/FRONTEND.md)
- [Supabase Configuration](docs/architecture/SUPABASE.md)
- [Edge Functions](docs/architecture/EDGE_FUNCTIONS.md)
- [Gemini AI Integration](docs/architecture/GEMINI_INTEGRATION.md)
- [Database Schema](docs/architecture/DATABASE_SCHEMA.md)

---

*Sales Saathi v0.1 Stable — Built for enterprise sales excellence.*
