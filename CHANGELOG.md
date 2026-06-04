# Changelog

All notable changes to Sales Saathi are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.1.0] — 2026-06-04 · **First Stable Release**

### Added

#### Platform & Infrastructure
- Vite 5 multi-page application (MPA) build system with `vite.config.js` mapping 12+ HTML entry points
- Supabase project integration: Authentication, Postgres, Row-Level Security, Edge Runtime
- `supabase/config.toml` with full local dev configuration (API, DB, Auth, Storage, Analytics, Edge Runtime)
- `schema.sql` with `Users` and `PreMeetingBriefs` tables and all RLS policies
- `.env` / `.env.example` environment variable scaffolding

#### Authentication System (`src/auth.js`, `src/db.js`)
- Alpine.js reactive `auth` store with full session lifecycle management
- Email/password sign-up and sign-in via Supabase Auth
- Magic Link / OTP sign-in via Supabase Auth
- Google OAuth sign-in via Supabase Auth
- Automatic token refresh via `onAuthStateChange` listener
- Route protection: unauthenticated users redirected to `auth.html`
- Auth callback handling for Magic Link and OAuth deep links (`access_token=`, `code=` fragments)
- Fallback mock authentication mode using `localStorage` when Supabase is not configured
- User record sync: fetches or creates `Users` table row on every session

#### Database Abstraction Layer (`src/db.js`)
- `db.createUser()` — inserts into `public.Users`
- `db.getUser(id)` — fetches user by UUID
- `db.updateUser(id, updates)` — partial update
- `db.createBrief(briefData)` — inserts into `public.PreMeetingBriefs`
- `db.updateBrief(id, updates)` — partial update
- `db.getUserBriefs(userId)` — list briefs, newest first
- `db.getBrief(id)` — fetch single brief
- `db.deleteBrief(id)` — remove brief
- Full localStorage mock fallback for all DB operations (offline/demo mode)
- `isSupabaseConfigured` boolean flag for conditional real/mock routing

#### Gemini AI — Pre-Meeting Brief Generation
- Supabase Edge Function `generate-brief` (Deno runtime, TypeScript)
- Calls `gemini-2.5-flash` via Google Generative Language REST API
- Enforces structured JSON output via `response_schema` (13 required fields)
- System instruction: "Sales Saathi – Enterprise Sales Coach"
- Prompt accepts: `prospect_name`, `company`, `role`, `meeting_type`, `meeting_datetime`, `additional_context`
- Generated brief fields: `executive_summary`, `company_overview`, `recent_news`, `likely_pain_points`, `buying_signals`, `stakeholder_analysis`, `recent_business_context`, `discovery_questions`, `conversation_starters`, `objection_handling`, `recommended_pitch_angle`, `meeting_strategy`, `recommended_next_steps`
- Response persisted to `PreMeetingBriefs` table via JWT-authenticated Supabase client (respects RLS)
- Generation timing tracked in `generation_time_ms`
- CORS preflight handled via shared `_shared/cors.ts` headers

#### Frontend Pages
- `index.html` — Marketing landing page
- `auth.html` — Sign In / Sign Up / Magic Link / Google OAuth
- `dashboard.html` — Brief generation form + briefs list
- `brief-result.html` — Rendered AI brief with all 13 sections
- `brief-history.html` — Historical briefs list
- `onboarding.html` — Post-signup onboarding flow
- `settings.html` — User profile settings
- `features.html` — Feature showcase page
- `pricing.html` — Pricing plans
- `solutions.html` — Solutions overview
- `solutions/account-executives.html` — Role-specific solution page
- `solutions/revenue-operations.html` — Role-specific solution page
- `solutions/sales-leaders.html` — Role-specific solution page
- `contact.html` — Contact form
- `resources.html` — Resources & blog
- `workflow.html` — Workflow visualisation
- `social-proof.html` — Testimonials / social proof
- `header.html` — Shared navigation component

### Changed
- N/A (initial release)

### Deprecated
- `src/api/mockApi.js` — dashboard-level mock API (pre-meeting briefs, ice-breakers, deal risk, pipeline analytics). Superseded by live Supabase + Gemini stack. Moved to `archive/deprecated/`.
- `src/api/mockData.js` — static mock data consumed only by `mockApi.js`. Moved to `archive/deprecated/`.

### Removed
- N/A

### Fixed
- N/A

### Security
- Row-Level Security (RLS) enforced on all tables: users can only read/write their own data
- Edge function validates JWT via `supabase.auth.getUser(token)` before any DB operation
- Authenticated Supabase client (user JWT forwarded) used for all RLS-gated DB writes
- No secrets committed: `.env` excluded from version control via `.gitignore`

---

## [Unreleased]

> Items scoped for future milestones

### Planned
- CRM integrations: Salesforce, HubSpot
- Calendar sync: Google Calendar
- Email automation: SendGrid
- Pipeline webhook endpoints
- Multi-brief history search and filter
- Team / workspace multi-user support
- Mobile-responsive design pass

---

*Generated on 2026-06-04 as part of Release v0.1 Stable.*
