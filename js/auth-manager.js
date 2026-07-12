import { supabase } from '../src/lib/supabase.js';
import { SubscriptionService } from './permissions/subscriptionService.js';

// Ensure Alpine store is created before Alpine initializes if possible
document.addEventListener('alpine:init', () => {
    window.Alpine.store('auth', {
        isAuthenticated: false,
        user: null
    });
});

const AuthManager = {
    async init() {
        try {
            // 1. Fetch current session on load
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) throw error;
            
            this.updateState(session);

            // 2. Listen for realtime auth changes
            supabase.auth.onAuthStateChange((event, session) => {
                this.updateState(session);
            });
        } catch (err) {
            console.error('AuthManager Initialization Error:', err);
        }
    },

    async updateState(session) {
        const isAuthenticated = !!session;
        const user = session ? session.user : null;

        if (user) {
            await SubscriptionService.loadFromSupabase(user.id);
        } else {
            SubscriptionService.setPlan('free');
        }

        const updateAlpine = () => {
            if (window.Alpine && window.Alpine.store) {
                try {
                    const store = window.Alpine.store('auth');
                    if (store) {
                        store.isAuthenticated = isAuthenticated;
                        store.user = user;
                    } else {
                        window.Alpine.store('auth', { isAuthenticated, user });
                    }
                } catch (e) {
                    window.Alpine.store('auth', { isAuthenticated, user });
                }
            }
        };

        // Try to update immediately, or wait if Alpine isn't ready
        if (window.Alpine) {
            updateAlpine();
        } else {
            document.addEventListener('alpine:initialized', updateAlpine, { once: true });
        }
    },

    async logout() {
        try {
            // 1. Sign out of Supabase
            await supabase.auth.signOut();
            
            // 2. Clear old legacy local state keys just in case
            localStorage.removeItem('_x_isLoggedIn');
            localStorage.removeItem('_x_userName');
            
            // 3. Redirect user to home
            // Check if we are on a protected route to avoid looping, but normally redirect to /
            if (window.location.pathname.includes('dashboard') || window.location.pathname.includes('settings')) {
                window.location.href = '/auth.html#login';
            } else {
                window.location.href = '/index.html';
            }
        } catch (err) {
            console.error('Error during logout:', err);
        }
    }
};

// Bind globally for the Alpine.js header click handlers
window.logoutUser = () => AuthManager.logout();

// Start the manager
AuthManager.init();

export { AuthManager };
