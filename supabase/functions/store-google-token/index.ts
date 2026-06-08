import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('[STORE-TOKEN] Request received.');
    console.log("Authorization header:", req.headers.get("Authorization"));
    
    // Parse the payload ONCE
    const { provider_token, provider_refresh_token } = await req.json();

    if (!provider_token) {
      console.error('[STORE-TOKEN] Error: Missing provider_token.');
      return new Response(JSON.stringify({ error: 'Missing provider_token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Initialize Supabase Client for user auth verification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        console.error('[STORE-TOKEN] Error: Missing Authorization header');
        return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const jwt = authHeader?.replace('Bearer ', '');

    console.log('[STORE-TOKEN] JWT exists:', !!jwt);
    console.log('[STORE-TOKEN] JWT length:', jwt?.length);

    const {
      data: { user },
      error: userError
    } = await userClient.auth.getUser(jwt);
    
    console.log("[STORE-TOKEN] User:", user);
    console.log("[STORE-TOKEN] Error:", userError);

    if (userError || !user) {
      console.error('[STORE-TOKEN] Error: Unauthorized.', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[STORE-TOKEN] Authenticated user: ${user.id}`);

    // We must use a direct Postgres connection because PostgREST blocks access 
    // to the 'private' schema natively (PGRST106), even with the Service Role key.
    const dbUrl = Deno.env.get('SUPABASE_DB_URL');
    if (!dbUrl) {
      throw new Error("Missing SUPABASE_DB_URL environment variable.");
    }
    
    // Dynamically import postgresjs
    const postgres = (await import('https://deno.land/x/postgresjs@v3.3.5/mod.js')).default;
    const sql = postgres(dbUrl);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    console.log(`[STORE-TOKEN] Executing direct SQL upsert into private.google_tokens...`);
    
    if (provider_refresh_token) {
      console.log(`[STORE-TOKEN] Captured fresh provider_refresh_token.`);
      await sql`
        INSERT INTO private.google_tokens (user_id, access_token, refresh_token, expires_at, updated_at)
        VALUES (${user.id}, ${provider_token}, ${provider_refresh_token}, ${expiresAt.toISOString()}, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          expires_at = EXCLUDED.expires_at,
          updated_at = NOW()
      `;
    } else {
      await sql`
        INSERT INTO private.google_tokens (user_id, access_token, expires_at, updated_at)
        VALUES (${user.id}, ${provider_token}, ${expiresAt.toISOString()}, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          access_token = EXCLUDED.access_token,
          expires_at = EXCLUDED.expires_at,
          updated_at = NOW()
      `;
    }

    console.log(`[STORE-TOKEN] Successfully saved tokens for user ${user.id} via direct SQL.`);
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[STORE-TOKEN] Catch Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
