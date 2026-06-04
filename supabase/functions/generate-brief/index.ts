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

    const { prospect_name, company, role, meeting_type, meeting_datetime, additional_context } = requestData;

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

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;

    const startTime = performance.now();
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload)
    });
    const endTime = performance.now();
    const generationTimeMs = Math.round(endTime - startTime);

    if (!geminiRes.ok) {
      const errorText = await geminiRes.text();
      throw new Error(`Gemini API Error: ${geminiRes.status} - ${errorText}`);
    }

    const geminiData = await geminiRes.json();
    const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      throw new Error("Failed to extract content from Gemini response.");
    }

    // Parse the generated JSON from Gemini
    const responsePayload = JSON.parse(generatedText);

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
        status: 'completed',
        generation_time_ms: generationTimeMs
      }).select('id').single();

      if (insertError) {
        console.error("Database Insert Error:", insertError);
        dbInsertError = insertError.message;
      } else {
        briefId = data.id;
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
