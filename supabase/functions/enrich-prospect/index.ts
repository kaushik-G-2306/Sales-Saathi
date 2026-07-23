/**
 * enrich-prospect/index.ts — Sales Saathi
 * ─────────────────────────────────────────
 * Deno Edge Function: Prospect Enrichment via News APIs + Gemini
 *
 * Refactored to use the shared security modules:
 *   env-config  → loadEnvConfig() at cold-start
 *   guardrails  → validateProspectInput, checkRateLimit, filterOutput, validateEnrichmentOutput
 *   prompt-templates → buildEnrichProspectPrompt
 *   metrics     → MetricsTimer, computeAccuracy, computeTimeSaved, recordMetric
 *
 * REQUEST  POST /functions/v1/enrich-prospect
 * BODY     { prospect_name, company, role, linkedin_url }
 * HEADERS  Authorization: Bearer <jwt>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadEnvConfig, safeLog, safeError } from "../_shared/env-config.ts";
import {
  validateProspectInput,
  checkRateLimit,
  filterOutput,
  validateEnrichmentOutput,
} from "../_shared/guardrails.ts";
import { buildEnrichProspectPrompt } from "../_shared/prompt-templates.ts";
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

    // ── GUARDRAIL: Input validation + sanitisation ────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map legacy field names to guardrail-expected names
    const rawBody = body as Record<string, unknown>;
    const mappedBody = {
      companyName: rawBody.company,
      prospectName: rawBody.prospect_name,
      meetingContext: rawBody.role ?? "",
    };

    const inputCheck = validateProspectInput(mappedBody);
    if (!inputCheck.ok) {
      safeLog("input_rejected", { userId: user.id, reason: inputCheck.reason });
      return new Response(JSON.stringify({ error: inputCheck.reason }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { companyName, prospectName } = inputCheck.value!;
    const role = String(rawBody.role ?? "");

    // ── Fetch from Real News APIs ─────────────────────────────────────────────
    let rawArticles: any[] = [];
    let provider = "none";

    if (env.newsApiKey) {
      try {
        const newsRes = await fetch(
          `https://newsapi.org/v2/everything?q="${encodeURIComponent(companyName)}"&sortBy=publishedAt&language=en&pageSize=5&apiKey=${env.newsApiKey}`
        );
        const newsData = await newsRes.json();
        if (newsData.status === "ok" && newsData.articles?.length > 0) {
          rawArticles = newsData.articles;
          provider = "newsapi";
        }
      } catch (e) {
        safeError("newsapi_fetch_failed", e, { company: companyName });
      }
    }

    if (rawArticles.length === 0 && env.gNewsApiKey) {
      try {
        const gnewsRes = await fetch(
          `https://gnews.io/api/v4/search?q="${encodeURIComponent(companyName)}"&lang=en&max=5&apikey=${env.gNewsApiKey}`
        );
        const gnewsData = await gnewsRes.json();
        if (gnewsData.articles?.length > 0) {
          rawArticles = gnewsData.articles;
          provider = "gnews";
        }
      } catch (e) {
        safeError("gnews_fetch_failed", e, { company: companyName });
      }
    }

    safeLog("news_fetched", { company: companyName, count: rawArticles.length, provider });

    // Map articles to structured format preserving original source and URL
    const recent_news = rawArticles.slice(0, 5).map((article: any) => {
      let sourceName = "Unknown Source";
      if (provider === "newsapi") sourceName = article.source?.name || "Unknown";
      if (provider === "gnews") sourceName = article.source?.name || "Unknown";

      return {
        title: article.title || "Untitled",
        source: sourceName,
        url: article.url || "#",
        published_at: article.publishedAt || new Date().toISOString(),
        summary: article.description || article.content || "No summary available.",
      };
    });

    // Format news articles as text for the prompt template
    const rawNewsArticles = recent_news
      .map(
        (n: any) =>
          `- Title: ${n.title}\n  Source: ${n.source}\n  Date: ${n.published_at}\n  Summary: ${n.summary}`
      )
      .join("\n\n");

    // ── Build engineered prompt ───────────────────────────────────────────────
    const { systemPrompt, userPrompt, temperature } = buildEnrichProspectPrompt({
      companyName,
      prospectName,
      rawNewsArticles,
    });

    // ── METRICS: Start timer before AI call ──────────────────────────────────
    const timer = MetricsTimer.start("enrich_prospect");

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
        functionName: "enrich_prospect",
        ...timing,
        dataAccuracyScore: 0,
        filledFields: 0,
        totalFields: 3,
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
    const schemaCheck = validateEnrichmentOutput(contentCheck.value!);
    if (!schemaCheck.ok) {
      safeLog("schema_invalid", {
        userId: user.id,
        company: companyName,
        reason: schemaCheck.reason,
      });
      await recordMetric(supabase, {
        userId: user.id,
        company: companyName,
        functionName: "enrich_prospect",
        ...timing,
        dataAccuracyScore: 0,
        filledFields: 0,
        totalFields: 3,
        emptyFields: [],
        minutesSaved: 0,
        guardrailsPassed: false,
      });
      return new Response(JSON.stringify({ error: schemaCheck.reason }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = schemaCheck.value!;

    // ── METRICS: Record accuracy and time saved ──────────────────────────────
    const accuracy = computeAccuracy(
      aiResult as unknown as Record<string, unknown>,
      "enrich_prospect"
    );
    const minutesSaved = computeTimeSaved(timing.durationMs);

    await recordMetric(supabase, {
      userId: user.id,
      company: companyName,
      functionName: "enrich_prospect",
      ...timing,
      ...accuracy,
      minutesSaved,
      guardrailsPassed: true,
    });

    // ── Compose enrichment data with real news ───────────────────────────────
    const enrichment_data = {
      company_overview: aiResult.company_overview,
      recent_news: recent_news,
      buying_signals: aiResult.buying_signals,
      business_events: aiResult.business_events,
    };

    // ── Save to ProspectEnrichments ──────────────────────────────────────────
    let enrichment_id = null;
    const { data: insertData, error: insertError } = await supabase
      .from("ProspectEnrichments")
      .insert({
        user_id: user.id,
        prospect_name: prospectName,
        company: companyName,
        enrichment_data: enrichment_data,
      })
      .select("id")
      .single();

    if (insertError) {
      safeError("db_insert_failed", insertError, {
        userId: user.id,
        company: companyName,
      });
    } else {
      enrichment_id = insertData.id;
    }

    safeLog("enrichment_complete", {
      userId: user.id,
      company: companyName,
      durationMs: timing.durationMs,
      dataAccuracyScore: accuracy.dataAccuracyScore,
      minutesSaved,
    });

    return new Response(
      JSON.stringify({ enrichment_id, enrichment_data, metrics: { accuracy, minutesSaved } }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    safeError("enrich_prospect_error", error, {});
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
