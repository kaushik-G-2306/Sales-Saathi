/**
 * metrics.ts — Sales Saathi
 * ────────────────────────────
 * Tracks and persists AI agent success metrics per the project definition:
 *
 *   1. DATA ACCURACY    — fraction of expected output fields that are
 *                         non-empty and schema-compliant after guardrails pass.
 *
 *   2. TIME SAVED       — estimated minutes saved per meeting vs. manual prep
 *                         baseline (45 minutes, per user research with SDRs).
 *
 *   3. GENERATION TIME  — wall-clock latency of each AI call (ms).
 *
 *   4. FIELD COVERAGE   — per-field completeness across all generated briefs,
 *                         used to identify which sections Gemini under-fills.
 *
 * HOW TO USE
 * ────────────────────────────
 *
 *   // 1. Start a timer before the AI call
 *   const timer = MetricsTimer.start("generate_brief");
 *
 *   // 2. Run the AI call (enrich / brief / outreach)
 *   const result = await callGemini(...);
 *
 *   // 3. After validation, record the metric
 *   const metric = timer.stop();
 *   const accuracy = computeAccuracy(validatedBrief);
 *   await recordMetric(supabaseClient, {
 *     userId, company, functionName: "generate_brief",
 *     ...metric, ...accuracy
 *   });
 *
 * Metrics are written to the `ai_metrics` table in Supabase (schema below).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimingResult {
  durationMs: number;
  startedAt: string; // ISO timestamp
  completedAt: string; // ISO timestamp
}

export interface AccuracyResult {
  /** Fraction of expected output fields that are non-empty (0.0 – 1.0). */
  dataAccuracyScore: number;
  /** Number of fields populated. */
  filledFields: number;
  /** Total expected fields for this function. */
  totalFields: number;
  /** List of field names that were empty or missing. */
  emptyFields: string[];
}

export interface MetricRecord {
  userId: string;
  company: string;
  functionName: "enrich_prospect" | "generate_brief" | "generate_outreach";
  durationMs: number;
  startedAt: string;
  completedAt: string;
  dataAccuracyScore: number;
  filledFields: number;
  totalFields: number;
  emptyFields: string[];
  /** Estimated minutes saved vs. 45-min manual baseline (computed below). */
  minutesSaved: number;
  /** True if the output passed all guardrail checks. */
  guardrailsPassed: boolean;
}

// ─── Baseline Constants ───────────────────────────────────────────────────────
// From Sales Saathi user research: SDRs spend 30-45 min preparing manually.

const MANUAL_PREP_MINUTES = 45; // validated via Apollo.io churn interviews
const AI_OVERHEAD_BUFFER_MINUTES = 2; // account for reading + copy time

/**
 * Estimates time saved for a single brief generation.
 * time_saved = manual_prep_baseline - (ai_duration_in_minutes + overhead)
 */
export function computeTimeSaved(durationMs: number): number {
  const aiMinutes = durationMs / 60_000;
  const saved = MANUAL_PREP_MINUTES - (aiMinutes + AI_OVERHEAD_BUFFER_MINUTES);
  return parseFloat(Math.max(saved, 0).toFixed(1));
}

// ─── MetricsTimer ─────────────────────────────────────────────────────────────

export class MetricsTimer {
  private startTime: number;
  private startedAt: string;
  private functionName: string;

  private constructor(functionName: string) {
    this.startTime = Date.now();
    this.startedAt = new Date().toISOString();
    this.functionName = functionName;
  }

  static start(functionName: string): MetricsTimer {
    return new MetricsTimer(functionName);
  }

  stop(): TimingResult {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - this.startTime;
    console.log(
      JSON.stringify({
        event: "AI_CALL_COMPLETE",
        function: this.functionName,
        durationMs,
        timestamp: completedAt,
      })
    );
    return { durationMs, startedAt: this.startedAt, completedAt };
  }
}

// ─── Accuracy Computation ─────────────────────────────────────────────────────

// Expected fields per function, used to compute data accuracy score.
const EXPECTED_FIELDS: Record<string, string[]> = {
  enrich_prospect: ["company_overview", "buying_signals", "business_events"],
  generate_brief: [
    "executive_summary",
    "stakeholder_analysis",
    "pain_points",
    "discovery_questions",
    "objection_handling",
    "meeting_strategy",
    "icebreakers",
  ],
  generate_outreach: [
    "cold_email_subject",
    "cold_email_body",
    "linkedin_connection_request",
    "linkedin_message",
    "followup_email",
  ],
};

/**
 * Computes data accuracy for a validated AI output object.
 *
 * A field is considered "filled" if:
 *   - For strings: non-empty after trim
 *   - For arrays:  length > 0
 *   - For objects: at least one key-value pair
 */
export function computeAccuracy(
  output: Record<string, unknown>,
  functionName: string
): AccuracyResult {
  const expected = EXPECTED_FIELDS[functionName] ?? [];
  const emptyFields: string[] = [];

  for (const field of expected) {
    const value = output[field];
    if (value === undefined || value === null) {
      emptyFields.push(field);
    } else if (typeof value === "string" && value.trim() === "") {
      emptyFields.push(field);
    } else if (Array.isArray(value) && value.length === 0) {
      emptyFields.push(field);
    } else if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as object).length === 0
    ) {
      emptyFields.push(field);
    }
  }

  const filledFields = expected.length - emptyFields.length;
  const dataAccuracyScore = expected.length > 0
    ? parseFloat((filledFields / expected.length).toFixed(2))
    : 1.0;

  return {
    dataAccuracyScore,
    filledFields,
    totalFields: expected.length,
    emptyFields,
  };
}

// ─── Metric Persistence ───────────────────────────────────────────────────────

/**
 * Writes a metric record to the `ai_metrics` Supabase table.
 *
 * The Supabase client is passed in (not imported here) to keep this
 * module dependency-free and easily testable.
 *
 * Expected table schema (run in Supabase SQL editor):
 *
 *   CREATE TABLE ai_metrics (
 *     id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *     user_id             text NOT NULL,
 *     company             text NOT NULL,
 *     function_name       text NOT NULL,
 *     duration_ms         integer NOT NULL,
 *     started_at          timestamptz NOT NULL,
 *     completed_at        timestamptz NOT NULL,
 *     data_accuracy_score numeric(4,2) NOT NULL,
 *     filled_fields       integer NOT NULL,
 *     total_fields        integer NOT NULL,
 *     empty_fields        text[] NOT NULL,
 *     minutes_saved       numeric(5,1) NOT NULL,
 *     guardrails_passed   boolean NOT NULL,
 *     created_at          timestamptz DEFAULT now()
 *   );
 *
 *   -- Row-level security: only service role can insert
 *   ALTER TABLE ai_metrics ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "service_insert_only" ON ai_metrics
 *     FOR INSERT TO service_role USING (true);
 */
export async function recordMetric(
  // deno-lint-ignore no-explicit-any
  supabaseClient: any,
  record: MetricRecord
): Promise<void> {
  const { error } = await supabaseClient.from("ai_metrics").insert({
    user_id: record.userId,
    company: record.company,
    function_name: record.functionName,
    duration_ms: record.durationMs,
    started_at: record.startedAt,
    completed_at: record.completedAt,
    data_accuracy_score: record.dataAccuracyScore,
    filled_fields: record.filledFields,
    total_fields: record.totalFields,
    empty_fields: record.emptyFields,
    minutes_saved: record.minutesSaved,
    guardrails_passed: record.guardrailsPassed,
  });

  if (error) {
    // Non-fatal — log the failure but don't break the main response flow
    console.error(
      JSON.stringify({
        event: "METRIC_RECORD_FAILED",
        error_message: error.message,
        function_name: record.functionName,
        timestamp: new Date().toISOString(),
      })
    );
  }
}

// ─── Aggregate Reporting Helpers ──────────────────────────────────────────────

/**
 * Fetches summary statistics for display in an admin or settings dashboard.
 * Returns null if the query fails.
 */
export async function fetchMetricsSummary(
  // deno-lint-ignore no-explicit-any
  supabaseClient: any,
  userId?: string
): Promise<{
  avgAccuracy: number;
  avgTimeSaved: number;
  totalBriefs: number;
  avgDurationMs: number;
} | null> {
  let query = supabaseClient
    .from("ai_metrics")
    .select("data_accuracy_score, minutes_saved, duration_ms")
    .eq("function_name", "generate_brief")
    .eq("guardrails_passed", true);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) return null;

  const totalBriefs = data.length;
  const avgAccuracy =
    data.reduce((sum: number, r: { data_accuracy_score: number }) => sum + r.data_accuracy_score, 0) /
    totalBriefs;
  const avgTimeSaved =
    data.reduce((sum: number, r: { minutes_saved: number }) => sum + r.minutes_saved, 0) /
    totalBriefs;
  const avgDurationMs =
    data.reduce((sum: number, r: { duration_ms: number }) => sum + r.duration_ms, 0) /
    totalBriefs;

  return {
    avgAccuracy: parseFloat(avgAccuracy.toFixed(2)),
    avgTimeSaved: parseFloat(avgTimeSaved.toFixed(1)),
    totalBriefs,
    avgDurationMs: Math.round(avgDurationMs),
  };
}
