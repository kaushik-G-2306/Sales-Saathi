import { supabase } from './supabase.js';

const LIMITS = {
    free: {
        briefs: 25,
        outreach: 20
    }
};

/**
 * Checks if the user has hit their usage limit for a given type.
 * @param {string} type - 'briefs' or 'outreach'
 * @param {string} planType - 'free', 'pro', 'team', 'enterprise'
 * @returns {Promise<boolean>} - true if limit is reached, false otherwise.
 */
export async function checkUsageLimit(type, planType) {
    if (planType !== 'free') return false; // Unlimited for paid plans

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return true; // Fail safe if not logged in

    const { data: usage, error } = await supabase
        .from('user_usage')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

    // PGRST116 means no rows found (which is fine, they have 0 usage)
    if (error && error.code !== 'PGRST116') {
        console.error('Error fetching usage:', error);
        return true; // Fail safe on error
    }

    if (!usage) return false; // No usage record yet

    const limit = LIMITS.free[type];
    const currentCount = type === 'briefs' ? (usage.briefs_count || 0) : (usage.outreach_count || 0);

    return currentCount >= limit;
}

/**
 * Increments the usage counter for a given type.
 * @param {string} type - 'briefs' or 'outreach'
 */
export async function incrementUsage(type) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Fetch current to increment
    const { data: usage, error: fetchError } = await supabase
        .from('user_usage')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

    let newBriefs = 0;
    let newOutreach = 0;

    if (usage) {
        newBriefs = usage.briefs_count || 0;
        newOutreach = usage.outreach_count || 0;
    }

    if (type === 'briefs') newBriefs++;
    if (type === 'outreach') newOutreach++;

    const { error } = await supabase
        .from('user_usage')
        .upsert({
            user_id: session.user.id,
            briefs_count: newBriefs,
            outreach_count: newOutreach,
            last_reset_date: usage?.last_reset_date || new Date().toISOString()
        }, { onConflict: 'user_id' });

    if (error) {
        console.error('Error incrementing usage:', error);
    }
}
