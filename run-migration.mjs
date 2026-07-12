/**
 * run-migration.mjs
 * Runs the subscriptions + enterprise_leads migration against Supabase
 * Usage: node run-migration.mjs
 */

import { createClient } from '@supabase/supabase-js';

// Read from the .env values
const SUPABASE_URL      = 'https://tpmnbglgmfqiiqxdjrwa.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_fetbb8CLTLMHcM_2bRgn8Q_jQ7wlI5U';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- SQL to run ---
// We use individual queries so we can report each one
const statements = [
  {
    name: 'Create subscriptions table',
    sql: `
      CREATE TABLE IF NOT EXISTS public.subscriptions (
          id                        UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
          user_id                   UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
          plan_type                 TEXT NOT NULL DEFAULT 'free',
          subscription_status       TEXT NOT NULL DEFAULT 'trial',
          payment_status            TEXT DEFAULT 'unpaid',
          subscription_start_date   TIMESTAMP WITH TIME ZONE,
          trial_start_date          TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
          trial_end_date            TIMESTAMP WITH TIME ZONE DEFAULT (timezone('utc'::text, now()) + INTERVAL '14 days'),
          created_at                TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
          updated_at                TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
      );
    `
  },
  {
    name: 'Enable RLS on subscriptions',
    sql: `ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;`
  },
  {
    name: 'RLS: subscriptions SELECT',
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='Users can view own subscription'
        ) THEN
          CREATE POLICY "Users can view own subscription"
            ON public.subscriptions FOR SELECT
            USING (auth.uid() = user_id);
        END IF;
      END $$;
    `
  },
  {
    name: 'RLS: subscriptions INSERT',
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='Users can insert own subscription'
        ) THEN
          CREATE POLICY "Users can insert own subscription"
            ON public.subscriptions FOR INSERT
            WITH CHECK (auth.uid() = user_id);
        END IF;
      END $$;
    `
  },
  {
    name: 'RLS: subscriptions UPDATE',
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename='subscriptions' AND policyname='Users can update own subscription'
        ) THEN
          CREATE POLICY "Users can update own subscription"
            ON public.subscriptions FOR UPDATE
            USING (auth.uid() = user_id);
        END IF;
      END $$;
    `
  },
  {
    name: 'Create enterprise_leads table',
    sql: `
      CREATE TABLE IF NOT EXISTS public.enterprise_leads (
          id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
          user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
          company_name  TEXT NOT NULL,
          work_email    TEXT NOT NULL,
          phone_number  TEXT,
          team_size     TEXT,
          requirements  TEXT,
          status        TEXT DEFAULT 'new',
          created_at    TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
      );
    `
  },
  {
    name: 'Enable RLS on enterprise_leads',
    sql: `ALTER TABLE public.enterprise_leads ENABLE ROW LEVEL SECURITY;`
  },
  {
    name: 'RLS: enterprise_leads INSERT',
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename='enterprise_leads' AND policyname='Users can insert own enterprise lead'
        ) THEN
          CREATE POLICY "Users can insert own enterprise lead"
            ON public.enterprise_leads FOR INSERT
            WITH CHECK (auth.uid() = user_id);
        END IF;
      END $$;
    `
  },
  {
    name: 'RLS: enterprise_leads SELECT',
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename='enterprise_leads' AND policyname='Users can view own enterprise leads'
        ) THEN
          CREATE POLICY "Users can view own enterprise leads"
            ON public.enterprise_leads FOR SELECT
            USING (auth.uid() = user_id);
        END IF;
      END $$;
    `
  }
];

// Note: Supabase anon key cannot run DDL directly.
// We need to use the service role key or the Supabase dashboard.
// This script instead validates the connection and shows what needs to be done.

console.log('\n=== Sales Saathi – Supabase Migration Check ===\n');
console.log('Supabase URL:', SUPABASE_URL);
console.log('');

// Check if tables exist
async function checkTable(tableName) {
  const { error } = await supabase.from(tableName).select('id').limit(1);
  if (error && error.code === '42P01') return false; // table not found
  if (error && error.message.includes('schema cache')) return false;
  return true; // exists (even if empty or RLS blocked)
}

const subsExists  = await checkTable('subscriptions');
const leadsExists = await checkTable('enterprise_leads');

console.log(`subscriptions table  : ${subsExists  ? '✅ EXISTS' : '❌ MISSING'}`);
console.log(`enterprise_leads table: ${leadsExists ? '✅ EXISTS' : '❌ MISSING'}`);

if (!subsExists || !leadsExists) {
  console.log('\n⚠️  One or more tables are missing.');
  console.log('\nTo create them, go to your Supabase Dashboard:');
  console.log(`👉  https://supabase.com/dashboard/project/tpmnbglgmfqiiqxdjrwa/sql/new`);
  console.log('\nThen paste and run the SQL from: schema.sql (the section at the bottom)');
  console.log('\nSQL to run:\n');
  statements.forEach(s => console.log('-- ' + s.name + '\n' + s.sql.trim() + '\n'));
} else {
  console.log('\n✅ Both tables exist. Payment flow should work!');
}
