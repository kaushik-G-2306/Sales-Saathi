# Database Schema

**Sales Saathi v0.1**

---

## Overview

Sales Saathi uses a Supabase-hosted **PostgreSQL** database with two tables and a full Row-Level Security (RLS) policy set. All data access is user-scoped — no user can read or write another user's data.

Schema source file: [`schema.sql`](../../schema.sql)

---

## Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

Used to generate UUID v4 primary keys for `PreMeetingBriefs`.

---

## Entity Relationship Diagram

```
┌────────────────────────────────────┐
│          auth.users                │
│  (Supabase managed)                │
│  id UUID PK                        │
│  email TEXT                        │
│  ...                               │
└──────────────┬─────────────────────┘
               │ 1
               │ ON DELETE CASCADE
               │ N
┌──────────────▼─────────────────────┐
│            Users                   │
│  id UUID PK (FK → auth.users.id)   │
│  name TEXT NOT NULL                │
│  email TEXT UNIQUE NOT NULL        │
│  auth_provider TEXT                │
│  plan TEXT                         │
│  created_at TIMESTAMPTZ            │
└──────────────┬─────────────────────┘
               │ 1
               │ ON DELETE CASCADE
               │ N
┌──────────────▼─────────────────────┐
│         PreMeetingBriefs           │
│  id UUID PK                        │
│  user_id UUID FK → Users.id        │
│  prospect_name TEXT NOT NULL       │
│  company TEXT NOT NULL             │
│  role TEXT                         │
│  meeting_type TEXT                 │
│  meeting_datetime TIMESTAMPTZ      │
│  additional_context TEXT           │
│  generated_brief JSONB             │
│  status TEXT                       │
│  created_at TIMESTAMPTZ            │
└────────────────────────────────────┘
```

---

## `public."Users"` Table

```sql
CREATE TABLE public."Users" (
    id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    auth_provider TEXT DEFAULT 'email',
    plan          TEXT DEFAULT 'Free Trial',
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### Column Reference

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | No | — | Links to `auth.users.id`. Cascade deletes on auth user removal. |
| `name` | TEXT | No | — | Display name. Sourced from `user_metadata.full_name` or email prefix. |
| `email` | TEXT | No | — | User's email address. Unique constraint enforced. |
| `auth_provider` | TEXT | Yes | `'email'` | Authentication method: `email`, `google`, `email_otp` |
| `plan` | TEXT | Yes | `'Free Trial'` | Subscription tier. Reserved for billing integration. |
| `created_at` | TIMESTAMPTZ | No | `now()` UTC | Record creation timestamp. |

---

## `public."PreMeetingBriefs"` Table

```sql
CREATE TABLE public."PreMeetingBriefs" (
    id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id            UUID REFERENCES public."Users"(id) ON DELETE CASCADE,
    prospect_name      TEXT NOT NULL,
    company            TEXT NOT NULL,
    role               TEXT,
    meeting_type       TEXT DEFAULT 'Discovery Call',
    meeting_datetime   TIMESTAMP WITH TIME ZONE,
    additional_context TEXT,
    generated_brief    JSONB,
    status             TEXT DEFAULT 'generating',
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

### Column Reference

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | No | `uuid_generate_v4()` | Auto-generated UUID primary key. |
| `user_id` | UUID | Yes | — | FK to `Users.id`. Cascade deletes. |
| `prospect_name` | TEXT | No | — | Target contact name. |
| `company` | TEXT | No | — | Target company name. Used as primary Gemini prompt input. |
| `role` | TEXT | Yes | — | Prospect's job title / role. |
| `meeting_type` | TEXT | Yes | `'Discovery Call'` | Type of meeting (e.g. Discovery Call, Demo, QBR). |
| `meeting_datetime` | TIMESTAMPTZ | Yes | — | Scheduled meeting time (ISO 8601). |
| `additional_context` | TEXT | Yes | — | Free-form context for Gemini prompt. |
| `generated_brief` | JSONB | Yes | — | Full Gemini-generated brief (13-field JSON object). See [GEMINI_INTEGRATION.md](GEMINI_INTEGRATION.md) for schema. |
| `status` | TEXT | Yes | `'generating'` | Brief lifecycle: `generating` → `completed`. |
| `created_at` | TIMESTAMPTZ | No | `now()` UTC | Record creation timestamp. |

### ⚠️ Missing Column

The `generate-brief` edge function writes `generation_time_ms` (integer, milliseconds) to this table, but this column is **not defined in the current `schema.sql`**.

**Fix:**
```sql
ALTER TABLE public."PreMeetingBriefs" 
ADD COLUMN generation_time_ms INTEGER;
```

Add this to `schema.sql` and run on all environments.

---

## Row-Level Security (RLS)

RLS is enabled on both tables. All access requires an authenticated Supabase JWT.

### `public."Users"` Policies

```sql
-- Read own profile
CREATE POLICY "Users can view own profile" ON public."Users"
    FOR SELECT USING (auth.uid() = id);

-- Update own profile
CREATE POLICY "Users can update own profile" ON public."Users"
    FOR UPDATE USING (auth.uid() = id);
```

> **Note:** There is no INSERT policy on `Users`. Inserts are performed by the application using the service role or via the DB abstraction layer in `src/db.js`. Ensure the insert user has sufficient privileges.

### `public."PreMeetingBriefs"` Policies

```sql
-- Read own briefs
CREATE POLICY "Users can view own briefs" ON public."PreMeetingBriefs"
    FOR SELECT USING (auth.uid() = user_id);

-- Create own briefs (via edge function with user JWT)
CREATE POLICY "Users can insert own briefs" ON public."PreMeetingBriefs"
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Update own briefs
CREATE POLICY "Users can update own briefs" ON public."PreMeetingBriefs"
    FOR UPDATE USING (auth.uid() = user_id);

-- Delete own briefs
CREATE POLICY "Users can delete own briefs" ON public."PreMeetingBriefs"
    FOR DELETE USING (auth.uid() = user_id);
```

---

## Applying the Schema

### First-Time Setup (Production)

1. Open the Supabase Dashboard → SQL Editor
2. Paste and run the contents of `schema.sql`
3. Apply the missing column fix:
   ```sql
   ALTER TABLE public."PreMeetingBriefs" ADD COLUMN generation_time_ms INTEGER;
   ```

### Local Development

```bash
# Reset local database and apply all migrations
supabase db reset

# Or apply manually
psql -h localhost -p 54322 -U postgres -d postgres -f schema.sql
```

### Inspecting the Schema

```bash
# Via psql
psql -h localhost -p 54322 -U postgres -d postgres
\dt public.*          -- list tables
\d "public"."Users"   -- describe Users table
\d "public"."PreMeetingBriefs"  -- describe Briefs table
```

Or use **Supabase Studio** at `http://127.0.0.1:54323` → Table Editor.

---

## Indexes

No custom indexes are defined in v0.1. Consider adding for performance at scale:

```sql
-- Speed up brief list queries per user
CREATE INDEX idx_briefs_user_id_created_at 
ON public."PreMeetingBriefs" (user_id, created_at DESC);

-- Speed up user email lookups
CREATE INDEX idx_users_email ON public."Users" (email);
```

---

## Data Retention

No automated data retention or archival policy is configured in v0.1. All data persists indefinitely. Plan for GDPR/data-deletion compliance before production launch.
