import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check initial session state
        const getInitialSession = async () => {
            const { data: { session: initialSession }, error } = await supabase.auth.getSession();
             if (error) {
                 // Silently handle error
             }
             setSession(initialSession);
             setUser(initialSession?.user ?? null);
             setLoading(false);
        };

         getInitialSession();


        // Listen for auth state changes (login, logout)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setSession(session);
                setUser(session?.user ?? null);
                // No need to set loading false here again unless needed for specific events
            }
        );

        // Cleanup subscription on unmount
        return () => {
            subscription?.unsubscribe();
        };
    }, []);

    const value = {
        signUp: (data) => supabase.auth.signUp(data),
        signIn: (data) => supabase.auth.signInWithPassword(data),
        signOut: () => supabase.auth.signOut(),
        user,
        session, // Expose session to get JWT easily
        loading,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

// Hook to use auth context
export const useAuth = () => {
    return useContext(AuthContext);
};