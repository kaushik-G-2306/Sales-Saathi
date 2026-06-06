import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { prospect_name, company, role, linkedin_url } = await req.json();

    if (!prospect_name || !company) {
      throw new Error('prospect_name and company are required fields');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Init Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    console.log('[AUTH HEADER EXISTS]', !!authHeader);
    console.log('[AUTH HEADER PREFIX]', authHeader?.substring(0, 40));

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const authResult = await userSupabase.auth.getUser(token);
    console.log('[AUTH RESULT]', JSON.stringify(authResult));
    const { data: { user }, error: authError } = authResult;
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid user token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch from Real News APIs
    const newsApiKey = Deno.env.get('NEWS_API_KEY');
    const gnewsApiKey = Deno.env.get('GNEWS_API_KEY');
    
    let rawArticles: any[] = [];
    let provider = 'none';

    if (newsApiKey) {
      try {
        const newsRes = await fetch(`https://newsapi.org/v2/everything?q="${encodeURIComponent(company)}"&sortBy=publishedAt&language=en&pageSize=5&apiKey=${newsApiKey}`);
        const newsData = await newsRes.json();
        if (newsData.status === 'ok' && newsData.articles?.length > 0) {
          rawArticles = newsData.articles;
          provider = 'newsapi';
        }
      } catch (e) {
        console.error("NewsAPI Error:", e);
      }
    }

    if (rawArticles.length === 0 && gnewsApiKey) {
      try {
        const gnewsRes = await fetch(`https://gnews.io/api/v4/search?q="${encodeURIComponent(company)}"&lang=en&max=5&apikey=${gnewsApiKey}`);
        const gnewsData = await gnewsRes.json();
        if (gnewsData.articles?.length > 0) {
          rawArticles = gnewsData.articles;
          provider = 'gnews';
        }
      } catch (e) {
        console.error("GNews Error:", e);
      }
    }

    console.log(`[ENRICHMENT] Fetched ${rawArticles.length} articles from ${provider}`);

    // Map articles to strict structured format preserving original source and URL
    const recent_news = rawArticles.slice(0, 5).map(article => {
      let sourceName = 'Unknown Source';
      if (provider === 'newsapi') sourceName = article.source?.name || 'Unknown';
      if (provider === 'gnews') sourceName = article.source?.name || 'Unknown';

      return {
        title: article.title || 'Untitled',
        source: sourceName,
        url: article.url || '#',
        published_at: article.publishedAt || new Date().toISOString(),
        summary: article.description || article.content || 'No summary available.'
      };
    });

    // 2. Call Gemini for Summarization & Signal Extraction ONLY
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY is not set');

    const promptText = `
You are an expert sales intelligence assistant. 
Your task is to extract "company_overview", "buying_signals", and "business_events" strictly based on the provided details and news articles.
Do NOT invent news, do NOT invent URLs. Use ONLY the facts provided below.

Prospect Details:
- Name: ${prospect_name}
- Company: ${company}
- Role: ${role || 'Unknown'}

Recent News Context:
${recent_news.map(n => `- Title: ${n.title}\n  Source: ${n.source}\n  Date: ${n.published_at}\n  Summary: ${n.summary}\n`).join('\n')}

Output JSON exactly matching this schema:
{
  "company_overview": "A brief 2-3 sentence overview of the company derived from the news and general knowledge.",
  "buying_signals": ["Signal 1", "Signal 2"],
  "business_events": ["Event 1", "Event 2"]
}
`;

    const modelName = 'gemini-2.5-flash-lite';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

    let aiResult = {
      company_overview: `${company} is a company in the industry.`,
      buying_signals: [],
      business_events: []
    };

    if (recent_news.length > 0 || company) {
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2
          }
        })
      });

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          aiResult = JSON.parse(text);
        }
      } else {
        console.error("Gemini Extraction Error:", await geminiRes.text());
      }
    }

    const enrichment_data = {
      company_overview: aiResult.company_overview,
      recent_news: recent_news,
      buying_signals: aiResult.buying_signals,
      business_events: aiResult.business_events
    };

    // 3. Save to ProspectEnrichments
    let enrichment_id = null;
    const { data: insertData, error: insertError } = await userSupabase.from('ProspectEnrichments').insert({
      user_id: user.id,
      prospect_name: prospect_name,
      company: company,
      enrichment_data: enrichment_data
    }).select('id').single();

    if (insertError) {
      console.error("Failed to insert ProspectEnrichments:", insertError);
    } else {
      enrichment_id = insertData.id;
    }

    return new Response(JSON.stringify({ enrichment_id, enrichment_data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error("Enrichment Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
