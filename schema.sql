-- Sales Saathi Supabase Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE public."Users" (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    auth_provider TEXT DEFAULT 'email',
    plan TEXT DEFAULT 'Free Trial',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- PreMeetingBriefs Table
CREATE TABLE public."PreMeetingBriefs" (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public."Users"(id) ON DELETE CASCADE,
    prospect_name TEXT NOT NULL,
    company TEXT NOT NULL,
    role TEXT,
    meeting_type TEXT DEFAULT 'Discovery Call',
    meeting_datetime TIMESTAMP WITH TIME ZONE,
    additional_context TEXT,
    generated_brief JSONB,
    status TEXT DEFAULT 'generating',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Row Level Security (RLS) Configuration
ALTER TABLE public."Users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PreMeetingBriefs" ENABLE ROW LEVEL SECURITY;

-- Users can only read and update their own profiles
CREATE POLICY "Users can view own profile" ON public."Users"
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public."Users"
    FOR UPDATE USING (auth.uid() = id);

-- Users can perform all operations on their own briefs
CREATE POLICY "Users can view own briefs" ON public."PreMeetingBriefs"
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own briefs" ON public."PreMeetingBriefs"
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own briefs" ON public."PreMeetingBriefs"
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own briefs" ON public."PreMeetingBriefs"
    FOR DELETE USING (auth.uid() = user_id);

-- ProspectEnrichments Table
CREATE TABLE public."ProspectEnrichments" (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public."Users"(id) ON DELETE CASCADE,
    prospect_name TEXT NOT NULL,
    company TEXT NOT NULL,
    enrichment_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public."PreMeetingBriefs" ADD COLUMN IF NOT EXISTS enrichment_data JSONB;

ALTER TABLE public."ProspectEnrichments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own enrichments" ON public."ProspectEnrichments"
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own enrichments" ON public."ProspectEnrichments"
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- OutreachMessages Table
CREATE TABLE public."OutreachMessages" (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public."Users"(id) ON DELETE CASCADE,
    brief_id UUID REFERENCES public."PreMeetingBriefs"(id) ON DELETE CASCADE,
    prospect_name TEXT NOT NULL,
    company TEXT NOT NULL,
    role TEXT,
    subject_line TEXT,
    cold_email TEXT,
    linkedin_request TEXT,
    linkedin_message TEXT,
    followup_email TEXT,
    followup_linkedin TEXT,
    personalization_level TEXT,
    model_used TEXT,
    generation_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public."OutreachMessages" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own outreach" ON public."OutreachMessages"
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own outreach" ON public."OutreachMessages"
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- CalendarConnections Table
CREATE TABLE public."CalendarConnections" (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public."Users"(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    calendar_email TEXT,
    connection_status TEXT DEFAULT 'connected',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, provider)
);

ALTER TABLE public."CalendarConnections" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections" ON public."CalendarConnections"
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections" ON public."CalendarConnections"
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections" ON public."CalendarConnections"
    FOR UPDATE USING (auth.uid() = user_id);

-- UnifiedMeetings Table
CREATE TABLE public."UnifiedMeetings" (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public."Users"(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('sales_saathi', 'google', 'outlook')),
    meeting_title TEXT NOT NULL,
    company TEXT,
    meeting_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    external_event_id TEXT,
    attendees JSONB,
    brief_id UUID REFERENCES public."PreMeetingBriefs"(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX idx_unifiedmeetings_datetime ON public."UnifiedMeetings"(meeting_datetime);

ALTER TABLE public."UnifiedMeetings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own meetings" ON public."UnifiedMeetings"
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meetings" ON public."UnifiedMeetings"
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meetings" ON public."UnifiedMeetings"
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own meetings" ON public."UnifiedMeetings"
    FOR DELETE USING (auth.uid() = user_id);

-- ==========================================
-- MIGRATION: AI Brief Generation & PDF V2
-- ==========================================

-- 1. Changes to PreMeetingBriefs
ALTER TABLE public."PreMeetingBriefs" 
ADD COLUMN IF NOT EXISTS prospect_email TEXT,
ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT,
ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- 2. Changes to UnifiedMeetings
ALTER TABLE public."UnifiedMeetings" 
ADD COLUMN IF NOT EXISTS brief_status TEXT DEFAULT 'not_started',
ADD COLUMN IF NOT EXISTS auto_generate_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_email_enabled BOOLEAN DEFAULT false;

-- 3. Constraints
ALTER TABLE public."UnifiedMeetings"
DROP CONSTRAINT IF EXISTS valid_brief_status;

ALTER TABLE public."UnifiedMeetings"
ADD CONSTRAINT valid_brief_status 
CHECK (
    brief_status IN (
        'not_started', 
        'generating', 
        'completed', 
        'failed'
    )
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_unifiedmeetings_brief_status 
ON public."UnifiedMeetings"(brief_status);

CREATE INDEX IF NOT EXISTS idx_unifiedmeetings_auto_generate 
ON public."UnifiedMeetings"(auto_generate_enabled) 
WHERE auto_generate_enabled = true;

CREATE INDEX IF NOT EXISTS idx_unifiedmeetings_auto_email 
ON public."UnifiedMeetings"(auto_email_enabled) 
WHERE auto_email_enabled = true;

-- ==========================================
-- MIGRATION: Subscriptions & Enterprise Leads
-- Added for payment flow (payment.html)
-- ==========================================

-- Subscriptions Table
-- Tracks each user's current plan and billing status
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id                        UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id                   UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    plan_type                 TEXT NOT NULL DEFAULT 'free'
                                  CHECK (plan_type IN ('free', 'pro', 'team', 'enterprise')),
    subscription_status       TEXT NOT NULL DEFAULT 'trial'
                                  CHECK (subscription_status IN ('trial', 'active', 'expired', 'cancelled')),
    payment_status            TEXT DEFAULT 'unpaid'
                                  CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
    subscription_start_date   TIMESTAMP WITH TIME ZONE,
    trial_start_date          TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    trial_end_date            TIMESTAMP WITH TIME ZONE DEFAULT (timezone('utc'::text, now()) + INTERVAL '14 days'),
    created_at                TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at                TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
    ON public.subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
    ON public.subscriptions(subscription_status);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
    ON public.subscriptions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription"
    ON public.subscriptions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription"
    ON public.subscriptions FOR UPDATE
    USING (auth.uid() = user_id);

-- Enterprise Leads Table
-- Stores enterprise inquiry form submissions
CREATE TABLE IF NOT EXISTS public.enterprise_leads (
    id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    company_name  TEXT NOT NULL,
    work_email    TEXT NOT NULL,
    phone_number  TEXT,
    team_size     TEXT,
    requirements  TEXT,
    status        TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.enterprise_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own enterprise lead"
    ON public.enterprise_leads FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own enterprise leads"
    ON public.enterprise_leads FOR SELECT
    USING (auth.uid() = user_id);
