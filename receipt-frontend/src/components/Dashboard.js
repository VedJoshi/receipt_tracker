// receipt-frontend/src/components/Dashboard.js
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

        try {
            console.log('Uploading file:', file.name, file.type, file.size);
            
            // Convert file to base64
            const reader = new FileReader();
            reader.onloadend = async () => {
                try {
                    const base64data = reader.result;
                    
                    // Send to API Gateway endpoint
                    const response = await axios.post(
                        process.env.REACT_APP_API_GATEWAY_URL + '/upload',
                        { image: base64data },
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${session.access_token}`
                            }
                        }
                    );
                    
                    console.log('Upload successful:', response.data);
                    setFile(null);
                    document.getElementById('receipt-upload-input').value = '';
                    fetchReceipts();
                } catch (err) {
                    handleError(err);
                } finally {
                    setUploading(false);
                }
            };
            reader.readAsDataURL(file);
        } catch (err) {
            handleError(err);
            setUploading(false);
        }
    };

    // Helper function to handle errors
    const handleError = (err) => {
        console.error("Error uploading receipt:", err);
        
        if (err.response) {
            console.error("Response data:", err.response.data);
            console.error("Response status:", err.response.status);
            setError(`Upload failed: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
        } else if (err.request) {
            console.error("No response received:", err.request);
            setError("Network error. Check your connection and try again.");
        } else {
            setError(`Upload failed: ${err.message}`);
        }
        
        if (err.response?.status === 401) {
            signOut();
            navigate('/login');
        }
    };

    // --- Handle Logout ---
    const handleLogout = async () => {
        await signOut();
        navigate('/login');
    };

    // Helper function to format currency
    const formatCurrency = (amount) => {
        if (amount === null || amount === undefined) return 'N/A';
        return `$${parseFloat(amount).toFixed(2)}`;
    };

    // Helper function to format date
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        
        // Handle different date formats
        let formattedDate;
        if (dateString.includes('/')) {
            // MM/DD/YYYY format
            const parts = dateString.split('/');
            if (parts.length === 3) {
                formattedDate = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
            } else {
                return dateString; // Return as-is if not in expected format
            }
        } else {
            // ISO or other format
            formattedDate = new Date(dateString);
        }
        
        // Check if date is valid
        if (isNaN(formattedDate.getTime())) {
            return dateString; // Return as-is if not a valid date
        }
        
        return formattedDate.toLocaleDateString();
    };

    if (!user) {
        return <p>Loading user or redirecting...</p>;
    }

    return (
        <div className="dashboard-container" style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
            <h2>Receipt Scanner Dashboard</h2>
            <p>Welcome, {user.email}!</p>
            <button 
                onClick={handleLogout}
                style={{ 
                    backgroundColor: '#f44336', 
                    color: 'white', 
                    padding: '8px 16px', 
                    border: 'none', 
                    borderRadius: '4px',
                    cursor: 'pointer' 
                }}
            >
                Log Out
            </button>

            <div style={{ margin: '30px 0', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <h3>Upload New Receipt</h3>
                <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                        <input
                            id="receipt-upload-input"
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            required
                            style={{ marginBottom: '10px' }}
                        />
                        <p style={{ fontSize: '0.8rem', color: '#666' }}>
                            Upload a clear image of your receipt for best text extraction results
                        </p>
                    </div>
                    <button 
                        type="submit" 
                        disabled={uploading || !file}
                        style={{ 
                            backgroundColor: '#4CAF50', 
                            color: 'white', 
                            padding: '10px', 
                            border: 'none', 
                            borderRadius: '4px',
                            cursor: uploading || !file ? 'not-allowed' : 'pointer',
                            opacity: uploading || !file ? 0.7 : 1
                        }}
                    >
                        {uploading ? 'Processing Receipt...' : 'Upload & Process Receipt'}
                    </button>
                </form>
            </div>

            {error && (
                <div style={{ color: 'red', padding: '10px', backgroundColor: '#ffebee', borderRadius: '4px', marginBottom: '20px' }}>
                    Error: {error}
                </div>
            )}

            <h3>Your Receipts</h3>
            {loadingReceipts && <p>Loading receipts...</p>}
            {!loadingReceipts && receipts.length === 0 && <p>No receipts found. Upload your first receipt to get started!</p>}
            
            <div className="receipts-list">
                {receipts.map((receipt) => (
                    <div 
                        key={receipt.id} 
                        className="receipt-card"
                        style={{ 
                            marginBottom: '30px', 
                            border: '1px solid #ddd', 
                            borderRadius: '8px',
                            padding: '20px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                            <div>
                                <h4 style={{ margin: '0 0 5px 0' }}>
                                    {receipt.store_name || 'Unknown Store'}
                                </h4>
                                <p style={{ margin: '0', color: '#666' }}>
                                    <strong>Date:</strong> {formatDate(receipt.purchase_date)}
                                </p>
                                <p style={{ margin: '5px 0 0 0', color: '#666' }}>
                                    <strong>Uploaded:</strong> {new Date(receipt.created_at).toLocaleString()}
                                </p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <p style={{ margin: '0', fontSize: '1.2rem', fontWeight: 'bold' }}>
                                    {formatCurrency(receipt.total_amount)}
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                            {/* Receipt Image */}
                            <div style={{ flex: '1 1 300px' }}>
                                <h5>Receipt Image</h5>
                                {receipt.presigned_url ? (
                                    <img 
                                        src={receipt.presigned_url} 
                                        alt="Receipt" 
                                        style={{ maxWidth: '100%', maxHeight: '300px', border: '1px solid #ddd' }} 
                                    />
                                ) : (
                                    <p>No image available</p>
                                )}
                            </div>
                            
                            {/* Extracted Data */}
                            <div style={{ flex: '1 1 300px' }}>
                                <h5>Extracted Data</h5>
                                <div style={{ backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
                                    {receipt.items && receipt.items.length > 0 ? (
                                        <div>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' }}>Item</th>
                                                        <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #ddd' }}>Price</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {receipt.items.map((item, index) => (
                                                        <tr key={index}>
                                                            <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{item.name}</td>
                                                            <td style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #eee' }}>
                                                                {formatCurrency(item.price)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr>
                                                        <td style={{ padding: '8px', fontWeight: 'bold' }}>Total</td>
                                                        <td style={{ textAlign: 'right', padding: '8px', fontWeight: 'bold' }}>
                                                            {formatCurrency(receipt.total_amount)}
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    ) : (
                                        <div>
                                            <p><strong>Store:</strong> {receipt.store_name || 'Unknown'}</p>
                                            <p><strong>Total:</strong> {formatCurrency(receipt.total_amount)}</p>
                                            <p><strong>Date:</strong> {formatDate(receipt.purchase_date)}</p>
                                            <p><strong>Raw Text:</strong></p>
                                            <pre style={{ 
                                                whiteSpace: 'pre-wrap', 
                                                wordBreak: 'break-word',
                                                backgroundColor: '#eee',
                                                padding: '8px',
                                                fontSize: '0.85rem',
                                                maxHeight: '200px',
                                                overflow: 'auto'
                                            }}>
                                                {receipt.extracted_text || '(No text extracted)'}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Dashboard;