import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { signIn } = useAuth();
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const { error: signInError } = await signIn({ email, password });
            if (signInError) throw signInError;
            navigate('/dashboard'); // Redirect to dashboard on successful login
        } catch (err) {
            setError(err.message || 'Failed to log in');
            console.error("Login error:", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h2>Login</h2>
            {error && <p style={{ color: 'red' }}>{error}</p>}
            <form onSubmit={handleLogin}>
                <div>
                    <label>Email:</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                    <label>Password:</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <button type="submit" disabled={loading}>
                    {loading ? 'Logging in...' : 'Log In'}
                </button>
            </form>
            <p>Don't have an account? <button onClick={() => navigate('/signup')}>Sign Up</button></p>
        </div>
    );
}

export default Login;