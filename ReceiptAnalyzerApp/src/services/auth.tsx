import { supabase } from '../lib/supabase';

export type AuthError = {
  message: string;
};

export const authService = {
  // Sign up a new user
  signUp: async (email: string, password: string) => {
    try {
      const { data: { user }, error } = await supabase.auth.signUp({
        email,
        password,
      });
      
      if (error) throw error;
      
      // If signup is successful, create a user profile in your database
      if (user) {
        await supabase
          .from('user_profiles')
          .insert([
            { 
              user_id: user.id,
              email: user.email,
              created_at: new Date(),
            }
          ]);
      }
      
      return { user, error: null };
    } catch (error) {
      return { user: null, error };
    }
  },

  // Sign in an existing user
  signIn: async (email: string, password: string) => {
    try {
      const { data: { user }, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) throw error;
      
      return { user, error: null };
    } catch (error) {
      return { user: null, error };
    }
  },

  // Sign out the current user
  signOut: async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error };
    }
  },

  // Get the current user session
  getSession: async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      return { session, error: null };
    } catch (error) {
      return { session: null, error };
    }
  },
};