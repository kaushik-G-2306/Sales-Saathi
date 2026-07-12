import { supabase } from '../../src/lib/supabase.js';

export const SubscriptionService = {
    /**
     * Loads the user's subscription from Supabase, caches it in localStorage,
     * and fires an event so UI components can reactively update.
     */
    async loadFromSupabase(userId) {
        try {
            if (!userId) {
                this.setPlan('free');
                return 'free';
            }

            const { data, error } = await supabase
                .from('subscriptions')
                .select('plan_type, subscription_status')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                console.warn('Could not fetch subscription from Supabase:', error);
                this.setPlan('free');
                return 'free';
            }

            // Only honor active or trailing subscriptions
            if (data && (data.subscription_status === 'active' || data.subscription_status === 'trailing')) {
                const plan = data.plan_type || 'free';
                this.setPlan(plan);
                return plan;
            }

            this.setPlan('free');
            return 'free';
        } catch (err) {
            console.error('SubscriptionService error:', err);
            this.setPlan('free');
            return 'free';
        }
    },

    /**
     * Updates localStorage and dispatches a global event.
     */
    setPlan(planId) {
        const plan = planId.toLowerCase();
        localStorage.setItem('ss_plan', plan);
        // Also update the legacy key for backward compatibility with existing components
        localStorage.setItem('_x_userPlan', JSON.stringify(plan));
        
        window.dispatchEvent(new CustomEvent('ss:planChanged', { detail: { plan } }));
    },

    /**
     * Reads the plan synchronously from localStorage.
     */
    getPlan() {
        return localStorage.getItem('ss_plan') || 'free';
    }
};
