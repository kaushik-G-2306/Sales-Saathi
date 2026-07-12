import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Configuration: Fallback to hardcoded keys for buildless environments
const defaultUrl = 'https://tpmnbglgmfqiiqxdjrwa.supabase.co';
const defaultAnonKey = 'sb_publishable_fetbb8CLTLMHcM_2bRgn8Q_jQ7wlI5U';

// Safely get env vars, fallback to defaults
const supabaseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) 
    ? import.meta.env.VITE_SUPABASE_URL 
    : (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_URL ? process.env.VITE_SUPABASE_URL : defaultUrl);

const supabaseAnonKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) 
    ? import.meta.env.VITE_SUPABASE_ANON_KEY 
    : (typeof process !== 'undefined' && process.env && process.env.VITE_SUPABASE_ANON_KEY ? process.env.VITE_SUPABASE_ANON_KEY : defaultAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase initialization failed: Missing environment variables.');
}

// Create a single supabase client for interacting with your database
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const isDev = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) 
    || (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') 
    || true; // Defaulting to true for these development console logs as per requirements

if (isDev) {
  console.log('Supabase initialized successfully: Client connected.');
}

export const authHelper = {
  /**
   * Sign up a new user
   * @param {string} email
   * @param {string} password
   * @param {object} metadata - Optional user metadata (e.g., full_name)
   */
  async signUp(email, password, metadata = {}) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata
        }
      });
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error during sign up:', error.message);
      return { data: null, error };
    }
  },

  /**
   * Verify an Email OTP code
   * @param {string} email
   * @param {string} token 
   */
  async verifySignupOtp(email, token) {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup'
      });
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error during OTP verification:', error.message);
      return { data: null, error };
    }
  },

  /**
   * Log in an existing user
   * @param {string} email
   * @param {string} password
   */
  async login(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error during login:', error.message);
      return { data: null, error };
    }
  },

  /**
   * Log out the current user
   */
  async logout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('Error during logout:', error.message);
      return { error };
    }
  },

  /**
   * Get the current authenticated user
   */
  async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      return { user, error: null };
    } catch (error) {
      console.error('Error getting current user:', error.message);
      return { user: null, error };
    }
  },

  /**
   * Get the current active session
   */
  async getCurrentSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      return { session, error: null };
    } catch (error) {
      console.error('Error getting current session:', error.message);
      return { session: null, error };
    }
  }
};
