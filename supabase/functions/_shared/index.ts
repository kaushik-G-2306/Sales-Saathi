/**
 * generate-brief/index.ts — Sales Saathi
 * ────────────────────────────────────────
 * Deno Edge Function: Pre-Meeting Brief generation
 *
 * This file shows exactly how to wire the three shared modules together
 * (env-config, guardrails, prompt-templates, metrics) in a single
 * Edge Function handler. The same pattern applies to enrich-prospect
 * and generate-outreach.
 *
 * REQUEST  POST /functions/v1/generate-brief
 * BODY     { companyName, prospectName, meetingContext, enrichmentSummary }
 * HEADERS  Authorization: Bearer <supabase_anon_key>   (handled by Supabase)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadEnvConfig, safeLog, safeError } from "../_shared/env-config.ts";
import {
  validateProspectInput,
  checkRateLimit,
  filterOutput,
  validateBriefOutput,
} from "../_shared/guardrails.ts";
import { buildGenerateBriefPrompt } from "../_shared/prompt-templates.ts";
import {
  MetricsTimer,
  computeAccuracy,
  computeTimeSaved,
  recordMetric,
} from "../_shared/metrics.ts";

// ─── Cold-start: validate env keys once ──────────────────────────────────────
const env = loadEnvConfig();

const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${env.geminiApiKey}`;

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // ── Auth: extract user from JWT (Supabase handles verification)
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // ── GUARDRAIL: Rate limit ─────────────────────────────────────────────────
  const rateCheck = checkRateLimit(user.id);
  if (!rateCheck.ok) {
    return new Response(JSON.stringify({ error: rateCheck.reason }), { status: 429 });
  }

  // ── GUARDRAIL: Input validation + sanitisation ────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), { status: 400 });
  }

  const inputCheck = validateProspectInput(body);
  if (!inputCheck.ok) {
    safeLog("input_rejected", { userId: user.id, reason: inputCheck.reason });
    return new Response(JSON.stringify({ error: inputCheck.reason }), { status: 400 });
  }

  const { companyName, prospectName, meetingContext } = inputCheck.value!;
  const enrichmentSummary = String((body as Record<string, unknown>).enrichmentSummary ?? "");

  // ── Build engineered prompt ───────────────────────────────────────────────
  const { systemPrompt, userPrompt, temperature } = buildGenerateBriefPrompt({
    companyName,
    prospectName,
    meetingContext,
    enrichmentSummary,
  });

  // ── METRICS: Start timer before AI call ───────────────────────────────────
  const timer = MetricsTimer.start("generate_brief");

  // ── Gemini call ───────────────────────────────────────────────────────────
  let rawText: string;
  try {
    const geminiRes = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature,
          response_mime_type: "application/json", // enforce JSON mode in Gemini
        },
      }),
    });

    if (!geminiRes.ok) {
      throw new Error(`Gemini returned status ${geminiRes.status}`);
    }

    const geminiJson = await geminiRes.json();
    rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } catch (err) {
    safeError("gemini_call_failed", err, { userId: user.id, company: companyName });
    return new Response(JSON.stringify({ error: "AI service unavailable. Please retry." }), {
      status: 502,
    });
  }

  const timing = timer.stop();

  // ── GUARDRAIL: Output content filter ─────────────────────────────────────
  const contentCheck = filterOutput(rawText);
  if (!contentCheck.ok) {
    safeLog("output_blocked", { userId: user.id, company: companyName, reason: contentCheck.reason });
    await recordMetric(supabase, {
      userId: user.id, company: companyName, functionName: "generate_brief",
      ...timing,
      dataAccuracyScore: 0, filledFields: 0, totalFields: 7, emptyFields: [],
      minutesSaved: 0, guardrailsPassed: false,
    });
    return new Response(JSON.stringify({ error: contentCheck.reason }), { status: 422 });
  }

  // ── GUARDRAIL: Schema validation ──────────────────────────────────────────
  const schemaCheck = validateBriefOutput(contentCheck.value!);
  if (!schemaCheck.ok) {
    safeLog("schema_invalid", { userId: user.id, company: companyName, reason: schemaCheck.reason });
    return new Response(JSON.stringify({ error: schemaCheck.reason }), { status: 422 });
  }

  const brief = schemaCheck.value!;

  // ── METRICS: Record accuracy and time saved ───────────────────────────────
  const accuracy = computeAccuracy(brief as unknown as Record<string, unknown>, "generate_brief");
  const minutesSaved = computeTimeSaved(timing.durationMs);

  await recordMetric(supabase, {
    userId: user.id,
    company: companyName,
    functionName: "generate_brief",
    ...timing,
    ...accuracy,
    minutesSaved,
    guardrailsPassed: true,
  });

  safeLog("brief_generated", {
    userId: user.id,
    company: companyName,
    durationMs: timing.durationMs,
    dataAccuracyScore: accuracy.dataAccuracyScore,
    minutesSaved,
  });

  return new Response(JSON.stringify({ brief, metrics: { accuracy, minutesSaved } }), {
    headers: { "Content-Type": "application/json" },
  });
});
