import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { brief_id } = await req.json();

        if (!brief_id) {
            throw new Error('Missing brief_id');
        }

        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        if (!resendApiKey) {
            throw new Error('RESEND_API_KEY environment variable is not configured. Please add it to your .env file and restart Supabase.');
        }

        // Initialize Supabase client
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            {
                global: { headers: { Authorization: req.headers.get('Authorization')! } }
            }
        );

        // Get the user's email address
        const { data: userData, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !userData?.user) {
            throw new Error('Unauthorized or failed to fetch user data');
        }
        const userEmail = userData.user.email;

        if (!userEmail) {
            throw new Error('No email associated with the logged-in user');
        }

        // Fetch the brief
        const { data: brief, error: briefError } = await supabaseClient
            .from('PreMeetingBriefs')
            .select('*')
            .eq('id', brief_id)
            .single();

        if (briefError || !brief) {
            throw new Error('Failed to fetch brief');
        }

        // Fetch the meeting to get title and company
        const { data: meeting, error: meetingError } = await supabaseClient
            .from('UnifiedMeetings')
            .select('meeting_title, company, meeting_datetime')
            .eq('brief_id', brief_id)
            .single();

        const meetingTitle = meeting?.meeting_title || 'Meeting';
        const companyName = meeting?.company || 'Unknown Company';
        const meetingDate = meeting?.meeting_datetime ? new Date(meeting.meeting_datetime).toLocaleString() : 'TBD';

        const gb = brief.generated_brief;

        // Generate clean HTML
        let htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
            <h1 style="color: #4f46e5; margin-bottom: 5px;">AI Pre-Meeting Brief</h1>
            <h2 style="color: #1e293b; margin-top: 0; font-weight: 500;">${meetingTitle} - ${companyName}</h2>
            <p style="color: #64748b; font-size: 14px; margin-bottom: 30px;">Scheduled for: ${meetingDate}</p>
        `;

        if (gb.executive_summary) {
            htmlContent += `
            <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 15px; margin-bottom: 25px; border-radius: 4px;">
                <h3 style="margin-top: 0; color: #334155; font-size: 16px;">Executive Summary</h3>
                <p style="margin-bottom: 0; line-height: 1.5; color: #475569;">${gb.executive_summary}</p>
            </div>
            `;
        }

        if (gb.smart_icebreakers && gb.smart_icebreakers.length > 0) {
            htmlContent += `
            <h3 style="color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-top: 25px;">Smart Icebreakers</h3>
            <ul style="padding-left: 20px; color: #475569;">
            `;
            for (const ice of gb.smart_icebreakers) {
                htmlContent += `<li style="margin-bottom: 10px;"><strong>${ice.text}</strong><br/><span style="font-size: 12px; color: #64748b;">Reason: ${ice.reason}</span></li>`;
            }
            htmlContent += `</ul>`;
        }

        if (gb.conversation_starters && gb.conversation_starters.length > 0) {
            htmlContent += `
            <h3 style="color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-top: 25px;">Conversation Starters</h3>
            <ul style="padding-left: 20px; color: #475569;">
            `;
            for (const starter of gb.conversation_starters) {
                htmlContent += `<li style="margin-bottom: 8px;">${starter}</li>`;
            }
            htmlContent += `</ul>`;
        }

        if (gb.recent_news && gb.recent_news.length > 0) {
            htmlContent += `
            <h3 style="color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-top: 25px;">Recent News & Signals</h3>
            <ul style="padding-left: 20px; color: #475569;">
            `;
            const newsItems = Array.isArray(gb.recent_news) ? gb.recent_news : [gb.recent_news];
            for (const news of newsItems) {
                htmlContent += `<li style="margin-bottom: 8px;">${news}</li>`;
            }
            htmlContent += `</ul>`;
        }

        if (gb.discovery_questions && gb.discovery_questions.length > 0) {
            htmlContent += `
            <h3 style="color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-top: 25px;">Discovery Questions</h3>
            <ul style="padding-left: 20px; color: #475569;">
            `;
            const qItems = Array.isArray(gb.discovery_questions) ? gb.discovery_questions : [gb.discovery_questions];
            for (const question of qItems) {
                htmlContent += `<li style="margin-bottom: 8px;">${question}</li>`;
            }
            htmlContent += `</ul>`;
        }

        htmlContent += `
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 12px;">
                Generated automatically by Sales Saathi AI
            </div>
        </div>
        `;

        // Send via Resend
        const resendReq = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Sales Saathi <onboarding@resend.dev>',
                to: [userEmail],
                subject: `Pre-Meeting Brief: ${companyName}`,
                html: htmlContent
            })
        });

        const resendRes = await resendReq.json();

        if (!resendReq.ok) {
            console.error('Resend Error:', resendRes);
            
            // Check for Resend sandbox constraint
            const isSandboxError = resendRes.message && resendRes.message.includes('only send testing emails to your own email address');
            if (isSandboxError) {
                const emailMatch = resendRes.message.match(/\(([^)]+)\)/);
                if (emailMatch && emailMatch[1]) {
                    const sandboxEmail = emailMatch[1];
                    console.log(`[EMAIL] Resend sandbox restriction detected. Retrying with sandbox email: ${sandboxEmail}`);
                    
                    const retryResendReq = await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${resendApiKey}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            from: 'Sales Saathi <onboarding@resend.dev>',
                            to: [sandboxEmail],
                            subject: `[Sandbox Dev] Pre-Meeting Brief: ${companyName}`,
                            html: `
                            <div style="background-color: #fffbeb; border-left: 4px solid #d97706; padding: 12px; margin-bottom: 20px; font-family: sans-serif; font-size: 14px; color: #b45309; border-radius: 4px;">
                                <strong>Sandbox Mode Notice:</strong> This email was originally sent to <strong>${userEmail}</strong>, but was forwarded to your Resend owner email (<strong>${sandboxEmail}</strong>) due to Resend sandbox domain restrictions.
                            </div>
                            ` + htmlContent
                        })
                    });
                    
                    const retryResendRes = await retryResendReq.json();
                    if (retryResendReq.ok) {
                        return new Response(JSON.stringify({ 
                            success: true, 
                            resend_id: retryResendRes.id,
                            notice: `Email forwarded to sandbox owner address (${sandboxEmail})`
                        }), {
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                            status: 200,
                        });
                    } else {
                        throw new Error(retryResendRes.message || 'Failed to send email to sandbox address');
                    }
                }
            }
            throw new Error(resendRes.message || 'Failed to send email via Resend');
        }

        return new Response(JSON.stringify({ success: true, resend_id: resendRes.id }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error('Function error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
