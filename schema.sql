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
