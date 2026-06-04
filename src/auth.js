import { supabase, isSupabaseConfigured, db } from './db.js';

// Set VITE_DEBUG_MODE=true in .env to enable verbose console output during development.
const DEBUG = import.meta.env.VITE_DEBUG_MODE === 'true';

const authStore = {
        isLoggedIn: false,
        user: null,
        loading: true,

        async init() {
            this.loading = true;
            if (isSupabaseConfigured) {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    await this.handleSession(session);
                }
                
                supabase.auth.onAuthStateChange(async (event, session) => {
                    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                        await this.handleSession(session);
                    } else if (event === 'SIGNED_OUT') {
                        this.clearSession();
                    }
                });
            } else {
                // Mock Session
                const mockSession = localStorage.getItem('sales_saathi_mock_session');
                if (mockSession) {
                    this.user = JSON.parse(mockSession);
                    this.isLoggedIn = true;
                }
            }
            this.loading = false;
            
            // Route Protection
            const path = window.location.pathname;
            const isProtectedPage = path.includes('dashboard') || path.includes('brief-') || path.includes('settings') || path.includes('onboarding');
            
            // Check if URL has Supabase auth fragments (Magic Link or OAuth callback)
            const isAuthCallback = window.location.hash.includes('access_token=') || 
                                   window.location.hash.includes('error=') ||
                                   window.location.search.includes('code=');
            
            if (!this.isLoggedIn && isProtectedPage && !isAuthCallback) {
                window.location.href = 'auth.html';
            }
        },

        async handleSession(session) {
            this.isLoggedIn = true;
            // Fetch or create user record in our DB
            let userRecord = await db.getUser(session.user.id);
            if (!userRecord) {
                // Should have been created during signup, but fallback
                try {
                    userRecord = await db.createUser({
                        id: session.user.id,
                        email: session.user.email,
                        name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
                        auth_provider: session.user.app_metadata?.provider || 'email',
                        plan: 'Free Trial'
                    });
                } catch(dbErr) {
                    // DB insert failed (e.g. RLS policy). Build user object from session directly.
                    console.warn('DB createUser failed, using session data:', dbErr.message);
                    userRecord = {
                        id: session.user.id,
                        email: session.user.email,
                        name: session.user.user_metadata?.full_name || session.user.email.split('@')[0],
                        auth_provider: session.user.app_metadata?.provider || 'email',
                        plan: 'Free Trial'
                    };
                }
            }
            // Ensure name is always populated even if DB record has empty name
            if (!userRecord.name) {
                userRecord.name = session.user.user_metadata?.full_name || session.user.email.split('@')[0];
            }
            this.user = userRecord;
            
            // If user is on a public auth page and successfully logged in, redirect to dashboard
            if (window.location.pathname.endsWith('auth.html') || window.location.pathname === '/' || window.location.pathname.endsWith('index.html')) {
                // Prevent infinite redirect loops if we are already headed to the dashboard
                if (window.location.pathname !== '/dashboard.html' && !window.location.pathname.endsWith('dashboard.html')) {
                    window.location.href = 'dashboard.html';
                }
            }
        },

        clearSession() {
            this.isLoggedIn = false;
            this.user = null;
            if (!isSupabaseConfigured) {
                localStorage.removeItem('sales_saathi_mock_session');
            }
            // Redirect to home or login if not already there
            if (!window.location.pathname.endsWith('auth.html') && !window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
                window.location.href = 'auth.html';
            }
        },

        async signUpEmail(name, email, password) {
            if (isSupabaseConfigured) {
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { 
                        data: { full_name: name },
                        emailRedirectTo: window.location.origin + '/onboarding.html'
                    }
                });
                if (error) throw error;
                // Note: Supabase will require email verification by default.
                // We create the user record after they confirm, or we can create it now.
                if (data.user && data.session) {
                    await db.createUser({
                        id: data.user.id,
                        email: email,
                        name: name,
                        auth_provider: 'email',
                        plan: 'Free Trial'
                    });
                }
                return data;
            } else {
                // Mock Flow
                const existing = (JSON.parse(localStorage.getItem('sales_saathi_mock_db'))?.users || []).find(u => u.email === email);
                if (existing) throw new Error('User already exists');
                
                const mockUserId = 'mock-' + Date.now();
                const newUser = await db.createUser({
                    id: mockUserId,
                    email,
                    name,
                    auth_provider: 'email',
                    plan: 'Free Trial'
                });
                // Simulate login
                localStorage.setItem('sales_saathi_mock_session', JSON.stringify(newUser));
                this.user = newUser;
                this.isLoggedIn = true;
                return { user: newUser, session: true };
            }
        },

        async signInEmail(email, password) {
            if (isSupabaseConfigured) {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                return data;
            } else {
                // Mock Flow
                const users = JSON.parse(localStorage.getItem('sales_saathi_mock_db'))?.users || [];
                const user = users.find(u => u.email === email);
                if (!user) throw new Error('Invalid login credentials');
                // No actual password check in mock
                localStorage.setItem('sales_saathi_mock_session', JSON.stringify(user));
                this.user = user;
                this.isLoggedIn = true;
                return { user, session: true };
            }
        },

        async signInOTP(email) {
            if (isSupabaseConfigured) {
                const { error } = await supabase.auth.signInWithOtp({ 
                    email,
                    options: {
                        emailRedirectTo: window.location.origin + '/dashboard.html'
                    }
                });
                if (error) throw error;
            } else {
                // Mock Flow
                if (DEBUG) console.log("[DEBUG] Mock OTP sent to " + email);
                return true;
            }
        },

        async verifyOTP(email, token) {
            if (isSupabaseConfigured) {
                const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'magiclink' });
                if (error) throw error;
                // If it creates a new user, we might need to sync DB, but handleSession does it on auth change
                return data;
            } else {
                // Mock Flow
                let users = JSON.parse(localStorage.getItem('sales_saathi_mock_db'))?.users || [];
                let user = users.find(u => u.email === email);
                if (!user) {
                    user = await db.createUser({
                        id: 'mock-otp-' + Date.now(),
                        email,
                        name: email.split('@')[0],
                        auth_provider: 'email_otp',
                        plan: 'Free Trial'
                    });
                }
                localStorage.setItem('sales_saathi_mock_session', JSON.stringify(user));
                this.user = user;
                this.isLoggedIn = true;
                return { user, session: true };
            }
        },

        async signInGoogle() {
            if (isSupabaseConfigured) {
                const { error } = await supabase.auth.signInWithOAuth({ 
                    provider: 'google',
                    options: {
                        redirectTo: window.location.origin + '/dashboard.html'
                    }
                });
                if (error) throw error;
            } else {
                // Mock Flow
                const email = 'demo@google.com';
                let users = JSON.parse(localStorage.getItem('sales_saathi_mock_db'))?.users || [];
                let user = users.find(u => u.email === email);
                if (!user) {
                    user = await db.createUser({
                        id: 'mock-google-' + Date.now(),
                        email,
                        name: 'Google User',
                        auth_provider: 'google',
                        plan: 'Free Trial'
                    });
                }
                localStorage.setItem('sales_saathi_mock_session', JSON.stringify(user));
                this.user = user;
                this.isLoggedIn = true;
                // Fake redirect reload
                setTimeout(() => window.location.href = 'dashboard.html', 500);
            }
        },

    async signOut() {
        if (isSupabaseConfigured) {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
        } else {
            this.clearSession();
            window.location.href = 'auth.html';
        }
    }
};

if (window.Alpine) {
    Alpine.store('auth', authStore);
    Alpine.store('auth').init();
} else {
    document.addEventListener('alpine:init', () => {
        Alpine.store('auth', authStore);
        Alpine.store('auth').init();
    });
}
