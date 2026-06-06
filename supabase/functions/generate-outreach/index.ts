import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const DEBUG = Deno.env.get('DEBUG_MODE') === 'true';

    // 2. Authentication Validation (matches generate-brief)
    const authHeader = req.headers.get('Authorization');
    if (DEBUG) console.log("[DEBUG] AUTH HEADER:", authHeader ? authHeader.substring(0, 30) + '...' : 'MISSING');

    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

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
      supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await supabase.auth.getUser(token);
      user = data?.user;
      authError = error;
    }

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const { brief_id } = requestData;

    if (!brief_id) {
      return new Response(JSON.stringify({ error: 'Missing required field: brief_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Fetch PreMeetingBrief
    let brief = null;
    if (supabaseUrl !== '') {
      const { data, error } = await userSupabase
        .from('PreMeetingBriefs')
        .select('*')
        .eq('id', brief_id)
        .single();
      
      if (error) {
        throw new Error(`Failed to fetch brief: ${error.message}`);
      }
      brief = data;
    } else {
      // Mock data for local testing without Supabase
      brief = {
        prospect_name: 'Test Prospect',
        company: 'Test Company',
        role: 'Test Role',
        meeting_type: 'Discovery',
        generated_brief: { executive_summary: 'Test summary' },
        enrichment_data: null
      };
    }

    if (!brief) {
      return new Response(JSON.stringify({ error: 'Brief not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { prospect_name, company, role, meeting_type, generated_brief, enrichment_data } = brief;

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Build AI context
    const systemInstruction = `You are an elite B2B Sales SDR and Executive Outreach Writer. Generate highly personalized outreach messages based on the prospect data provided. 
Rules:
- Personalize based on the prospect's role, company, recent news, and buying signals.
- Explicitly mention recent news or company context when available.
- Keep messages concise, punchy, and human-sounding. Avoid generic AI fluff or corporate jargon.
- Return strictly valid JSON matching the exact requested schema.`;

    const userPrompt = `
Prospect: ${prospect_name}
Company: ${company}
Role: ${role || 'N/A'}
Meeting Type: ${meeting_type || 'N/A'}

--- Generated AI Brief Context ---
${JSON.stringify(generated_brief)}

--- Prospect Enrichment & News Data ---
${enrichment_data ? JSON.stringify(enrichment_data) : 'No enrichment data available. Focus personalization on the prospect role and company context from the generated brief.'}
`;

    const schema = {
      type: "OBJECT",
      properties: {
        subject_line: { type: "STRING" },
        cold_email: { type: "STRING" },
        linkedin_request: { type: "STRING" },
        linkedin_message: { type: "STRING" },
        followup_email: { type: "STRING" },
        followup_linkedin: { type: "STRING" }
      },
      required: [
        "subject_line", "cold_email", "linkedin_request", "linkedin_message", "followup_email", "followup_linkedin"
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

    // 6. Call Gemini 2.5 Flash Lite
    let geminiRes;
    const retryDelays = [2000, 5000, 10000];
    let attempts = 0;
    const startTime = performance.now();

    while (attempts <= retryDelays.length) {
      geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      });
      
      if (geminiRes.ok) break;
      
      const errorText = await geminiRes.text();
      console.error(`[GEMINI LOG] Error on attempt ${attempts + 1}: ${geminiRes.status} - ${errorText}`);
      
      if (geminiRes.status === 503 && attempts < retryDelays.length) {
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

    const geminiData = await geminiRes.json();
    const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      throw new Error("Failed to extract content from Gemini response.");
    }

    const responsePayload = JSON.parse(generatedText);
    
    // Determine personalization level roughly based on whether we had enrichment data
    const personalizationLevel = enrichment_data ? "High" : "Standard";

    // 7. Store output into OutreachMessages
    let outreachId = null;
    let dbInsertError = null;

    if (user && supabaseUrl !== '') {
      const { data, error: insertError } = await userSupabase.from('OutreachMessages').insert({
        user_id: user.id,
        brief_id: brief_id,
        prospect_name: prospect_name,
        company: company,
        role: role,
        subject_line: responsePayload.subject_line,
        cold_email: responsePayload.cold_email,
        linkedin_request: responsePayload.linkedin_request,
        linkedin_message: responsePayload.linkedin_message,
        followup_email: responsePayload.followup_email,
        followup_linkedin: responsePayload.followup_linkedin,
        personalization_level: personalizationLevel,
        model_used: modelName,
        generation_time_ms: generationTimeMs
      }).select('id').single();

      if (insertError) {
        console.error("Database Insert Error:", insertError);
        dbInsertError = insertError.message;
      } else {
        outreachId = data.id;
      }
    } else if (supabaseUrl === '') {
      outreachId = 'mock-outreach-id-1234';
    }

    // 8. Return JSON response
    return new Response(JSON.stringify({
      status: "success",
      outreach_id: outreachId,
      data: responsePayload,
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
