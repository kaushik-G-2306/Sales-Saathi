import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = supabaseUrl !== '' && supabaseAnonKey !== '';

export const supabase = isSupabaseConfigured 
    ? createClient(supabaseUrl, supabaseAnonKey) 
    : null;

// Mock Local Storage DB if Supabase isn't configured
const MOCK_DB_KEY = 'sales_saathi_mock_db';

function getMockDb() {
    const raw = localStorage.getItem(MOCK_DB_KEY);
    if (raw) return JSON.parse(raw);
    return {
        users: [],
        briefs: []
    };
}

function saveMockDb(data) {
    localStorage.setItem(MOCK_DB_KEY, JSON.stringify(data));
}

// Generate UUID v4 for mock
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// --- DB Abstraction Layer ---

export const db = {
    async createUser(userData) {
        if (isSupabaseConfigured) {
            const { data, error } = await supabase.from('Users').insert([userData]).select().single();
            if (error) throw error;
            return data;
        } else {
            const db = getMockDb();
            const newUser = { id: uuidv4(), created_at: new Date().toISOString(), ...userData };
            db.users.push(newUser);
            saveMockDb(db);
            return newUser;
        }
    },
    
    async getUser(id) {
        if (isSupabaseConfigured) {
            const { data, error } = await supabase.from('Users').select('*').eq('id', id).single();
            if (error) return null;
            return data;
        } else {
            const db = getMockDb();
            return db.users.find(u => u.id === id) || null;
        }
    },

    async updateUser(id, updates) {
        if (isSupabaseConfigured) {
            const { data, error } = await supabase.from('Users').update(updates).eq('id', id).select().single();
            if (error) throw error;
            return data;
        } else {
            const db = getMockDb();
            const index = db.users.findIndex(u => u.id === id);
            if (index > -1) {
                db.users[index] = { ...db.users[index], ...updates };
                saveMockDb(db);
                return db.users[index];
            }
            throw new Error('User not found');
        }
    },

    async createBrief(briefData) {
        if (isSupabaseConfigured) {
            const { data, error } = await supabase.from('PreMeetingBriefs').insert([briefData]).select().single();
            if (error) throw error;
            return data;
        } else {
            const db = getMockDb();
            const newBrief = { id: uuidv4(), created_at: new Date().toISOString(), status: 'generating', ...briefData };
            db.briefs.unshift(newBrief); // add to top
            saveMockDb(db);
            return newBrief;
        }
    },

    async updateBrief(id, updates) {
        if (isSupabaseConfigured) {
            const { data, error } = await supabase.from('PreMeetingBriefs').update(updates).eq('id', id).select().single();
            if (error) throw error;
            return data;
        } else {
            const db = getMockDb();
            const index = db.briefs.findIndex(b => b.id === id);
            if (index > -1) {
                db.briefs[index] = { ...db.briefs[index], ...updates };
                saveMockDb(db);
                return db.briefs[index];
            }
            throw new Error('Brief not found');
        }
    },

    async getUserBriefs(userId) {
        if (isSupabaseConfigured) {
            const { data, error } = await supabase.from('PreMeetingBriefs').select('*').eq('user_id', userId).order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        } else {
            const db = getMockDb();
            return db.briefs.filter(b => b.user_id === userId).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        }
    },

    async getBrief(id) {
        if (isSupabaseConfigured) {
            const { data, error } = await supabase.from('PreMeetingBriefs').select('*').eq('id', id).single();
            if (error) throw error;
            return data;
        } else {
            const db = getMockDb();
            return db.briefs.find(b => b.id === id) || null;
        }
    },

    async deleteBrief(id) {
        if (isSupabaseConfigured) {
            const { error } = await supabase.from('PreMeetingBriefs').delete().eq('id', id);
            if (error) throw error;
        } else {
            const db = getMockDb();
            db.briefs = db.briefs.filter(b => b.id !== id);
            saveMockDb(db);
        }
    }
};

window.db = db;
window.supabase = supabase;
window.isSupabaseConfigured = isSupabaseConfigured;
