# Gemini AI Integration

**Sales Saathi v0.1**

---

## Overview

Sales Saathi uses **Google Gemini 2.5 Flash** to generate structured, actionable pre-meeting intelligence briefs. The integration is implemented entirely within the `generate-brief` Supabase edge function and communicates with the Gemini REST API directly — no SDK dependency.

---

## Model

| Property | Value |
|---|---|
| Model | `gemini-2.5-flash` |
| API Version | `v1beta` |
| Endpoint | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` |
| Output Format | `application/json` (enforced via `response_mime_type`) |
| Auth | API key via query parameter (`?key=<GEMINI_API_KEY>`) |

**Why Gemini 2.5 Flash?**
- Low latency for real-time brief generation (target: sub-10 seconds)
- Supports `response_schema` for structured JSON output — eliminates fragile regex parsing
- Cost-effective for high-frequency per-meeting calls
- High context window for complex prospect research prompts

---

## System Instruction

The model is primed with a fixed system instruction:

```
You are Sales Saathi – Enterprise Sales Coach. Generate actionable pre-meeting 
intelligence, not generic summaries. Prioritize: buying signals, pain points, 
stakeholder analysis, discovery questions, meeting strategy. You must output 
valid JSON matching the exact schema provided.
```

This instruction enforces the Sales Saathi persona and explicitly prioritises the most valuable sales intelligence signals.

---

## User Prompt Template

```
Prospect: {prospect_name}
Company:  {company}
Role:     {role || 'N/A'}
Meeting Type: {meeting_type || 'Discovery Call'}
Meeting Date: {meeting_datetime || 'N/A'}
Context:  {additional_context || 'N/A'}
```

The prompt is intentionally minimal — Gemini is expected to perform web-knowledge synthesis based on the company name and prospect context.

---

## JSON Schema Enforcement

The Gemini API enforces the response schema at generation time via `generationConfig.response_schema`. This eliminates the need for post-processing validation.

### Full Schema

```json
{
  "type": "OBJECT",
  "properties": {
    "executive_summary":       { "type": "STRING" },
    "company_overview":        { "type": "STRING" },
    "recent_news":             { "type": "STRING" },
    "likely_pain_points":      { "type": "ARRAY", "items": { "type": "STRING" } },
    "buying_signals":          { "type": "ARRAY", "items": { "type": "STRING" } },
    "stakeholder_analysis":    { "type": "ARRAY", "items": { "type": "STRING" } },
    "recent_business_context": { "type": "STRING" },
    "discovery_questions":     { "type": "ARRAY", "items": { "type": "STRING" } },
    "conversation_starters":   { "type": "ARRAY", "items": { "type": "STRING" } },
    "objection_handling": {
      "type": "ARRAY",
      "items": {
        "type": "OBJECT",
        "properties": {
          "objection": { "type": "STRING" },
          "response":  { "type": "STRING" }
        }
      }
    },
    "recommended_pitch_angle": { "type": "STRING" },
    "meeting_strategy":        { "type": "STRING" },
    "recommended_next_steps":  { "type": "ARRAY", "items": { "type": "STRING" } }
  },
  "required": [
    "executive_summary", "company_overview", "recent_news", "likely_pain_points",
    "buying_signals", "stakeholder_analysis", "recent_business_context",
    "discovery_questions", "conversation_starters", "objection_handling",
    "recommended_pitch_angle", "meeting_strategy", "recommended_next_steps"
  ]
}
```

### Brief Field Glossary

| Field | Type | Description |
|---|---|---|
| `executive_summary` | string | 2-3 sentence brief overview for quick scan |
| `company_overview` | string | Company background, size, industry, funding |
| `recent_news` | string | Latest developments, press, strategic moves |
| `likely_pain_points` | string[] | Top 3-5 business problems this prospect likely faces |
| `buying_signals` | string[] | Indicators this company is ready to buy |
| `stakeholder_analysis` | string[] | Decision-maker profiles, influence map |
| `recent_business_context` | string | Market context, competitive landscape |
| `discovery_questions` | string[] | Targeted questions to uncover needs |
| `conversation_starters` | string[] | Ice-breakers personalised to this prospect |
| `objection_handling` | object[] | Common objections with recommended responses |
| `recommended_pitch_angle` | string | The best value proposition angle for this meeting |
| `meeting_strategy` | string | Recommended meeting flow and approach |
| `recommended_next_steps` | string[] | Action items to propose at meeting close |

---

## API Request Structure

```typescript
const geminiPayload = {
  system_instruction: { parts: { text: systemInstruction } },
  contents: [{ parts: [{ text: userPrompt }] }],
  generationConfig: {
    response_mime_type: "application/json",
    response_schema: schema
  }
};

const geminiRes = await fetch(geminiUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(geminiPayload)
});
```

---

## Response Parsing

```typescript
const geminiData = await geminiRes.json();
const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
const responsePayload = JSON.parse(generatedText);
```

Because `response_mime_type: "application/json"` is set, `generatedText` is always valid JSON. `JSON.parse` is safe and will only fail if the model returns an empty response (caught by the `if (!generatedText)` guard).

---

## Performance Tracking

Generation time is measured for each request:

```typescript
const startTime = performance.now();
const geminiRes = await fetch(geminiUrl, { ... });
const endTime = performance.now();
const generationTimeMs = Math.round(endTime - startTime);
```

`generationTimeMs` is stored in the `PreMeetingBriefs` table record for performance monitoring.

> **Note:** Add `generation_time_ms INTEGER` column to the schema to fully enable this feature. See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Gemini API returns non-2xx | `throw new Error("Gemini API Error: {status} - {body}")` → 500 to client |
| Empty candidates response | `throw new Error("Failed to extract content from Gemini response.")` → 500 to client |
| Invalid JSON from Gemini | `JSON.parse` throws → caught by outer `catch` → 500 to client |
| GEMINI_API_KEY not set | Returns 500 before calling Gemini: `"GEMINI_API_KEY is not configured."` |

---

## API Key Management

The Gemini API key is stored as a Supabase edge function secret — **never** in the frontend bundle.

```bash
# Set the key (run once per project)
supabase secrets set GEMINI_API_KEY=<your-key>

# Verify it's set
supabase secrets list
```

The key is accessed in the function via `Deno.env.get('GEMINI_API_KEY')`.

---

## Rate Limits & Quotas

Gemini 2.5 Flash limits depend on your Google AI Studio project tier. Monitor usage in the [Google AI Studio dashboard](https://aistudio.google.com/). For enterprise usage:
- Consider Vertex AI for SLA-backed quotas
- Implement retry logic with exponential backoff for 429 responses
- Cache briefs aggressively (already done via `PreMeetingBriefs` table)

---

## Future Improvements

| Improvement | Priority |
|---|---|
| Retry with backoff on 429/503 | High |
| Vertex AI migration for enterprise SLA | Medium |
| Web search grounding (Gemini with Google Search) | High |
| Streaming response for faster perceived performance | Medium |
| Prompt versioning and A/B testing | Low |
