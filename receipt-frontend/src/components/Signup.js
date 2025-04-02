import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';

function Signup() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const { signUp } = useAuth();
     const navigate = useNavigate();

    const handleSignup = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);
        try {
            const { error: signUpError, data } = await signUp({ email, password });
            if (signUpError) throw signUpError;
            // Check if user needs email confirmation
            if (data?.user && data.user.identities && data.user.identities.length === 0) {
                setMessage('Signup successful! Please check your email to confirm your account.');
            } else if (data?.user) {
                setMessage('Signup successful! You can now log in.');
                navigate('/login'); // Or maybe directly to dashboard if auto-confirmed
            } else {
                setMessage('Signup successful! Please check your email for verification.'); // Generic message
            }
        } catch (err) {
            setError(err.message || 'Failed to sign up');
             console.error("Signup error:", err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h2>Sign Up</h2>
            {error && <p style={{ color: 'red' }}>{error}</p>}
            {message && <p style={{ color: 'green' }}>{message}</p>}
            <form onSubmit={handleSignup}>
                <div>
                    <label>Email:</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div>
                    <label>Password:</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <button type="submit" disabled={loading}>
                    {loading ? 'Signing up...' : 'Sign Up'}
                </button>
            </form>
             <p>Already have an account? <button onClick={() => navigate('/login')}>Log In</button></p>
        </div>
    );
}

export default Signup;