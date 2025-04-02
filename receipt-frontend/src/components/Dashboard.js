import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_GATEWAY_URL;
// Use Vite env vars if applicable:
// const API_URL = import.meta.env.VITE_API_GATEWAY_URL;


function Dashboard() {
    const [receipts, setReceipts] = useState([]);
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [loadingReceipts, setLoadingReceipts] = useState(false);
    const [error, setError] = useState('');
    const { user, session, signOut } = useAuth(); // Get session for JWT
    const navigate = useNavigate();

    // --- Fetch Receipts ---
    const fetchReceipts = async () => {
        setError('');
        setLoadingReceipts(true);
        if (!session) {
            setError("Not authenticated");
            setLoadingReceipts(false);
            return;
        }
        try {
            const response = await axios.get(`${API_URL}/receipts`, {
                headers: {
                    Authorization: `Bearer ${session.access_token}`, // Send JWT
                },
            });
            setReceipts(response.data);
        } catch (err) {
            console.error("Error fetching receipts:", err.response?.data || err.message);
            setError(err.response?.data?.message || 'Failed to fetch receipts');
            if (err.response?.status === 401) {
                // Handle unauthorized, maybe force logout
                signOut();
                navigate('/login');
            }
        } finally {
            setLoadingReceipts(false);
        }
    };

    // Fetch receipts on component mount and when session changes
    useEffect(() => {
        if (session) {
            fetchReceipts();
        } else {
            // If no session, clear receipts and potentially redirect
            setReceipts([]);
            // navigate('/login'); // Optional: Force redirect if session lost
        }
         // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session]); // Re-run when session changes

    // --- Handle File Upload ---
    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file || !session) {
            setError("Please select a file and ensure you are logged in.");
            return;
        }
        setError('');
        setUploading(true);

        const formData = new FormData();
        formData.append('receiptImage', file); // Name must match backend expectation

        try {
            const response = await axios.post(`${API_URL}/upload`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${session.access_token}`, // Send JWT
                },
            });
            console.log('Upload successful:', response.data);
            setFile(null); // Clear file input
            document.getElementById('receipt-upload-input').value = ''; // Reset file input visually
            // Add the new receipt to the top of the list (optimistic update or re-fetch)
            // Option 1: Add directly (simple)
            // setReceipts([response.data.receipt, ...receipts]);
            // Option 2: Re-fetch the list to be sure
             fetchReceipts();
        } catch (err) {
            console.error("Error uploading receipt:", err.response?.data || err.message);
            setError(err.response?.data?.message || 'Upload failed');
              if (err.response?.status === 401) {
                // Handle unauthorized, maybe force logout
                signOut();
                navigate('/login');
            }
        } finally {
            setUploading(false);
        }
    };

    // --- Handle Logout ---
     const handleLogout = async () => {
         await signOut();
         navigate('/login'); // Redirect to login after sign out
     };

    if (!user) {
        // Should be handled by ProtectedRoute, but good as a fallback
        return <p>Loading user or redirecting...</p>;
    }

    return (
        <div>
            <h2>Dashboard</h2>
            <p>Welcome, {user.email}!</p>
             <button onClick={handleLogout}>Log Out</button>

            <hr />

            <h3>Upload New Receipt</h3>
            <form onSubmit={handleUpload}>
                <input
                    id="receipt-upload-input"
                    type="file"
                    accept="image/*" // Accept common image types
                    onChange={handleFileChange}
                    required
                />
                <button type="submit" disabled={uploading || !file}>
                    {uploading ? 'Uploading...' : 'Upload Receipt'}
                </button>
            </form>

            {error && <p style={{ color: 'red' }}>Error: {error}</p>}

            <hr />

            <h3>Your Receipts</h3>
            {loadingReceipts && <p>Loading receipts...</p>}
            {!loadingReceipts && receipts.length === 0 && <p>No receipts found.</p>}
            <ul>
                {receipts.map((receipt) => (
                    <li key={receipt.id}>
                        <p><strong>Uploaded:</strong> {new Date(receipt.created_at).toLocaleString()}</p>
                        {/* Displaying S3 URI - In reality, you'd generate a presigned URL to view */}
                        <p><strong>Image:</strong> {receipt.image_url} (Need pre-signed URL to view)</p>
                        <p><strong>Extracted Text:</strong></p>
                        <pre style={{ background: '#f4f4f4', padding: '10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {receipt.extracted_text || '(No text extracted)'}
                        </pre>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default Dashboard;