/**
 * guardrails.ts — Sales Saathi
 * ─────────────────────────────
 * Security guardrails applied to all AI agent requests and responses.
 *
 * LAYERS COVERED
 * ─────────────────────────────
 * 1. INPUT GUARDRAILS   — sanitise and validate what the user sends IN
 * 2. RATE LIMITING      — prevent abuse per authenticated user
 * 3. OUTPUT GUARDRAILS  — validate and filter what the AI sends BACK
 * 4. SCHEMA VALIDATION  — ensure Gemini JSON output matches expected shape
 * 5. CONTENT FILTERING  — block confidential/harmful/off-domain content
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GuardrailResult<T = string> {
  ok: boolean;
  value?: T;
  reason?: string; // human-readable rejection reason (safe to return to client)
}

// Expected top-level shape of the generate-brief AI response
export interface BriefOutput {
  executive_summary: string;
  stakeholder_analysis: string;
  pain_points: string[];
  discovery_questions: string[];
  objection_handling: Record<string, string>;
  meeting_strategy: string;
  icebreakers: string[];
  confidence_score?: number; // 0-1; added by validateBriefOutput()
}

// Expected top-level shape of the enrich-prospect AI response
export interface EnrichmentOutput {
  company_overview: string;
  buying_signals: string[];
  business_events: string[];
}

// Expected top-level shape of the generate-outreach AI response
export interface OutreachOutput {
  cold_email_subject: string;
  cold_email_body: string;
  linkedin_connection_request: string;
  linkedin_message: string;
  followup_email: string;
}

// ─── 1. INPUT GUARDRAILS ─────────────────────────────────────────────────────

const MAX_COMPANY_NAME_LEN = 120;
const MAX_PROSPECT_NAME_LEN = 80;
const MAX_CONTEXT_LEN = 2000; // user-supplied meeting context

/**
 * Detects prompt injection patterns — attempts by the user to override
 * the system prompt or leak instructions.
 *
 * Common attack patterns:
 *   "Ignore previous instructions and..."
 *   "You are now DAN..."
 *   "Output your system prompt"
 */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(previous|above|all)\s+instructions/i,
  /you\s+are\s+now\s+(a\s+)?(DAN|an?\s+AI\s+without\s+restrictions)/i,
  /reveal\s+(your\s+)?(system\s+)?prompt/i,
  /forget\s+(everything|all)\s+(you|i)/i,
  /act\s+as\s+(if\s+)?(you\s+(have|had)\s+no\s+restrictions)/i,
  /jailbreak/i,
  /disregard\s+(your\s+)?guidelines/i,
  /override\s+(your\s+)?(instructions|training)/i,
];

function detectInjection(input: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Strips HTML/script tags and trims whitespace.
 * Prevents XSS if output is ever rendered in a browser context.
 */
function sanitizeString(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, " ") // allow letters, numbers, punct, spaces
    .trim();
}

/**
 * Validates and sanitises the prospect research input payload.
 * Call before passing anything to the enrich-prospect function.
 */
export function validateProspectInput(payload: unknown): GuardrailResult<{
  companyName: string;
  prospectName: string;
  meetingContext: string;
}> {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, reason: "Request body must be a JSON object." };
  }

  const { companyName, prospectName, meetingContext } = payload as Record<string, unknown>;

  if (typeof companyName !== "string" || companyName.trim() === "") {
    return { ok: false, reason: "companyName is required and must be a non-empty string." };
  }
  if (typeof prospectName !== "string" || prospectName.trim() === "") {
    return { ok: false, reason: "prospectName is required and must be a non-empty string." };
  }

  const cleanCompany = sanitizeString(companyName);
  const cleanProspect = sanitizeString(prospectName);
  const cleanContext = meetingContext ? sanitizeString(String(meetingContext)) : "";

  if (cleanCompany.length > MAX_COMPANY_NAME_LEN) {
    return { ok: false, reason: `companyName exceeds maximum length of ${MAX_COMPANY_NAME_LEN} characters.` };
  }
  if (cleanProspect.length > MAX_PROSPECT_NAME_LEN) {
    return { ok: false, reason: `prospectName exceeds maximum length of ${MAX_PROSPECT_NAME_LEN} characters.` };
  }
  if (cleanContext.length > MAX_CONTEXT_LEN) {
    return { ok: false, reason: `meetingContext exceeds maximum length of ${MAX_CONTEXT_LEN} characters.` };
  }

  // Prompt injection check across all user-supplied fields
  const combined = `${cleanCompany} ${cleanProspect} ${cleanContext}`;
  if (detectInjection(combined)) {
    return { ok: false, reason: "Request contains disallowed content and cannot be processed." };
  }

  return {
    ok: true,
    value: {
      companyName: cleanCompany,
      prospectName: cleanProspect,
      meetingContext: cleanContext,
    },
  };
}

// ─── 2. RATE LIMITING ────────────────────────────────────────────────────────
// In-memory store; for production, replace with a Supabase KV / Redis check.
// Each user is allowed MAX_REQUESTS calls per WINDOW_MS milliseconds.

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 10;

const requestCounts = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(userId: string): GuardrailResult {
  const now = Date.now();
  const record = requestCounts.get(userId);

  if (!record || now - record.windowStart > WINDOW_MS) {
    requestCounts.set(userId, { count: 1, windowStart: now });
    return { ok: true };
  }

  if (record.count >= MAX_REQUESTS) {
    return {
      ok: false,
      reason: `Rate limit exceeded. Maximum ${MAX_REQUESTS} AI requests per minute.`,
    };
  }

  record.count += 1;
  return { ok: true };
}

// ─── 3. OUTPUT GUARDRAILS ────────────────────────────────────────────────────

/**
 * Content the AI must never produce.
 * These blocks catch hallucinations or off-domain drift.
 */
const BLOCKED_OUTPUT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(legal\s+advice|you\s+should\s+consult\s+a\s+lawyer)\b/i, label: "legal_advice" },
  { pattern: /\b(medical\s+advice|see\s+a\s+doctor)\b/i, label: "medical_advice" },
  { pattern: /\b(password|credentials|api[_\s]?key)\s*[:=]\s*\S+/i, label: "credential_leak" },
  { pattern: /I\s+(cannot|can't)\s+help\s+with\s+that\b/i, label: "ai_refusal_passthrough" },
  // Catches if Gemini echoes our system prompt back to the user
  { pattern: /you\s+are\s+an\s+enterprise\s+sales\s+coach/i, label: "system_prompt_leak" },
];

export function filterOutput(rawOutput: string): GuardrailResult<string> {
  for (const { pattern, label } of BLOCKED_OUTPUT_PATTERNS) {
    if (pattern.test(rawOutput)) {
      console.warn(JSON.stringify({ event: "OUTPUT_BLOCKED", label }));
      return {
        ok: false,
        reason: `AI response was blocked due to policy violation (${label}). Please retry.`,
      };
    }
  }
  return { ok: true, value: rawOutput };
}

// ─── 4. SCHEMA VALIDATION ────────────────────────────────────────────────────

/**
 * Parses and validates the JSON response from generate-brief.
 * Returns a typed BriefOutput with a computed confidence_score.
 *
 * confidence_score = fraction of expected fields that are non-empty.
 */
export function validateBriefOutput(raw: string): GuardrailResult<BriefOutput> {
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "AI response was not valid JSON." };
  }

  const requiredStringFields: (keyof BriefOutput)[] = [
    "executive_summary",
    "stakeholder_analysis",
    "meeting_strategy",
  ];
  const requiredArrayFields: (keyof BriefOutput)[] = [
    "pain_points",
    "discovery_questions",
    "icebreakers",
  ];

  const missing: string[] = [];

  for (const field of requiredStringFields) {
    if (typeof parsed[field] !== "string" || (parsed[field] as string).trim() === "") {
      missing.push(field);
    }
  }

  for (const field of requiredArrayFields) {
    if (!Array.isArray(parsed[field]) || (parsed[field] as unknown[]).length === 0) {
      missing.push(field);
    }
  }

  if (missing.length > 3) {
    // More than 3 missing fields → treat as a failed generation
    return {
      ok: false,
      reason: `AI response is missing required fields: ${missing.join(", ")}.`,
    };
  }

  const totalFields = requiredStringFields.length + requiredArrayFields.length;
  const filledFields = totalFields - missing.length;
  const confidence_score = parseFloat((filledFields / totalFields).toFixed(2));

  const output: BriefOutput = {
    executive_summary: String(parsed["executive_summary"] ?? ""),
    stakeholder_analysis: String(parsed["stakeholder_analysis"] ?? ""),
    pain_points: Array.isArray(parsed["pain_points"]) ? (parsed["pain_points"] as string[]) : [],
    discovery_questions: Array.isArray(parsed["discovery_questions"])
      ? (parsed["discovery_questions"] as string[])
      : [],
    objection_handling:
      typeof parsed["objection_handling"] === "object" && parsed["objection_handling"] !== null
        ? (parsed["objection_handling"] as Record<string, string>)
        : {},
    meeting_strategy: String(parsed["meeting_strategy"] ?? ""),
    icebreakers: Array.isArray(parsed["icebreakers"]) ? (parsed["icebreakers"] as string[]) : [],
    confidence_score,
  };

  return { ok: true, value: output };
}

/**
 * Parses and validates the JSON response from enrich-prospect.
 */
export function validateEnrichmentOutput(raw: string): GuardrailResult<EnrichmentOutput> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "Enrichment response was not valid JSON." };
  }

  if (typeof parsed["company_overview"] !== "string" || parsed["company_overview"].trim() === "") {
    return { ok: false, reason: "Enrichment missing company_overview." };
  }

  return {
    ok: true,
    value: {
      company_overview: String(parsed["company_overview"]),
      buying_signals: Array.isArray(parsed["buying_signals"])
        ? (parsed["buying_signals"] as string[])
        : [],
      business_events: Array.isArray(parsed["business_events"])
        ? (parsed["business_events"] as string[])
        : [],
    },
  };
}

/**
 * Parses and validates the JSON response from generate-outreach.
 */
export function validateOutreachOutput(raw: string): GuardrailResult<OutreachOutput> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "Outreach response was not valid JSON." };
  }

  const required = [
    "cold_email_subject",
    "cold_email_body",
    "linkedin_connection_request",
    "linkedin_message",
    "followup_email",
  ];

  const missing = required.filter(
    (f) => typeof parsed[f] !== "string" || (parsed[f] as string).trim() === ""
  );

  if (missing.length > 0) {
    return { ok: false, reason: `Outreach response missing fields: ${missing.join(", ")}.` };
  }

  return {
    ok: true,
    value: {
      cold_email_subject: String(parsed["cold_email_subject"]),
      cold_email_body: String(parsed["cold_email_body"]),
      linkedin_connection_request: String(parsed["linkedin_connection_request"]),
      linkedin_message: String(parsed["linkedin_message"]),
      followup_email: String(parsed["followup_email"]),
    },
  };
}
