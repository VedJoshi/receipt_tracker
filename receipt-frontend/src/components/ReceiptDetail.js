import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../AuthContext';
import './ReceiptDetail.css';

const API_URL = process.env.REACT_APP_API_GATEWAY_URL;

function ReceiptDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { session } = useAuth();
    
    // State management
    const [receipt, setReceipt] = useState(null);
    const [editedReceipt, setEditedReceipt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [hasChanges, setHasChanges] = useState(false);
    const [imageZoom, setImageZoom] = useState(1);
    const [imageRotation, setImageRotation] = useState(0);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isReprocessing, setIsReprocessing] = useState(false);
    const [categories, setCategories] = useState([]);
    
    // New item being added
    const [newItem, setNewItem] = useState({ name: '', price: '', quantity: 1 });

    // Fetch receipt data
    useEffect(() => {
        fetchReceipt();
        fetchCategories();
    }, [id]);

    // Track changes
    useEffect(() => {
        if (receipt && editedReceipt) {
            const hasChanges = JSON.stringify(receipt) !== JSON.stringify(editedReceipt);
            setHasChanges(hasChanges);
        }
    }, [receipt, editedReceipt]);

    const fetchReceipt = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`${API_URL}/receipts/${id}`, {
                headers: { Authorization: `Bearer ${session.access_token}` }
            });
            setReceipt(response.data);
            setEditedReceipt(response.data);
        } catch (err) {
            console.error('Error fetching receipt:', err);
            setError('Failed to load receipt');
            if (err.response?.status === 404) {
                navigate('/dashboard');
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

    // Handle input changes
    const handleInputChange = (field, value) => {
        setEditedReceipt({
            ...editedReceipt,
            [field]: field === 'total_amount' ? parseFloat(value) || 0 : value
        });
    };

    // Handle item changes
    const handleItemChange = (index, field, value) => {
        const updatedItems = [...(editedReceipt.items || [])];
        updatedItems[index] = {
            ...updatedItems[index],
            [field]: field === 'price' ? parseFloat(value) || 0 : 
                     field === 'quantity' ? parseInt(value) || 1 : value
        };
        setEditedReceipt({ ...editedReceipt, items: updatedItems });
    };

    // Add new item
    const handleAddItem = () => {
        if (newItem.name && newItem.price) {
            const items = editedReceipt.items || [];
            setEditedReceipt({
                ...editedReceipt,
                items: [...items, {
                    name: newItem.name,
                    price: parseFloat(newItem.price),
                    quantity: parseInt(newItem.quantity) || 1
                }]
            });
            setNewItem({ name: '', price: '', quantity: 1 });
        }
    };

    // Remove item
    const handleRemoveItem = (index) => {
        const updatedItems = [...(editedReceipt.items || [])];
        updatedItems.splice(index, 1);
        setEditedReceipt({ ...editedReceipt, items: updatedItems });
    };

    // Save changes
    const handleSave = async () => {
        setSaving(true);
        setError('');
        
        try {
            const response = await axios.put(
                `${API_URL}/receipts/${id}`,
                {
                    store_name: editedReceipt.store_name,
                    purchase_date: editedReceipt.purchase_date,
                    total_amount: editedReceipt.total_amount,
                    items: editedReceipt.items || [],
                    category: editedReceipt.category
                },
                {
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    }
                }
            );
            
            setReceipt(response.data.receipt);
            setEditedReceipt(response.data.receipt);
            setHasChanges(false);
        } catch (err) {
            console.error('Error saving receipt:', err);
            setError('Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    // Revert changes
    const handleRevert = () => {
        setEditedReceipt(receipt);
        setNewItem({ name: '', price: '', quantity: 1 });
    };

    // Delete receipt
    const handleDelete = async () => {
        try {
            setError('');
            
            console.log(`Deleting receipt ${id}`);
            
            const response = await axios.delete(`${API_URL}/receipts/${id}`, {
                headers: { 
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('Delete response:', response.data);
            
            // Show success message briefly before navigating
            setShowDeleteConfirm(false);
            
            // Navigate back to dashboard immediately after successful deletion
            navigate('/dashboard', { 
                state: { 
                    message: 'Receipt deleted successfully',
                    refresh: true 
                } 
            });
            
        } catch (err) {
            console.error('Error deleting receipt:', err);
            setError(`Failed to delete receipt: ${err.response?.data?.message || err.message}`);
            setShowDeleteConfirm(false);
        }
    };

    // Reprocess receipt
    const handleReprocess = async () => {
        setIsReprocessing(true);
        setError('');
        
        try {
            const response = await axios.post(
                `${API_URL}/receipts/${id}/reprocess`,
                {},
                {
                    headers: { Authorization: `Bearer ${session.access_token}` }
                }
            );
            
            if (response.data.receipt) {
                setReceipt(response.data.receipt);
                setEditedReceipt(response.data.receipt);
            }
        } catch (err) {
            console.error('Error reprocessing receipt:', err);
            setError('Failed to reprocess receipt');
        } finally {
            setIsReprocessing(false);
        }
    };

    // Calculate totals
    const calculateItemsTotal = () => {
        if (!editedReceipt?.items) return '0.00';
        return editedReceipt.items.reduce((sum, item) => {
            return sum + (parseFloat(item.price) * parseInt(item.quantity || 1));
        }, 0).toFixed(2);
    };

    // Image controls
    const handleResetImage = () => {
        setImageZoom(1);
        setImageRotation(0);
    };

    if (loading) {
        return <div className="loading-container">Loading receipt...</div>;
    }

    if (!receipt) {
        return <div className="error-container">Receipt not found</div>;
    }

    return (
        <div className="receipt-detail-container">
            <div className="receipt-detail-header">
                <button onClick={() => navigate('/dashboard')} className="back-button">
                    ← Back to Dashboard
                </button>
                <h2>Receipt Details</h2>
                <div className="header-actions">
                    {hasChanges && (
                        <>
                            <button onClick={handleRevert} className="revert-button">
                                Revert Changes
                            </button>
                            <button onClick={handleSave} disabled={saving} className="save-button">
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </>
                    )}
                    <button onClick={() => setShowDeleteConfirm(true)} className="delete-button">
                        Delete
                    </button>
                </div>
            </div>

            {error && (
                <div className="error-message">
                    {error}
                </div>
            )}

            <div className="receipt-detail-content">
                {/* Left side - Image viewer */}
                <div className="image-section">
                    <div className="image-controls">
                        <button onClick={handleZoomOut} disabled={imageZoom <= 0.5}>-</button>
                        <span>{Math.round(imageZoom * 100)}%</span>
                        <button onClick={handleZoomIn} disabled={imageZoom >= 3}>+</button>
                        <button onClick={handleRotate}>↻</button>
                        <button onClick={handleResetImage}>Reset</button>
                    </div>
                    
                    <div className="image-viewer">
                        <img 
                            src={receipt.presigned_url || receipt.image_url} 
                            alt="Receipt"
                            style={{
                                transform: `scale(${imageZoom}) rotate(${imageRotation}deg)`,
                                transition: 'transform 0.3s ease'
                            }}
                        />
                    </div>

                    {receipt.processing_status === 'failed' && (
                        <div className="ocr-status-warning">
                            <p>⚠️ OCR processing failed for this receipt</p>
                            <button 
                                onClick={handleReprocess} 
                                disabled={isReprocessing || receipt.retry_count >= 3}
                                className="reprocess-button"
                            >
                                {isReprocessing ? 'Reprocessing...' : 'Try Again'}
                                {receipt.retry_count > 0 && ` (${receipt.retry_count}/3)`}
                            </button>
                        </div>
                    )}
                </div>

                {/* Right side - Edit form */}
                <div className="edit-section">
                    <div className="form-group">
                        <label>Store Name</label>
                        <input
                            type="text"
                            value={editedReceipt.store_name || ''}
                            onChange={(e) => handleInputChange('store_name', e.target.value)}
                            placeholder="Enter store name"
                        />
                    </div>

                    <div className="form-group">
                        <label>Purchase Date</label>
                        <input
                            type="text"
                            value={editedReceipt.purchase_date || ''}
                            onChange={(e) => handleInputChange('purchase_date', e.target.value)}
                            placeholder="MM/DD/YYYY"
                        />
                    </div>

                    <div className="form-group">
                        <label>Category</label>
                        <select
                            value={editedReceipt.category || ''}
                            onChange={(e) => handleInputChange('category', e.target.value)}
                        >
                            <option value="">Select a category</option>
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.name}>{cat.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Total Amount</label>
                        <input
                            type="number"
                            value={editedReceipt.total_amount || ''}
                            onChange={(e) => handleInputChange('total_amount', e.target.value)}
                            step="0.01"
                            min="0"
                        />
                        {editedReceipt.items?.length > 0 && (
                            <small className="total-hint">
                                Items total: ${calculateItemsTotal()}
                            </small>
                        )}
                    </div>

                    <div className="items-section">
                        <h3>Items</h3>
                        {editedReceipt.items?.map((item, index) => (
                            <div key={index} className="item-row">
                                <input
                                    type="text"
                                    value={item.name}
                                    onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                                    placeholder="Item name"
                                    className="item-name"
                                />
                                <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                    min="1"
                                    className="item-quantity"
                                />
                                <input
                                    type="number"
                                    value={item.price}
                                    onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                                    step="0.01"
                                    min="0"
                                    className="item-price"
                                />
                                <button 
                                    onClick={() => handleRemoveItem(index)}
                                    className="remove-item-button"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        
                        <div className="add-item-row">
                            <input
                                type="text"
                                value={newItem.name}
                                onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                                placeholder="New item name"
                                className="item-name"
                            />
                            <input
                                type="number"
                                value={newItem.quantity}
                                onChange={(e) => setNewItem({...newItem, quantity: e.target.value})}
                                min="1"
                                className="item-quantity"
                            />
                            <input
                                type="number"
                                value={newItem.price}
                                onChange={(e) => setNewItem({...newItem, price: e.target.value})}
                                step="0.01"
                                min="0"
                                placeholder="Price"
                                className="item-price"
                            />
                            <button 
                                onClick={handleAddItem}
                                disabled={!newItem.name || !newItem.price}
                                className="add-item-button"
                            >
                                Add
                            </button>
                        </div>
                    </div>

                    {receipt.extracted_text && (
                        <div className="ocr-text-section">
                            <h3>OCR Extracted Text</h3>
                            <textarea
                                value={receipt.extracted_text}
                                readOnly
                                rows={10}
                            />
                            {receipt.confidence_score && (
                                <small>Confidence: {(receipt.confidence_score * 100).toFixed(0)}%</small>
                            )}
                        </div>
                    )}

                    <div className="metadata-section">
                        <small>
                            Created: {new Date(receipt.created_at).toLocaleString()}
                            {receipt.updated_at && receipt.updated_at !== receipt.created_at && 
                                ` | Updated: ${new Date(receipt.updated_at).toLocaleString()}`
                            }
                            {receipt.is_manually_edited && ' | Manually edited'}
                        </small>
                    </div>
                </div>
            </div>

            {/* Delete confirmation modal */}
            {showDeleteConfirm && (
                <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h3>Delete Receipt?</h3>
                        <p>Are you sure you want to delete this receipt? This action cannot be undone.</p>
                        <div className="modal-actions">
                            <button onClick={() => setShowDeleteConfirm(false)} className="cancel-button">
                                Cancel
                            </button>
                            <button onClick={handleDelete} className="confirm-delete-button">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ReceiptDetail;