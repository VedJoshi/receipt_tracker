import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './components/Login';
import Signup from './components/Signup';
import Dashboard from './components/Dashboard';
import ProtectedRoute from './components/ProtectedRoute'; // Import ProtectedRoute
import './App.css'; // Or your preferred styling

function AppContent() {
    const { user, loading } = useAuth(); // Get user state to redirect if already logged in

    if (loading) {
        return <div>Loading Application...</div>; // Prevent rendering routes before auth check is complete
    }

    return (
        <Routes>
            {/* Public routes */}
            <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" replace />} />
            <Route path="/signup" element={!user ? <Signup /> : <Navigate to="/dashboard" replace />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
                 {/* All routes within here require authentication */}
                <Route path="/dashboard" element={<Dashboard />} />
                {/* Add other protected routes here */}
            </Route>

             {/* Redirect root path */}
             {/* If logged in, go to dashboard, otherwise go to login */}
             <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />

             {/* Optional: Catch-all 404 */}
            <Route path="*" element={<div>404 Not Found</div>} />
        </Routes>
    );
}

function App() {
    return (
        <Router>
            <AuthProvider> {/* Wrap everything in AuthProvider */}
                 <div className="App">
                    <h1>Receipt Scanner App</h1>
                    <AppContent /> {/* Render routes */}
                 </div>
            </AuthProvider>
        </Router>
    );
}

export default App;