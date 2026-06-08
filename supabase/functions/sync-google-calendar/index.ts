import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

console.log("===== SYNC GOOGLE CALENDAR VERSION 2 =====");
console.log("DEPLOY TIME:", new Date().toISOString());

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const fetchWithTimeout = async (resource, options = {}) => {
  const { timeout = 15000 } = options;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal  
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw new Error(`Fetch timed out or failed: ${error.message}`);
  }
};

serve(async (req) => {
  console.log("[SYNC] FUNCTION STARTED");
  console.log("[SYNC] Function started");

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log("[SYNC] Reading Authorization header...");
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    console.log("[SYNC] Authenticating user...");
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await userClient.auth.getUser(jwt);

    if (userError || !user) {
      console.log("[SYNC] Unauthorized or user fetch failed:", userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    console.log("[SYNC] User authenticated:", user.id);

    console.log("[SYNC] Connecting to Postgres directly...");
    const dbUrl = Deno.env.get('SUPABASE_DB_URL');
    if (!dbUrl) throw new Error("Missing SUPABASE_DB_URL");
    
    console.log("[SYNC] Importing postgresjs...");
    const postgres = (await import('https://deno.land/x/postgresjs@v3.3.5/mod.js')).default;
    const sql = postgres(dbUrl);

    console.log("[SYNC] Reading google_tokens from DB...");
    const tokenRecords = await sql`
      SELECT access_token, refresh_token, expires_at 
      FROM private.google_tokens 
      WHERE user_id = ${user.id}
    `;

    if (tokenRecords.length === 0) {
      console.log("[SYNC] No tokens found.");
      return new Response(JSON.stringify({ error: 'No Google Calendar connected' }), { status: 404, headers: corsHeaders });
    }

    console.log("[SYNC] Tokens loaded.");
    let { access_token, refresh_token, expires_at } = tokenRecords[0];

    const now = new Date();
    const expiryDate = new Date(expires_at);

    console.log(`[SYNC] Token expiry check. Now: ${now.toISOString()}, Expiry: ${expiryDate.toISOString()}`);
    
    if (now >= expiryDate) {
      console.log('[SYNC] Access token expired. Refreshing...');
      if (!refresh_token) {
        throw new Error('Access token expired and no refresh token available.');
      }

      console.log(
        "[SYNC] GOOGLE_CLIENT_ID EXISTS:",
        !!Deno.env.get("GOOGLE_CLIENT_ID")
      );

      console.log(
        "[SYNC] GOOGLE_CLIENT_SECRET EXISTS:",
        !!Deno.env.get("GOOGLE_CLIENT_SECRET")
      );
      
      const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
      const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

      if (!clientId || !clientSecret) {
        throw new Error('Missing Google OAuth credentials in environment.');
      }

      console.log("[SYNC] Calling Google Token Refresh API...");
      const tokenRes = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refresh_token,
          grant_type: 'refresh_token',
        })
      });

      if (!tokenRes.ok) {
        const errTxt = await tokenRes.text();
        console.error("[SYNC] Token refresh failed:", errTxt);
        throw new Error(`Failed to refresh token: ${errTxt}`);
      }

      console.log("[SYNC] Parsing token refresh response...");
      const tokenData = await tokenRes.json();
      access_token = tokenData.access_token;
      
      const newExpiry = new Date();
      newExpiry.setSeconds(newExpiry.getSeconds() + (tokenData.expires_in || 3600));
      
      console.log("[SYNC] Updating DB with new token...");
      await sql`
        UPDATE private.google_tokens 
        SET access_token = ${access_token}, expires_at = ${newExpiry.toISOString()}, updated_at = NOW()
        WHERE user_id = ${user.id}
      `;
      console.log('[SYNC] Token refreshed and updated in DB.');
    } else {
      console.log("[SYNC] Token is still valid.");
    }

    console.log("[SYNC] Preparing Calendar fetch...");
    const timeMin = new Date().toISOString();
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    const timeMax = maxDate.toISOString();

    const calUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;
    
    console.log("[SYNC] Calling Google Calendar API...");
    const calRes = await fetchWithTimeout(calUrl, {
      headers: { Authorization: `Bearer ${access_token}` },
      timeout: 20000
    });

    if (!calRes.ok) {
      const errTxt = await calRes.text();
      console.error("[SYNC] Calendar fetch failed:", errTxt);
      throw new Error(`Failed to fetch calendar events: ${errTxt}`);
    }

    console.log("[SYNC] Parsing events...");
    const calData = await calRes.json();
    const items = calData.items || [];
    console.log(`[SYNC] Parsed ${items.length} events from Google.`);

    console.log("[SYNC] Initializing Service Role client for writing to UnifiedMeetings...");
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    console.log("[SYNC] Fetching existing UnifiedMeetings to prevent duplicates...");
    const { data: existingEvents, error: existingError } = await adminClient
      .from('UnifiedMeetings')
      .select('id, external_event_id')
      .eq('user_id', user.id)
      .eq('source', 'google')
      .not('external_event_id', 'is', null);

    if (existingError) {
      console.error("[SYNC] Error fetching existing meetings:", existingError);
      throw new Error(`DB Error: ${existingError.message}`);
    }

    const existingMap = new Map((existingEvents || []).map(e => [e.external_event_id, e.id]));

    console.log("[SYNC] Writing to UnifiedMeetings...");
    let insertedCount = 0;
    let updatedCount = 0;

    for (const item of items) {
      if (item.status === 'cancelled') continue;
      
      const extId = item.id;
      const title = item.summary || 'Untitled Event';
      const dateTime = item.start?.dateTime || item.start?.date; // date is for all-day events
      
      if (!dateTime) continue;

      const attendees = item.attendees || [];
      const description = item.description || '';

      const payload = {
        user_id: user.id,
        meeting_title: title,
        meeting_datetime: dateTime,
        source: 'google',
        external_event_id: extId,
        attendees: attendees,
        description: description
      };

      console.log("[SYNC] PAYLOAD KEYS:", Object.keys(payload));

      if (existingMap.has(extId)) {
        const { data, error } = await adminClient
          .from('UnifiedMeetings')
          .update(payload)
          .eq('id', existingMap.get(extId))
          .select();
          
        console.log("[SYNC] UPDATE RESULT:", data);

        if (error) {
          console.error("[SYNC] DATABASE UPDATE FAILED FULL:", JSON.stringify(error, null, 2));
          throw new Error(JSON.stringify(error));
        }
        updatedCount++;
      } else {
        const { data, error } = await adminClient
          .from('UnifiedMeetings')
          .insert(payload)
          .select();
          
        console.log("[SYNC] INSERT RESULT:", data);

        if (error) {
          console.error("[SYNC] DATABASE INSERT FAILED FULL:", JSON.stringify(error, null, 2));
          throw new Error(JSON.stringify(error));
        }
        insertedCount++;
      }
    }

    console.log(`[SYNC] DB Write completed. Inserted: ${insertedCount}, Updated: ${updatedCount}`);
    
    console.log("[SYNC] Returning success response.");
    return new Response(JSON.stringify({ 
      success: true, 
      total_events_fetched: items.length,
      inserted_count: insertedCount,
      updated_count: updatedCount
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[SYNC] FATAL ERROR:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
