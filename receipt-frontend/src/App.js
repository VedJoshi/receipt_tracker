import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './components/Login';
import Signup from './components/Signup';
import Dashboard from './components/Dashboard';
import ReceiptDetail from './components/ReceiptDetail';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

function AppContent() {
    const { user, loading } = useAuth();

    if (loading) {
        return <div className="loading-app">Loading Application...</div>;
    }

    return (
        <Routes>
            {/* Public routes */}
            <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" replace />} />
            <Route path="/signup" element={!user ? <Signup /> : <Navigate to="/dashboard" replace />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/receipt/:id" element={<ReceiptDetail />} />
            </Route>

            {/* Redirect root path */}
            <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />

            {/* 404 Page */}
            <Route path="*" element={
                <div className="not-found">
                    <h1>404 - Page Not Found</h1>
                    <p>The page you're looking for doesn't exist.</p>
                    <button onClick={() => window.location.href = '/dashboard'}>
                        Go to Dashboard
                    </button>
                </div>
            } />
        </Routes>
    );
}

function App() {
    return (
        <Router>
            <AuthProvider>
                <div className="App">
                    <AppContent />
                </div>
            </AuthProvider>
        </Router>
    );
}

export default App;