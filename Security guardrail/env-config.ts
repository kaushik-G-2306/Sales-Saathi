/**
 * env-config.ts — Sales Saathi
 * ─────────────────────────────
 * Secure API key handling for all Deno Edge Functions.
 *
 * SECURITY PRINCIPLES
 * ─────────────────────────────
 * 1. Keys are NEVER passed from the client; all access is server-side only.
 * 2. Vite frontend env vars (VITE_*) are intentionally excluded here —
 *    anything that must stay secret must NOT carry the VITE_ prefix.
 * 3. Keys are validated on cold-start so a misconfigured deploy fails fast
 *    rather than serving partial responses.
 * 4. Logging is sanitised — key values are never written to stdout/stderr.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnvConfig {
  geminiApiKey: string;
  newsApiKey: string;
  gNewsApiKey: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
}

interface EnvRule {
  key: string;
  minLength: number;
  pattern?: RegExp; // optional format check
  description: string;
}

// ─── Validation Rules ─────────────────────────────────────────────────────────
// Each rule defines the env var name, a minimum length sanity check,
// and an optional regex pattern to catch obviously wrong values.

const ENV_RULES: EnvRule[] = [
  {
    key: "GEMINI_API_KEY",
    minLength: 30,
    description: "Google Gemini API key",
  },
  {
    key: "NEWS_API_KEY",
    minLength: 20,
    description: "NewsAPI key",
  },
  {
    key: "GNEWS_API_KEY",
    minLength: 20,
    description: "GNews API key",
  },
  {
    key: "SUPABASE_URL",
    minLength: 20,
    pattern: /^https:\/\/.+\.supabase\.co$/,
    description: "Supabase project URL",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    minLength: 100,
    description: "Supabase service role key (server-side only, never exposed to client)",
  },
];

// ─── Key Validation ───────────────────────────────────────────────────────────

/**
 * Validates that all required secrets are present and plausibly correct.
 * Throws with a safe message (no key values) on failure.
 *
 * Call once at the top of each Edge Function handler:
 *   const env = loadEnvConfig();
 */
export function loadEnvConfig(): EnvConfig {
  const errors: string[] = [];

  for (const rule of ENV_RULES) {
    const value = Deno.env.get(rule.key);

    if (!value || value.trim() === "") {
      errors.push(`${rule.key} (${rule.description}): not set`);
      continue;
    }

    if (value.length < rule.minLength) {
      errors.push(
        `${rule.key} (${rule.description}): too short (expected ≥ ${rule.minLength} chars)`
      );
      continue;
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(`${rule.key} (${rule.description}): fails format check`);
    }
  }

  if (errors.length > 0) {
    // Log the NAMES of failing keys, never their values
    console.error(
      JSON.stringify({
        event: "ENV_VALIDATION_FAILED",
        failing_keys: errors,
        timestamp: new Date().toISOString(),
      })
    );
    throw new Error(`Env validation failed for ${errors.length} key(s). Check Edge Function secrets.`);
  }

  return {
    geminiApiKey: Deno.env.get("GEMINI_API_KEY")!,
    newsApiKey: Deno.env.get("NEWS_API_KEY")!,
    gNewsApiKey: Deno.env.get("GNEWS_API_KEY")!,
    supabaseUrl: Deno.env.get("SUPABASE_URL")!,
    supabaseServiceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  };
}

// ─── Safe Logger ──────────────────────────────────────────────────────────────
// Wraps console.log. Any object key whose name contains a sensitive word
// is replaced with "[REDACTED]" before being written to logs.

const SENSITIVE_PATTERNS = ["key", "token", "secret", "password", "auth", "bearer", "api"];

function isSensitiveKey(k: string): boolean {
  return SENSITIVE_PATTERNS.some((pat) => k.toLowerCase().includes(pat));
}

function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, isSensitiveKey(k) ? "[REDACTED]" : v])
  );
}

/**
 * Structured, sanitised logger. Use in place of console.log throughout
 * all Edge Functions to ensure keys/tokens never appear in logs.
 *
 * Usage:
 *   safeLog("brief_generated", { userId, company, durationMs });
 */
export function safeLog(
  event: string,
  context: Record<string, unknown> = {}
): void {
  console.log(
    JSON.stringify({
      event,
      ...redactSensitive(context),
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * Error logger — same redaction, always writes to stderr.
 */
export function safeError(
  event: string,
  error: unknown,
  context: Record<string, unknown> = {}
): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({
      event,
      error_message: message, // message only, never a stack trace with env vars
      ...redactSensitive(context),
      timestamp: new Date().toISOString(),
    })
  );
}
