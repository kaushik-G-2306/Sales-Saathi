# Edge Functions Architecture

**Sales Saathi v0.1**

---

## Overview

Sales Saathi uses a single Supabase Edge Function — **`generate-brief`** — which serves as the secure backend orchestrator for AI brief generation. It validates user identity, calls the Gemini API, and persists results to the database, all within a single serverless invocation.

Edge functions run on the **Deno 2** runtime inside Supabase's edge infrastructure.

---

## Function Inventory

| Function | Path | Purpose |
|---|---|---|
| `generate-brief` | `supabase/functions/generate-brief/index.ts` | Validates auth → calls Gemini 2.5 Flash → saves brief to Postgres |

### Shared Utilities

| File | Purpose |
|---|---|
| `supabase/functions/_shared/cors.ts` | Shared CORS headers for all functions |

---

## `generate-brief` — Deep Dive

### File
```
supabase/functions/generate-brief/index.ts
```

### Environment Variables

| Variable | Source | Description |
|---|---|---|
| `SUPABASE_URL` | Auto-injected | Supabase project REST URL |
| `SUPABASE_ANON_KEY` | Auto-injected | Supabase publishable anon key |
| `GEMINI_API_KEY` | Supabase Secret | Google AI Studio API key |
| `DEBUG_MODE` | Supabase Secret (optional) | Set `true` to enable `[DEBUG]` logs |

---

### Request Specification

**Method:** `POST`  
**Path:** `/functions/v1/generate-brief`  
**Headers:**
```
Authorization: Bearer <user-jwt>
Content-Type: application/json
```

**Body:**
```json
{
  "prospect_name": "Jane Doe",         // Required
  "company": "Acme Corp",              // Required
  "role": "VP of Sales",              // Optional
  "meeting_type": "Discovery Call",   // Optional (default: "Discovery Call")
  "meeting_datetime": "2026-06-10T14:00:00Z",  // Optional (ISO 8601)
  "additional_context": "Series B funded, evaluating CRM tools"  // Optional
}
```

**Validation:** Returns `400` if `prospect_name` or `company` are missing.

---

### Response Specification

**Success (200):**
```json
{
  "status": "success",
  "brief_id": "uuid-of-saved-brief",
  "db_error": null
}
```

**Auth Failure (401):**
```json
{
  "error": "Unauthorized: Invalid token",
  "supabase_error": "...",
  "supabase_error_code": "...",
  "supabase_error_status": 401,
  "supabase_error_details": {}
}
```

**Validation Failure (400):**
```json
{
  "error": "Missing required fields: prospect_name and company are required."
}
```

**Server Error (500):**
```json
{
  "error": "Gemini API Error: 429 - ..."
}
```

---

### Execution Flow

```
POST /functions/v1/generate-brief
        │
        ▼
[1] CORS Preflight Check
    └── OPTIONS → 200 OK with cors headers
        │
        ▼
[2] JWT Authentication
    ├── Extract Bearer token from Authorization header
    ├── Create Supabase client
    └── supabase.auth.getUser(token)
        ├── Invalid → 401 Unauthorized (with detailed error)
        └── Valid → user object obtained
        │
        ▼
[3] Authenticated Client Creation
    └── createClient(url, key, { global: { headers: { Authorization: Bearer <token> } } })
        (All subsequent DB writes carry the user's JWT → RLS policies enforced)
        │
        ▼
[4] Request Body Parsing & Validation
    ├── Parse JSON body
    ├── Validate required fields (prospect_name, company)
    └── Validate GEMINI_API_KEY is set
        │
        ▼
[5] Gemini API Call
    ├── Build system instruction (Sales Saathi persona)
    ├── Build user prompt from request fields
    ├── Define JSON response schema (13 required fields)
    ├── POST to gemini-2.5-flash:generateContent
    ├── Track generation timing (performance.now())
    └── Parse JSON from candidates[0].content.parts[0].text
        │
        ▼
[6] Database Persistence
    └── userSupabase.from('PreMeetingBriefs').insert({
            user_id, prospect_name, company, role,
            meeting_type, meeting_datetime, additional_context,
            generated_brief (JSONB), status: 'completed',
            generation_time_ms
        })
        │
        ▼
[7] Return Response
    └── { status: "success", brief_id: uuid, db_error: null|string }
```

---

### CORS Configuration

CORS headers are defined in `_shared/cors.ts`:

```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

All responses include these headers. OPTIONS preflight returns `200 OK` immediately.

> **Production hardening:** Replace `Allow-Origin: *` with your specific frontend domain(s).

---

### Mock / Local Test Mode

When `SUPABASE_URL` is empty (e.g. running without a local Supabase instance), the function accepts a special test token `Bearer TEST_VALID_JWT` for auth bypass and logs a mock DB save:

```typescript
if (supabaseUrl === '') {
  if (authHeader === 'Bearer TEST_VALID_JWT') {
    user = { id: 'mock-user-id' };
  } else {
    authError = new Error('Invalid token');
  }
}
```

This mode is for **testing the Gemini integration in isolation** without a running Supabase instance.

---

### Debug Mode

Set the `DEBUG_MODE=true` secret in Supabase to enable `[DEBUG]`-prefixed console logs:

```typescript
const DEBUG = Deno.env.get('DEBUG_MODE') === 'true';

if (DEBUG) console.log("[DEBUG] AUTH HEADER:", ...);
if (DEBUG) console.log("[DEBUG] AUTH RESULT - user:", ...);
```

Logs are visible in Supabase Dashboard → Edge Functions → Logs.

---

## Deployment

### Deploy to Production

```bash
# Authenticate CLI
supabase login

# Link to your remote project
supabase link --project-ref <your-project-ref>

# Deploy the function
supabase functions deploy generate-brief

# Set required secrets
supabase secrets set GEMINI_API_KEY=<your-gemini-key>

# Optional: enable debug logging
supabase secrets set DEBUG_MODE=true
```

### Verify Deployment

```bash
# List deployed functions
supabase functions list

# View live logs
supabase functions logs generate-brief --tail
```

### Local Development

```bash
# Serve with hot reload
supabase functions serve generate-brief --env-file .env

# Test with curl
curl -X POST http://localhost:54321/functions/v1/generate-brief \
  -H "Authorization: Bearer TEST_VALID_JWT" \
  -H "Content-Type: application/json" \
  -d '{"prospect_name":"Jane Doe","company":"Acme Corp"}'
```

---

## Dependencies

```typescript
import { serve }        from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders }  from "../_shared/cors.ts";
```

Dependencies are resolved by Deno's HTTP import system — no `package.json` or `node_modules` in edge functions.

---

## Known Issues / Notes

| # | Issue |
|---|---|
| 1 | `generation_time_ms` is inserted but not defined in `schema.sql`. Add `ALTER TABLE public."PreMeetingBriefs" ADD COLUMN generation_time_ms INTEGER;` to resolve. |
| 2 | CORS `Allow-Origin: *` is permissive — restrict to your domain in production. |
| 3 | Deno std version pinned to `0.177.0` — review for updates before next release. |
