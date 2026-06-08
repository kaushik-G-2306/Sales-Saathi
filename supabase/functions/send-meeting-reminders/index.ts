import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('[REMINDERS] Starting scheduled reminder check...');

    // 1. Initialize Supabase Admin Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 2. Define time window: Next 1 hour (plus a 5 minute buffer)
    const now = new Date();
    const oneHourAndFiveMinsFromNow = new Date(now.getTime() + 65 * 60 * 1000);

    console.log(`[REMINDERS] Checking for meetings between ${now.toISOString()} and ${oneHourAndFiveMinsFromNow.toISOString()}`);

    // 3. Query UnifiedMeetings
    // We join with Users to get email, name, and their auto_email_briefs preference, and PreMeetingBriefs to get the actual brief content!
    const { data: meetings, error: fetchError } = await supabaseAdmin
      .from('UnifiedMeetings')
      .select('*, Users:user_id(email, name, auto_email_briefs), PreMeetingBriefs:brief_id(*)')
      .gt('meeting_datetime', now.toISOString())
      .lt('meeting_datetime', oneHourAndFiveMinsFromNow.toISOString())
      .is('reminder_sent', false);

    if (fetchError) {
      console.error("[REMINDERS] Failed to fetch meetings:", fetchError);
      throw fetchError;
    }

    console.log(`[REMINDERS] Found ${meetings?.length || 0} meetings requiring reminders.`);

    if (!meetings || meetings.length === 0) {
      return new Response(JSON.stringify({ message: "No reminders to send." }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error("Missing RESEND_API_KEY");
    }

    // 4. Process each meeting
    const results = [];
    for (const meeting of meetings) {
      try {
        // Respect User's Email Preference
        if (meeting.Users?.auto_email_briefs === false) {
          console.log(`[REMINDERS] User opted out of auto-emails. Skipping meeting ${meeting.id}.`);
          continue;
        }

        const userEmail = meeting.Users?.email;
        const userName = meeting.Users?.name || 'there';

        if (!userEmail) {
          console.warn(`[REMINDERS] Meeting ${meeting.id} has no valid user email. Skipping.`);
          continue;
        }

        // Format meeting time for display, specifically targeting IST (Asia/Kolkata)
        const meetingDate = new Date(meeting.meeting_datetime);
        const timeString = meetingDate.toLocaleTimeString('en-IN', { 
            timeZone: 'Asia/Kolkata', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        const companyName = meeting.company && meeting.company !== 'Unknown Company' ? meeting.company : 'your prospect';

        // Extract Brief Details if they exist
        const briefData = meeting.PreMeetingBriefs?.generated_brief;
        let briefHtml = '';

        if (briefData) {
            const summary = briefData.executive_summary || "No summary available.";
            const challenges = (briefData.key_challenges || []).map((c: string) => `<li>${c}</li>`).join('');
            const icebreakers = (briefData.smart_icebreakers || []).map((i: string) => `<li style="margin-bottom: 8px;">❄️ ${i}</li>`).join('');
            
            briefHtml = `
              <div style="background-color: #f8fafc; padding: 20px; border-radius: 12px; margin-top: 20px; border: 1px solid #e2e8f0;">
                <h3 style="color: #0f172a; margin-top: 0;">AI Pre-Meeting Brief</h3>
                
                <h4 style="color: #334155; margin-bottom: 8px;">Executive Summary</h4>
                <p style="color: #475569; font-size: 14px; line-height: 1.5; margin-top: 0;">${summary}</p>
                
                <h4 style="color: #334155; margin-bottom: 8px; margin-top: 20px;">Key Challenges</h4>
                <ul style="color: #475569; font-size: 14px; margin-top: 0; padding-left: 20px;">
                    ${challenges || '<li>None identified.</li>'}
                </ul>

                <h4 style="color: #334155; margin-bottom: 8px; margin-top: 20px;">Smart Ice Breakers</h4>
                <ul style="color: #475569; font-size: 14px; margin-top: 0; padding-left: 20px; list-style-type: none; margin-left: -20px;">
                    ${icebreakers || '<li>None identified.</li>'}
                </ul>
              </div>
            `;
        } else {
            briefHtml = `
              <div style="background-color: #fef2f2; padding: 16px; border-radius: 12px; margin-top: 20px; border: 1px solid #fca5a5;">
                <p style="color: #991b1b; margin: 0; font-size: 14px;"><strong>No AI Brief Found:</strong> A pre-meeting brief has not been generated for this meeting yet. Log into Sales Saathi to generate one manually.</p>
              </div>
            `;
        }

        console.log(`[REMINDERS] Preparing brief email for ${userEmail} about ${meeting.meeting_title}...`);

        // Send Email via Resend
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`
          },
          body: JSON.stringify({
            from: 'Sales Saathi Reminders <onboarding@resend.dev>',
            to: [userEmail],
            subject: `Briefing: Upcoming meeting with ${companyName}`,
            html: `
              <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
                <h2 style="color: #6366f1; margin-bottom: 5px;">It's almost time!</h2>
                <p style="font-size: 15px; color: #475569;">Hi ${userName},</p>
                <p style="font-size: 15px; color: #475569; line-height: 1.5;">This is your automated briefing for your upcoming meeting: <strong>${meeting.meeting_title}</strong>.</p>
                
                <div style="display: inline-block; background: #e0e7ff; color: #4338ca; padding: 8px 16px; border-radius: 8px; font-weight: bold; font-size: 14px; margin-bottom: 10px;">
                   🕒 Starts at ${timeString}
                </div>

                ${briefHtml}
                
                <br/>
                <p style="font-size: 14px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 20px;">Go crush it!<br/><strong>Sales Saathi Automation</strong></p>
              </div>
            `
          })
        });

        if (!emailRes.ok) {
          const errText = await emailRes.text();
          throw new Error(`Resend API Error: ${errText}`);
        }

        // Mark as sent
        const { error: updateError } = await supabaseAdmin
          .from('UnifiedMeetings')
          .update({ reminder_sent: true })
          .eq('id', meeting.id);

        if (updateError) {
          console.error(`[REMINDERS] Failed to mark meeting ${meeting.id} as sent in database:`, updateError);
        }

        results.push({ id: meeting.id, status: 'sent' });
        console.log(`[REMINDERS] Successfully sent brief email for meeting ${meeting.id} to ${userEmail}`);

      } catch (err) {
        console.error(`[REMINDERS] Error processing meeting ${meeting.id}:`, err);
        results.push({ id: meeting.id, status: 'error', error: err.message });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[REMINDERS] Fatal Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
