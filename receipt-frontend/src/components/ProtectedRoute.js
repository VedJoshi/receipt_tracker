import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../AuthContext';

function ProtectedRoute() {
    const { user, loading } = useAuth();

    if (loading) {
        // Optional: Show a loading spinner while checking auth state
        return <div>Loading...</div>;
    }

    // If finished loading and no user, redirect to login
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    // If user is logged in, render the child component (Outlet)
    return <Outlet />;
}

export default ProtectedRoute;