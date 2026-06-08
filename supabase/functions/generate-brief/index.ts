import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Set DEBUG_MODE=true in edge function secrets to enable verbose logs.
    const DEBUG = Deno.env.get('DEBUG_MODE') === 'true';

    // 2. Authentication Validation
    const authHeader = req.headers.get('Authorization');
    if (DEBUG) console.log("[DEBUG] AUTH HEADER:", authHeader ? authHeader.substring(0, 30) + '...' : 'MISSING');

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    if (DEBUG) console.log("[DEBUG] TOKEN (first 20):", token?.substring(0, 20));

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (DEBUG) console.log("[DEBUG] SUPABASE_URL configured:", supabaseUrl !== '');
    if (DEBUG) console.log("[DEBUG] SUPABASE_ANON_KEY configured:", supabaseAnonKey !== '');

    // For local verification without Docker/Supabase instance:
    let user = null;
    let authError = null;
    let supabase = null;

    if (supabaseUrl === '') {
      if (authHeader === 'Bearer TEST_VALID_JWT') {
        user = { id: 'mock-user-id' };
      } else {
        authError = new Error('Invalid token');
      }
    } else {
      // Create Supabase client and validate the token explicitly via getUser(token)
      supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await supabase.auth.getUser(token);
      if (DEBUG) console.log("[DEBUG] AUTH RESULT - user:", data?.user?.id ?? 'null');
      if (DEBUG) console.log("[DEBUG] AUTH RESULT - error:", error?.message ?? 'none');
      user = data?.user;
      authError = error;
    }

    if (authError || !user) {
      return new Response(JSON.stringify({
        error: 'Unauthorized: Invalid token',
        supabase_error: authError?.message ?? null,
        supabase_error_code: (authError as any)?.code ?? null,
        supabase_error_status: (authError as any)?.status ?? null,
        supabase_error_details: authError ?? null
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create an authenticated Supabase client that carries the user's JWT
    // This ensures all DB operations respect RLS policies scoped to this user.
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    // 3. Request Schema Validation
    let requestData;
    try {
      requestData = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { prospect_name, company, role, meeting_type, meeting_datetime, additional_context, enrichment_data, prospect_email, skip_meeting_creation } = requestData;

    // Basic validation matching the required dashboard form fields
    if (!prospect_name || !company) {
      return new Response(JSON.stringify({ error: 'Missing required fields: prospect_name and company are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prepare Gemini Request
    const systemInstruction = "You are Sales Saathi – Enterprise Sales Coach. Generate actionable pre-meeting intelligence, not generic summaries. Prioritize: buying signals, pain points, stakeholder analysis, discovery questions, meeting strategy, and smart ice breakers. You must output valid JSON matching the exact schema provided.\n\nGenerate 5 highly personalized B2B sales ice breakers. For each:\n- text: actual ice breaker\n- reason: explain why it is effective\nRules: Company-specific, Role-specific, Professional, Under 25 words, Avoid generic greetings.";
const userPrompt = `
Prospect: ${prospect_name}
Company: ${company}
Role: ${role || 'N/A'}
Meeting Type: ${meeting_type || 'Discovery Call'}
Meeting Date: ${meeting_datetime || 'N/A'}
Context: ${additional_context || 'N/A'}
${enrichment_data ? `\n--- ENRICHMENT DATA ---\n(Strictly use this as the true source for company overview and recent news! Do not invent URLs or external sources!)\nCompany Overview: ${enrichment_data.company_overview}\nBuying Signals: ${(enrichment_data.buying_signals||[]).join(', ')}\nBusiness Events: ${(enrichment_data.business_events||[]).join(', ')}\nRecent News: ${(enrichment_data.recent_news||[]).map((n:any) => `- ${n.title} (Source: ${n.source}, Date: ${n.published_at})`).join('\n')}\n-----------------------` : ''}
`;

    const schema = {
      type: "OBJECT",
      properties: {
        executive_summary: { type: "STRING" },
        company_overview: { type: "STRING" },
        recent_news: { type: "STRING" },
        likely_pain_points: { type: "ARRAY", items: { type: "STRING" } },
        buying_signals: { type: "ARRAY", items: { type: "STRING" } },
        stakeholder_analysis: { type: "ARRAY", items: { type: "STRING" } },
        recent_business_context: { type: "STRING" },
        discovery_questions: { type: "ARRAY", items: { type: "STRING" } },
        conversation_starters: { type: "ARRAY", items: { type: "STRING" } },
        objection_handling: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              objection: { type: "STRING" },
              response: { type: "STRING" }
            }
          }
        },
        recommended_pitch_angle: { type: "STRING" },
        meeting_strategy: { type: "STRING" },
        recommended_next_steps: { type: "ARRAY", items: { type: "STRING" } },
        smart_icebreakers: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              text: { type: "STRING" },
              reason: { type: "STRING" }
            }
          }
        }
      },
      required: [
        "executive_summary", "company_overview", "recent_news", "likely_pain_points",
        "buying_signals", "stakeholder_analysis", "recent_business_context",
        "discovery_questions", "conversation_starters", "objection_handling",
        "recommended_pitch_angle", "meeting_strategy", "recommended_next_steps", "smart_icebreakers"
      ]
    };

    const geminiPayload = {
      system_instruction: { parts: { text: systemInstruction } },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        response_mime_type: "application/json",
        response_schema: schema
      }
    };

    const modelName = 'gemini-2.5-flash-lite';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

    console.log(`[GEMINI LOG] geminiUrl: ${geminiUrl.replace(geminiApiKey, 'REDACTED')}`);
    console.log(`[GEMINI LOG] modelName: ${modelName}`);
    console.log(`[GEMINI LOG] Exact model name: ${modelName}`);
    console.log(`[GEMINI LOG] SDK Version: Using raw fetch API, no SDK`);
    console.log(`[GEMINI LOG] Request payload:`, JSON.stringify(geminiPayload));

    let geminiRes;
    let geminiData;
    let generatedText;
    const retryDelays = [2000, 5000, 10000];
    let attempts = 0;
    
    const startTime = performance.now();

    while (attempts <= retryDelays.length) {
      geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      });
      
      if (geminiRes.ok) {
        break;
      }
      
      const errorText = await geminiRes.text();
      console.log(`[GEMINI LOG] Error on attempt ${attempts + 1}: ${geminiRes.status} - ${errorText}`);
      
      if (geminiRes.status === 503 && attempts < retryDelays.length) {
        console.log(`[GEMINI LOG] Retrying after ${retryDelays[attempts]}ms...`);
        await new Promise(res => setTimeout(res, retryDelays[attempts]));
        attempts++;
      } else if (geminiRes.status === 503 && attempts === retryDelays.length) {
        return new Response(JSON.stringify({ error: 'Gemini is currently experiencing high demand. Please try again later.' }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } else {
        throw new Error(`Gemini API Error: ${geminiRes.status} - ${errorText}`);
      }
    }

    const endTime = performance.now();
    const generationTimeMs = Math.round(endTime - startTime);

    geminiData = await geminiRes.json();
    console.log(`[GEMINI LOG] Response body:`, JSON.stringify(geminiData));
    
    generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      throw new Error("Failed to extract content from Gemini response.");
    }

    // Clean up markdown code fences if Gemini returned them
    let cleanText = generatedText.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\n?/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\n?/, '');
    }
    if (cleanText.endsWith('```')) {
      cleanText = cleanText.replace(/\n?```$/, '');
    }
    cleanText = cleanText.trim();

    // Parse the generated JSON from Gemini
    let responsePayload;
    try {
      responsePayload = JSON.parse(cleanText);
    } catch (error) {
      console.error("RAW GEMINI RESPONSE:", generatedText);
      console.error("PARSE ERROR:", error);
      console.log("Response length:", generatedText.length);
      console.log("Response first chunk:", generatedText.slice(0, 1000));
      console.log("Response last chunk:", generatedText.slice(-1000));
      
      // Defensive parsing fallback: return raw text instead of throwing 500
      responsePayload = {
        executive_summary: "FAILED TO PARSE AI RESPONSE",
        company_overview: "Gemini returned invalid JSON.",
        raw_response: generatedText
      };
    }

    let dbInsertError = null;
    let briefId = null;

    if (user && supabaseUrl !== '') {
      // Use userSupabase (JWT-authenticated client) so RLS policies allow the insert
      const { data, error: insertError } = await userSupabase.from('PreMeetingBriefs').insert({
        user_id: user.id,
        prospect_name: prospect_name,
        company: company,
        role: role || null,
        meeting_type: meeting_type || 'Discovery Call',
        meeting_datetime: meeting_datetime || null,
        additional_context: additional_context || null,
        generated_brief: responsePayload,
        enrichment_data: enrichment_data || null,
        prospect_email: prospect_email || null,
        status: 'completed',
        generation_time_ms: generationTimeMs,
        model_used: modelName
      }).select('id').single();

      if (insertError) {
        console.error("Database Insert Error:", insertError);
        dbInsertError = insertError.message;
      } else {
        briefId = data.id;

        if (!skip_meeting_creation) {
          const { error: umError } = await userSupabase.from('UnifiedMeetings').insert({
            user_id: user.id,
            source: 'sales_saathi',
            meeting_title: (meeting_type || 'Discovery Call') + ' with ' + prospect_name,
            company: company,
            meeting_datetime: meeting_datetime || new Date().toISOString(),
            brief_id: data.id
          });

          if (umError) {
            console.error('UnifiedMeetings insert failed:', umError);
          } else {
            console.log('UnifiedMeeting created for brief', data.id);
          }
        } else {
          console.log('Skipped UnifiedMeeting creation for brief', data.id);
        }
      }
    } else if (supabaseUrl === '') {
      // Mock save for local test without Supabase linked
      briefId = 'mock-brief-id-1234';
      if (DEBUG) console.log("[DEBUG] Mock saved to DB with generationTimeMs:", generationTimeMs);
    }

    // Return the ID and status so the frontend can redirect to the Brief Result page
    return new Response(JSON.stringify({
      status: "success",
      brief_id: briefId,
      db_error: dbInsertError || undefined
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorObj = error as Error;
    return new Response(JSON.stringify({ error: errorObj.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
