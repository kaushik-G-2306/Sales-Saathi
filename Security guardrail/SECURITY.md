# Sales Saathi — AI Security Guardrails

> **Resume statement this covers:**
> *"Set up secure API key handling and basic security guardrails for the AI agent,
> using prompt engineering to tune responses and defining success metrics such as
> data accuracy and time saved per meeting."*

---

## Architecture Overview

Security is implemented as a shared layer across all three Deno Edge Functions
(`enrich-prospect`, `generate-brief`, `generate-outreach`). Four modules live in
`supabase/functions/_shared/`:

| Module | File | Covers |
|--------|------|--------|
| Env / Key handling | `env-config.ts` | Secure API key loading, safe logging |
| Security guardrails | `guardrails.ts` | Input validation, rate limiting, output filtering, schema validation |
| Prompt engineering | `prompt-templates.ts` | Hardened system prompts, temperature strategy |
| Success metrics | `metrics.ts` | Data accuracy, time saved, latency tracking |

---

## 1. Secure API Key Handling (`env-config.ts`)

### How keys are stored
All secrets are stored in **Supabase Edge Function secrets** — the Supabase
equivalent of environment variables. They are set once via the Supabase CLI:

```bash
supabase secrets set GEMINI_API_KEY=<key>
supabase secrets set NEWS_API_KEY=<key>
supabase secrets set GNEWS_API_KEY=<key>
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<key>
```

They are **never**:
- Committed to the repository (see `.env.example` for the placeholder file)
- Prefixed with `VITE_` (which would expose them to the browser bundle)
- Logged to stdout/stderr (the `safeLog` / `safeError` functions redact any
  object key that contains "key", "token", "secret", or "password")

### Cold-start validation
`loadEnvConfig()` runs at function cold-start. If any required key is missing or
obviously malformed (too short, wrong URL format), the function throws immediately
and returns a 500 before processing any user input. This prevents silent
partial-key deployments.

### Safe logging
```typescript
safeLog("brief_generated", { userId, company, durationMs, geminiApiKey }); 
// → logs: { event, userId, company, durationMs, geminiApiKey: "[REDACTED]" }
```

---

## 2. Security Guardrails (`guardrails.ts`)

### Input guardrails
Every request through any AI function is validated before touching Gemini:

| Check | What it does |
|-------|-------------|
| Type validation | Ensures `companyName`, `prospectName` are non-empty strings |
| Length limits | Company ≤ 120 chars, Prospect ≤ 80 chars, Context ≤ 2000 chars |
| Sanitisation | Strips HTML tags and non-printable characters |
| Prompt injection detection | 8 regex patterns that catch common jailbreak phrases ("ignore previous instructions", "you are now DAN", "reveal your system prompt", etc.) |

If injection is detected, the request is rejected with a generic error message
(no detail that would help an attacker refine their attempt).

### Rate limiting
Each authenticated user is limited to **10 AI calls per minute** (in-memory;
replace with Supabase KV for multi-instance deployments). Returns HTTP 429 on
breach.

### Output guardrails
After Gemini responds, before returning anything to the client:

| Filter | Blocks |
|--------|--------|
| Legal / medical advice | Phrases like "you should consult a lawyer" |
| Credential leak | Any `key=`, `token=`, `password=` pattern in the output |
| AI refusal passthrough | "I cannot help with that" (indicates a broken prompt) |
| System prompt echo | If Gemini echoes back the system prompt text |

### Schema validation
Each function's response is validated against a strict TypeScript interface.
Fields that are empty strings or empty arrays contribute to a **confidence score**
(0.0 – 1.0). If more than 3 required fields are missing, the response is rejected
rather than returned as a partial brief.

---

## 3. Prompt Engineering (`prompt-templates.ts`)

### Structure: every prompt uses five named sections

```
[ROLE]        — narrow expert persona to reduce off-domain drift
[SCOPE]       — explicit allowed / not-allowed list
[FORMAT]      — exact JSON schema the model must follow
[GROUNDING]   — instruction to cite facts, not invent them
[REFUSAL]     — what to output if asked to break rules
```

Plus a **universal guardrail suffix** appended to all three prompts that
explicitly forbids:
- Outputting prose instead of JSON
- Following embedded instructions in user data
- Inventing funding figures or headcount
- Producing legal / medical / financial advice
- Echoing the system prompt

### Temperature strategy

| Function | Temperature | Rationale |
|----------|-------------|-----------|
| `enrich-prospect` | 0.3 | Factual extraction — accuracy over variation |
| `generate-brief` | 0.3 | Tactical analysis — must stay grounded in provided data |
| `generate-outreach` | 0.6 | Copywriting — needs natural variation, but still schema-bound |

Temperature > 0.7 is explicitly blocked as a project policy (documented in the
template file) due to increased schema-breaking and hallucination risk.

### JSON mode
All Gemini calls set `response_mime_type: "application/json"` in
`generationConfig`, which instructs Gemini to constrain its sampling to valid
JSON tokens. This is an additional structural guardrail on top of the prompt.

---

## 4. Success Metrics (`metrics.ts`)

### Data accuracy score
Computed for every AI response after guardrails pass:

```
accuracy = filled_fields / total_expected_fields
```

A "filled" field is any string with content, any array with ≥ 1 item, or any
object with ≥ 1 key. Target: **≥ 0.85** per brief.

| Function | Expected fields | Target accuracy |
|----------|----------------|-----------------|
| `enrich_prospect` | 3 | ≥ 0.85 |
| `generate_brief` | 7 | ≥ 0.85 |
| `generate_outreach` | 5 | ≥ 0.85 |

### Time saved per meeting
Based on user research conducted with B2B SDR and AE personas during the Sales
Saathi discovery phase: manual pre-meeting prep takes **30–45 minutes** per
prospect. The model uses a conservative baseline of **45 minutes**.

```
minutes_saved = 45 - (ai_generation_time_in_minutes + 2 min overhead)
```

The 2-minute overhead accounts for the time a rep takes to read and copy the
brief. At typical Gemini latencies of 3–8 seconds, the net saving is **~43
minutes per meeting**.

### Persisted in Supabase
All metrics write to an `ai_metrics` table (schema in `metrics.ts`). Row-level
security restricts inserts to the service role key only — user-facing queries
are not possible. An admin query to see platform-wide averages:

```sql
SELECT
  AVG(data_accuracy_score)  AS avg_accuracy,
  AVG(minutes_saved)         AS avg_minutes_saved,
  COUNT(*)                   AS total_briefs,
  AVG(duration_ms)           AS avg_latency_ms
FROM ai_metrics
WHERE function_name = 'generate_brief'
  AND guardrails_passed = true;
```

---

## File Map

```
supabase/
└── functions/
    ├── _shared/
    │   ├── env-config.ts       ← Secure API key handling + safe logging
    │   ├── guardrails.ts       ← Input/output security guardrails
    │   ├── prompt-templates.ts ← Engineered prompts for all 3 functions
    │   └── metrics.ts          ← Data accuracy + time-saved tracking
    ├── enrich-prospect/
    │   └── index.ts            ← Wire guardrails in (same pattern as below)
    ├── generate-brief/
    │   └── index.ts            ← Full wiring example (see file)
    └── generate-outreach/
        └── index.ts            ← Wire guardrails in (same pattern as above)
```

---

## .env.example (commit this, never the real values)

```
# Supabase project
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# AI layer
GEMINI_API_KEY=your-gemini-api-key-here

# News enrichment
NEWS_API_KEY=your-newsapi-key-here
GNEWS_API_KEY=your-gnews-key-here
```
