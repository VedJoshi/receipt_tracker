import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';


const API_URL = process.env.REACT_APP_API_GATEWAY_URL;


function Dashboard() {
    const [receipts, setReceipts] = useState([]);
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [loadingReceipts, setLoadingReceipts] = useState(false);
    const [error, setError] = useState('');
    const { user, session, signOut } = useAuth();
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
            console.log('Using API URL:', `${API_URL}/receipts`);
            console.log('Auth token:', session.access_token.substring(0, 10) + '...');
            
            const response = await axios.get(`${API_URL}/receipts`, {
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                },
            });
            console.log('Receipt fetch response:', response.data);
            setReceipts(response.data);
        } catch (err) {
            console.error("Error fetching receipts:", err);
            
            // Improved error handling
            if (err.response) {
                // The request was made and the server responded with a status code
                console.error("Response data:", err.response.data);
                console.error("Response status:", err.response.status);
                console.error("Response headers:", err.response.headers);
                setError(`Failed to fetch receipts: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
            } else if (err.request) {
                // Request was made but no response received (likely CORS issue)
                console.error("No response received:", err.request);
                setError("CORS error or no response from server. Check network tab for details.");
            } else {
                // Something happened in setting up the request
                console.error("Error message:", err.message);
                setError(`Failed to fetch receipts: ${err.message}`);
            }
            
            if (err.response?.status === 401) {
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
            setReceipts([]);
        }
    }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

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
        formData.append('receiptImage', file);

        try {
            console.log('Uploading file:', file.name, file.type, file.size);
            console.log('Using API URL:', `${API_URL}/upload`);
            
            const response = await axios.post(`${API_URL}/upload`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${session.access_token}`,
                },
            });
            console.log('Upload successful:', response.data);
            setFile(null);
            document.getElementById('receipt-upload-input').value = '';
            fetchReceipts();
        } catch (err) {
            console.error("Error uploading receipt:", err);
            
            // Improved error handling
            if (err.response) {
                console.error("Response data:", err.response.data);
                console.error("Response status:", err.response.status);
                setError(`Upload failed: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
            } else if (err.request) {
                console.error("No response received:", err.request);
                setError("CORS error or no response from server. Check network tab for details.");
            } else {
                setError(`Upload failed: ${err.message}`);
            }
            
            if (err.response?.status === 401) {
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
        navigate('/login');
    };

    if (!user) {
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
                    accept="image/*"
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
                    <li key={receipt.id} style={{ marginBottom: '30px', borderBottom: '1px solid #ccc', paddingBottom: '20px' }}>
                        <p><strong>Uploaded:</strong> {new Date(receipt.created_at).toLocaleString()}</p>
                        
                        {receipt.presigned_url ? (
                            <div>
                                <p><strong>Receipt Image:</strong></p>
                                <img 
                                    src={receipt.presigned_url} 
                                    alt="Receipt" 
                                    style={{ maxWidth: '100%', maxHeight: '300px' }} 
                                />
                            </div>
                        ) : (
                            <p><strong>Image URL:</strong> {receipt.image_url} (No pre-signed URL available)</p>
                        )}
                        
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