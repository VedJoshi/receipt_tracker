import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../AuthContext';
import './Dashboard.css';

const API_URL = process.env.REACT_APP_API_GATEWAY_URL;

function Dashboard() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, session, signOut } = useAuth();
    
    // State management
    const [receipts, setReceipts] = useState([]);
    const [filteredReceipts, setFilteredReceipts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [file, setFile] = useState(null);
    
    // View and filter states
    const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'table'
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [sortBy, setSortBy] = useState('date-desc');
    const [selectedReceipts, setSelectedReceipts] = useState([]);
    const [showBulkActions, setShowBulkActions] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    
    // Statistics
    const [stats, setStats] = useState({
        totalReceipts: 0,
        totalAmount: 0,
        monthlyAmount: 0,
        categoryCounts: {}
    });

    // Fetch data on mount
    useEffect(() => {
        fetchReceipts();
        fetchCategories();
    }, [session]);

    // Update filtered receipts when filters change
    useEffect(() => {
        applyFilters();
    }, [receipts, searchTerm, selectedCategory, sortBy]);

    // Calculate statistics
    useEffect(() => {
        calculateStats();
    }, [receipts]);

    // Toggle bulk actions visibility
    useEffect(() => {
        setShowBulkActions(selectedReceipts.length > 0);
    }, [selectedReceipts]);

    // Handle navigation state messages
    useEffect(() => {
        if (location.state?.message) {
            // You could show a toast notification here
            console.log(location.state.message);
            
            // Clear the state after showing the message
            navigate(location.pathname, { replace: true });
        }
        
        if (location.state?.refresh) {
            // Force refresh the receipts
            fetchReceipts();
        }
    }, [location.state]);

    const fetchReceipts = async () => {
        setError('');
        setLoading(true);
        
        try {
            const response = await axios.get(`${API_URL}/receipts`, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });
            setReceipts(response.data);
        } catch (err) {
            console.error('Error fetching receipts:', err);
            setError('Failed to fetch receipts');
            if (err.response?.status === 401) {
                signOut();
                navigate('/login');
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchCategories = async () => {
        try {
            const response = await axios.get(`${API_URL}/categories`, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });
            setCategories(response.data);
        } catch (err) {
            console.error('Error fetching categories:', err);
        }
    };

    const applyFilters = () => {
        let filtered = [...receipts];

        // Search filter
        if (searchTerm) {
            filtered = filtered.filter(receipt => 
                receipt.store_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                receipt.items?.some(item => 
                    item.name.toLowerCase().includes(searchTerm.toLowerCase())
                ) ||
                receipt.extracted_text?.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Category filter
        if (selectedCategory) {
            filtered = filtered.filter(receipt => receipt.category === selectedCategory);
        }

        // Sort
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'date-desc':
                    return new Date(b.created_at) - new Date(a.created_at);
                case 'date-asc':
                    return new Date(a.created_at) - new Date(b.created_at);
                case 'amount-desc':
                    return (b.total_amount || 0) - (a.total_amount || 0);
                case 'amount-asc':
                    return (a.total_amount || 0) - (b.total_amount || 0);
                case 'store':
                    return (a.store_name || '').localeCompare(b.store_name || '');
                default:
                    return 0;
            }
        });

        setFilteredReceipts(filtered);
    };

    const calculateStats = () => {
        const total = receipts.reduce((sum, r) => sum + (r.total_amount || 0), 0);
        
        // Calculate monthly amount (current month)
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const monthlyReceipts = receipts.filter(r => {
            const date = new Date(r.created_at);
            return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
        });
        const monthly = monthlyReceipts.reduce((sum, r) => sum + (r.total_amount || 0), 0);

        // Category counts
        const categoryCounts = {};
        receipts.forEach(r => {
            const cat = r.category || 'Uncategorized';
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });

        setStats({
            totalReceipts: receipts.length,
            totalAmount: total,
            monthlyAmount: monthly,
            categoryCounts
        });
    };

    // File upload handlers
    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    // Add this debug version to your Dashboard.js handleUpload function

    const handleUpload = async (e) => {
        console.log('API_URL:', process.env.REACT_APP_API_GATEWAY_URL);
        console.log('Full upload URL:', `${API_URL}/upload`);
        e.preventDefault();
        if (!file) return;

        setError('');
        setUploading(true);

        console.log('=== MULTIPART UPLOAD DEBUG ===');
        console.log('File size:', file.size);
        console.log('File type:', file.type);

        try {
            // Use FormData for multipart upload instead of base64
            const formData = new FormData();
            formData.append('receiptImage', file);

            console.log('Sending multipart upload...');
            
            const response = await axios.post(
                `${API_URL}/upload`,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    timeout: 60000,
                    onUploadProgress: (progressEvent) => {
                        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        console.log('Upload progress:', progress + '%');
                    }
                }
            );
            
            console.log('Upload successful!', response.status);
            setFile(null);
            document.getElementById('receipt-upload-input').value = '';
            
            if (response.data.receipt?.processing_status === 'failed') {
                setError('Receipt uploaded but OCR processing failed. You can edit it manually.');
            }
            
            fetchReceipts();
            
        } catch (err) {
            console.error('=== MULTIPART UPLOAD ERROR ===');
            console.error('Error:', err.message);
            console.error('Status:', err.response?.status);
            console.error('Response:', err.response?.data);
            
            setError(err.response?.data?.message || `Upload failed: ${err.message}`);
        } finally {
            setUploading(false);
        }
    };

    // Receipt actions
    const handleReceiptClick = (receiptId) => {
        navigate(`/receipt/${receiptId}`);
    };

    const handleQuickCategoryChange = async (receiptId, category) => {
        try {
            await axios.put(
                `${API_URL}/receipts/${receiptId}`,
                { category },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    }
                }
            );
            
            // Update local state
            setReceipts(receipts.map(r => 
                r.id === receiptId ? { ...r, category } : r
            ));
        } catch (err) {
            console.error('Error updating category:', err);
            setError('Failed to update category');
        }
    };

    const handleSelectReceipt = (receiptId) => {
        setSelectedReceipts(prev => 
            prev.includes(receiptId) 
                ? prev.filter(id => id !== receiptId)
                : [...prev, receiptId]
        );
    };

    const handleSelectAll = () => {
        if (selectedReceipts.length === filteredReceipts.length) {
            setSelectedReceipts([]);
        } else {
            setSelectedReceipts(filteredReceipts.map(r => r.id));
        }
    };

    const handleBulkDelete = async () => {
        try {
            setError('');
            
            const response = await axios.post(
                `${API_URL}/receipts/bulk-delete`,
                { receiptIds: selectedReceipts },
                {
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}` 
                    }
                }
            );
            
            console.log('Bulk delete response:', response.data);
            
            setSelectedReceipts([]);
            setShowDeleteConfirm(false);
            
            // Immediately refresh receipts after deletion
            await fetchReceipts();
            
        } catch (err) {
            console.error('Error bulk deleting receipts:', err);
            setError(`Failed to delete receipts: ${err.response?.data?.message || err.message}`);
            setShowDeleteConfirm(false);
        }
    };

    const handleBulkCategorize = async (category) => {
        try {
            await Promise.all(
                selectedReceipts.map(id =>
                    axios.put(
                        `${API_URL}/receipts/${id}`,
                        { category },
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${session.access_token}`
                            }
                        }
                    )
                )
            );
            
            setSelectedReceipts([]);
            fetchReceipts();
        } catch (err) {
            console.error('Error categorizing receipts:', err);
            setError('Failed to categorize some receipts');
        }
    };

    const handleLogout = async () => {
        await signOut();
        navigate('/login');
    };

    // Helper functions
    const formatCurrency = (amount) => {
        if (amount === null || amount === undefined) return 'N/A';
        return `${parseFloat(amount).toFixed(2)}`;
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            return new Date(dateString).toLocaleDateString();
        } catch {
            return dateString;
        }
    };

    const getStatusBadge = (receipt) => {
        if (receipt.processing_status === 'failed') {
            return <span className="badge badge-error">OCR Failed</span>;
        }
        if (receipt.is_manually_edited) {
            return <span className="badge badge-edited">Edited</span>;
        }
        if (receipt.confidence_score && receipt.confidence_score < 0.7) {
            return <span className="badge badge-warning">Low Confidence</span>;
        }
        return <span className="badge badge-success">Processed</span>;
    };

    return (
        <div className="enhanced-dashboard">
            {/* Header */}
            <div className="dashboard-header">
                <div>
                    <h1>ReceiptIQ</h1>
                    <p>Welcome, {user?.email}, Digitize and organize your receipts</p>
                </div>
                <button onClick={handleLogout} className="logout-button">
                    Log Out
                </button>
            </div>

            {/* Statistics */}
            <div className="stats-container">
                <div className="stat-card">
                    <h3>Total Receipts</h3>
                    <p className="stat-value">{stats.totalReceipts}</p>
                </div>
                <div className="stat-card">
                    <h3>Total Amount</h3>
                    <p className="stat-value">{formatCurrency(stats.totalAmount)}</p>
                </div>
                <div className="stat-card">
                    <h3>This Month</h3>
                    <p className="stat-value">{formatCurrency(stats.monthlyAmount)}</p>
                </div>
                <div className="stat-card">
                    <h3>Categories</h3>
                    <p className="stat-value">{Object.keys(stats.categoryCounts).length}</p>
                </div>
            </div>

            {/* Upload Section - Simplified */}
            <div className="upload-section">
                <h2>Upload New Receipt</h2>
                <form onSubmit={handleUpload} className="upload-form">
                    <input
                        id="receipt-upload-input"
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        required
                        disabled={uploading}
                    />
                    <button 
                        type="submit" 
                        disabled={uploading || !file} 
                        className={`upload-button ${uploading ? 'processing' : ''}`}
                    >
                        {uploading ? 'Processing...' : 'Upload & Process'}
                    </button>
                </form>
                {uploading && (
                    <div className="simple-loading">
                        <div className="spinner"></div>
                        <span>Processing your receipt...</span>
                    </div>
                )}
            </div>

            {error && (
                <div className="error-message">
                    {error}
                </div>
            )}

            {/* Filters and Controls */}
            <div className="controls-section">
                <div className="filters">
                    <input
                        type="text"
                        placeholder="Search receipts..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                    
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="filter-select"
                    >
                        <option value="">All Categories</option>
                        {categories.map(cat => (
                            <option key={cat.id} value={cat.name}>{cat.name}</option>
                        ))}
                    </select>
                    
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="filter-select"
                    >
                        <option value="date-desc">Newest First</option>
                        <option value="date-asc">Oldest First</option>
                        <option value="amount-desc">Highest Amount</option>
                        <option value="amount-asc">Lowest Amount</option>
                        <option value="store">Store Name</option>
                    </select>
                </div>
                
                <div className="view-controls">
                    <button
                        onClick={() => setViewMode('cards')}
                        className={`view-button ${viewMode === 'cards' ? 'active' : ''}`}
                    >
                        Cards
                    </button>
                    <button
                        onClick={() => setViewMode('table')}
                        className={`view-button ${viewMode === 'table' ? 'active' : ''}`}
                    >
                        Table
                    </button>
                </div>
            </div>

            {/* Bulk Actions */}
            {showBulkActions && (
                <div className="bulk-actions">
                    <span>{selectedReceipts.length} selected</span>
                    <button onClick={() => setShowDeleteConfirm(true)} className="bulk-delete">
                        Delete Selected
                    </button>
                    <select
                        onChange={(e) => handleBulkCategorize(e.target.value)}
                        className="bulk-categorize"
                        defaultValue=""
                    >
                        <option value="" disabled>Categorize as...</option>
                        {categories.map(cat => (
                            <option key={cat.id} value={cat.name}>{cat.name}</option>
                        ))}
                    </select>
                    <button onClick={() => setSelectedReceipts([])} className="clear-selection">
                        Clear Selection
                    </button>
                </div>
            )}

            {/* Receipts Display */}
            {loading ? (
                <div className="loading">Loading receipts...</div>
            ) : filteredReceipts.length === 0 ? (
                <div className="no-receipts">
                    {receipts.length === 0 
                        ? "No receipts found. Upload your first receipt to get started!"
                        : "No receipts match your filters."}
                </div>
            ) : viewMode === 'cards' ? (
                <div className="receipts-grid">
                    {filteredReceipts.map(receipt => (
                        <div key={receipt.id} className="receipt-card">
                            <div className="card-header">
                                <input
                                    type="checkbox"
                                    checked={selectedReceipts.includes(receipt.id)}
                                    onChange={() => handleSelectReceipt(receipt.id)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <h3 onClick={() => handleReceiptClick(receipt.id)}>
                                    {receipt.store_name || 'Unknown Store'}
                                </h3>
                                {getStatusBadge(receipt)}
                            </div>
                            
                            <div className="card-content" onClick={() => handleReceiptClick(receipt.id)}>
                                <p className="receipt-date">{formatDate(receipt.purchase_date)}</p>
                                <p className="receipt-amount">{formatCurrency(receipt.total_amount)}</p>
                                
                                {receipt.presigned_url && (
                                    <img 
                                        src={receipt.presigned_url} 
                                        alt="Receipt thumbnail"
                                        className="receipt-thumbnail"
                                    />
                                )}
                            </div>
                            
                            <div className="card-actions">
                                <select
                                    value={receipt.category || ''}
                                    onChange={(e) => handleQuickCategoryChange(receipt.id, e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="category-select"
                                >
                                    <option value="">Select category</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <table className="receipts-table">
                    <thead>
                        <tr>
                            <th>
                                <input
                                    type="checkbox"
                                    checked={selectedReceipts.length === filteredReceipts.length}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            <th>Store</th>
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Category</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredReceipts.map(receipt => (
                            <tr key={receipt.id}>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={selectedReceipts.includes(receipt.id)}
                                        onChange={() => handleSelectReceipt(receipt.id)}
                                    />
                                </td>
                                <td onClick={() => handleReceiptClick(receipt.id)} className="clickable">
                                    {receipt.store_name || 'Unknown Store'}
                                </td>
                                <td>{formatDate(receipt.purchase_date)}</td>
                                <td>{formatCurrency(receipt.total_amount)}</td>
                                <td>
                                    <select
                                        value={receipt.category || ''}
                                        onChange={(e) => handleQuickCategoryChange(receipt.id, e.target.value)}
                                        className="table-category-select"
                                    >
                                        <option value="">Select...</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.name}>{cat.name}</option>
                                        ))}
                                    </select>
                                </td>
                                <td>{getStatusBadge(receipt)}</td>
                                <td>
                                    <button
                                        onClick={() => handleReceiptClick(receipt.id)}
                                        className="view-button"
                                    >
                                        View
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h3>Delete {selectedReceipts.length} Receipt(s)?</h3>
                        <p>Are you sure you want to delete the selected receipts? This action cannot be undone.</p>
                        <div className="modal-actions">
                            <button onClick={() => setShowDeleteConfirm(false)} className="cancel-button">
                                Cancel
                            </button>
                            <button onClick={handleBulkDelete} className="confirm-delete-button">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;