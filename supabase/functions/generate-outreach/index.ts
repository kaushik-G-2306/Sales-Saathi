/**
 * generate-outreach/index.ts — Sales Saathi
 * ───────────────────────────────────────────
 * Deno Edge Function: Personalised Outreach Sequence generation
 *
 * Refactored to use the shared security modules:
 *   env-config  → loadEnvConfig() at cold-start
 *   guardrails  → validateProspectInput, checkRateLimit, filterOutput, validateOutreachOutput
 *   prompt-templates → buildGenerateOutreachPrompt
 *   metrics     → MetricsTimer, computeAccuracy, computeTimeSaved, recordMetric
 *
 * REQUEST  POST /functions/v1/generate-outreach
 * BODY     { brief_id, sender_name?, sender_role? }
 * HEADERS  Authorization: Bearer <jwt>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadEnvConfig, safeLog, safeError } from "../_shared/env-config.ts";
import {
  validateProspectInput,
  checkRateLimit,
  filterOutput,
  validateOutreachOutput,
} from "../_shared/guardrails.ts";
import { buildGenerateOutreachPrompt } from "../_shared/prompt-templates.ts";
import {
  MetricsTimer,
  computeAccuracy,
  computeTimeSaved,
  recordMetric,
} from "../_shared/metrics.ts";
import { corsHeaders } from "../_shared/cors.ts";

// ─── Cold-start: validate env keys once ──────────────────────────────────────
const env = loadEnvConfig();

const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${env.geminiApiKey}`;

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // ── CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth: extract user from JWT ───────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GUARDRAIL: Rate limit ─────────────────────────────────────────────────
    const rateCheck = checkRateLimit(user.id);
    if (!rateCheck.ok) {
      return new Response(JSON.stringify({ error: rateCheck.reason }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse and validate request body ──────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = body as Record<string, unknown>;
    const brief_id = rawBody.brief_id;
    const senderName = String(rawBody.sender_name ?? "Sales Rep");
    const senderRole = String(rawBody.sender_role ?? "Account Executive");

    if (!brief_id) {
      return new Response(JSON.stringify({ error: "Missing required field: brief_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch PreMeetingBrief ────────────────────────────────────────────────
    const { data: brief, error: briefError } = await supabase
      .from("PreMeetingBriefs")
      .select("*")
      .eq("id", brief_id)
      .single();

    if (briefError || !brief) {
      return new Response(
        JSON.stringify({ error: briefError ? `Failed to fetch brief: ${briefError.message}` : "Brief not found" }),
        {
          status: briefError ? 500 : 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { prospect_name, company, role, meeting_type, generated_brief, enrichment_data } = brief;

    // ── GUARDRAIL: Input validation on brief data ────────────────────────────
    const mappedBriefInput = {
      companyName: company,
      prospectName: prospect_name,
      meetingContext: role ?? "",
    };

    const inputCheck = validateProspectInput(mappedBriefInput);
    if (!inputCheck.ok) {
      safeLog("input_rejected", { userId: user.id, reason: inputCheck.reason });
      return new Response(JSON.stringify({ error: inputCheck.reason }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { companyName, prospectName } = inputCheck.value!;

    // ── Build brief summary for prompt context ───────────────────────────────
    const briefSummary = generated_brief
      ? `Executive Summary: ${generated_brief.executive_summary ?? "N/A"}\n` +
      `Pain Points: ${(generated_brief.likely_pain_points ?? generated_brief.pain_points ?? []).join(", ")}\n` +
      `Meeting Type: ${meeting_type ?? "N/A"}\n` +
      `Enrichment: ${enrichment_data ? JSON.stringify(enrichment_data) : "No enrichment data available."}`
      : "No brief data available.";

    // ── Build engineered prompt ───────────────────────────────────────────────
    const { systemPrompt, userPrompt, temperature } = buildGenerateOutreachPrompt({
      companyName,
      prospectName,
      briefSummary,
      senderName,
      senderRole,
    });

    // ── METRICS: Start timer before AI call ──────────────────────────────────
    const timer = MetricsTimer.start("generate_outreach");

    // ── Gemini call ──────────────────────────────────────────────────────────
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
            response_mime_type: "application/json",
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
      return new Response(
        JSON.stringify({ error: "AI service unavailable. Please retry." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const timing = timer.stop();

    // ── GUARDRAIL: Output content filter ──────────────────────────────────────
    const contentCheck = filterOutput(rawText);
    if (!contentCheck.ok) {
      safeLog("output_blocked", {
        userId: user.id,
        company: companyName,
        reason: contentCheck.reason,
      });
      await recordMetric(supabase, {
        userId: user.id,
        company: companyName,
        functionName: "generate_outreach",
        ...timing,
        dataAccuracyScore: 0,
        filledFields: 0,
        totalFields: 5,
        emptyFields: [],
        minutesSaved: 0,
        guardrailsPassed: false,
      });
      return new Response(JSON.stringify({ error: contentCheck.reason }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GUARDRAIL: Schema validation ──────────────────────────────────────────
    const schemaCheck = validateOutreachOutput(contentCheck.value!);
    if (!schemaCheck.ok) {
      safeLog("schema_invalid", {
        userId: user.id,
        company: companyName,
        reason: schemaCheck.reason,
      });
      await recordMetric(supabase, {
        userId: user.id,
        company: companyName,
        functionName: "generate_outreach",
        ...timing,
        dataAccuracyScore: 0,
        filledFields: 0,
        totalFields: 5,
        emptyFields: [],
        minutesSaved: 0,
        guardrailsPassed: false,
      });
      return new Response(JSON.stringify({ error: schemaCheck.reason }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const outreach = schemaCheck.value!;

    // ── METRICS: Record accuracy and time saved ──────────────────────────────
    const accuracy = computeAccuracy(
      outreach as unknown as Record<string, unknown>,
      "generate_outreach"
    );
    const minutesSaved = computeTimeSaved(timing.durationMs);

    await recordMetric(supabase, {
      userId: user.id,
      company: companyName,
      functionName: "generate_outreach",
      ...timing,
      ...accuracy,
      minutesSaved,
      guardrailsPassed: true,
    });

    // ── Store output into OutreachMessages ────────────────────────────────────
    let outreachId = null;
    let dbInsertError = null;

    const personalizationLevel = enrichment_data ? "High" : "Standard";

    const { data: insertData, error: insertError } = await supabase
      .from("OutreachMessages")
      .insert({
        user_id: user.id,
        brief_id: brief_id,
        prospect_name: prospectName,
        company: companyName,
        role: role,
        subject_line: outreach.cold_email_subject,
        cold_email: outreach.cold_email_body,
        linkedin_request: outreach.linkedin_connection_request,
        linkedin_message: outreach.linkedin_message,
        followup_email: outreach.followup_email,
        followup_linkedin: "",
        personalization_level: personalizationLevel,
        model_used: "gemini-2.5-flash-lite",
        generation_time_ms: timing.durationMs,
      })
      .select("id")
      .single();

    if (insertError) {
      safeError("db_insert_failed", insertError, {
        userId: user.id,
        company: companyName,
      });
      dbInsertError = insertError.message;
    } else {
      outreachId = insertData.id;
    }

    safeLog("outreach_generated", {
      userId: user.id,
      company: companyName,
      durationMs: timing.durationMs,
      dataAccuracyScore: accuracy.dataAccuracyScore,
      minutesSaved,
    });

    return new Response(
      JSON.stringify({
        status: "success",
        outreach_id: outreachId,
        data: outreach,
        metrics: { accuracy, minutesSaved },
        db_error: dbInsertError || undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    safeError("generate_outreach_error", error, {});
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
