import React, { useState, useEffect } from 'react';

const ReceiptEditor = ({ receipt, onSave, onCancel }) => {
  // Initialize state with receipt data or empty values
  const [editedReceipt, setEditedReceipt] = useState({
    id: receipt?.id || '',
    store_name: receipt?.store_name || '',
    purchase_date: receipt?.purchase_date || '',
    total_amount: receipt?.total_amount || '',
    items: receipt?.items || [],
    extracted_text: receipt?.extracted_text || '',
    image_url: receipt?.image_url || '',
  });

  // State for a new item being added
  const [newItem, setNewItem] = useState({ name: '', price: '', quantity: 1 });
  
  // Calculate total from items for validation
  const [calculatedTotal, setCalculatedTotal] = useState(0);

  // Update calculated total whenever items change
  useEffect(() => {
    const total = editedReceipt.items.reduce(
      (sum, item) => sum + (parseFloat(item.price) * parseInt(item.quantity || 1)),
      0
    );
    setCalculatedTotal(parseFloat(total.toFixed(2)));
  }, [editedReceipt.items]);

  // Handle input changes for main receipt fields
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditedReceipt({
      ...editedReceipt,
      [name]: name === 'total_amount' ? parseFloat(value) || '' : value,
    });
  };

  // Handle item changes
  const handleItemChange = (index, field, value) => {
    const updatedItems = [...editedReceipt.items];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: field === 'price' ? (parseFloat(value) || 0) : 
               field === 'quantity' ? (parseInt(value) || 1) : value,
    };
    setEditedReceipt({ ...editedReceipt, items: updatedItems });
  };

  // Handle new item input changes
  const handleNewItemChange = (field, value) => {
    setNewItem({
      ...newItem,
      [field]: field === 'price' ? (parseFloat(value) || '') : 
               field === 'quantity' ? (parseInt(value) || 1) : value,
    });
  };

  // Add a new item to the items list
  const handleAddItem = () => {
    if (newItem.name && newItem.price) {
      setEditedReceipt({
        ...editedReceipt,
        items: [...editedReceipt.items, { ...newItem }]
      });
      setNewItem({ name: '', price: '', quantity: 1 }); // Reset new item form
    }
  };

  // Remove an item from the list
  const handleRemoveItem = (index) => {
    const updatedItems = [...editedReceipt.items];
    updatedItems.splice(index, 1);
    setEditedReceipt({ ...editedReceipt, items: updatedItems });
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(editedReceipt);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h2>Edit Receipt</h2>
      
      {receipt.image_url && (
        <div style={{ textAlign: 'center', margin: '20px 0' }}>
          <img 
            src={receipt.image_url} 
            alt="Receipt" 
            style={{ maxWidth: '100%', maxHeight: '300px' }} 
          />
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="store_name" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Store Name:
          </label>
          <input
            type="text"
            id="store_name"
            name="store_name"
            value={editedReceipt.store_name}
            onChange={handleInputChange}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            required
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="purchase_date" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Purchase Date:
          </label>
          <input
            type="text"
            id="purchase_date"
            name="purchase_date"
            value={editedReceipt.purchase_date}
            onChange={handleInputChange}
            placeholder="MM/DD/YYYY"
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            required
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="total_amount" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Total Amount:
          </label>
          <input
            type="number"
            id="total_amount"
            name="total_amount"
            value={editedReceipt.total_amount}
            onChange={handleInputChange}
            step="0.01"
            min="0"
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            required
          />
          {calculatedTotal !== 0 && calculatedTotal !== parseFloat(editedReceipt.total_amount) && (
            <div style={{ color: 'orange', marginTop: '5px' }}>
              Note: Sum of items ({calculatedTotal.toFixed(2)}) doesn't match total amount
            </div>
          )}
        </div>

        <h3>Items</h3>
        {editedReceipt.items.length === 0 && (
          <p style={{ color: 'gray' }}>No items added yet. Add items below.</p>
        )}
        
        <div style={{ marginBottom: '20px' }}>
          {editedReceipt.items.map((item, index) => (
            <div 
              key={index} 
              style={{ 
                display: 'flex', 
                marginBottom: '10px',
                padding: '10px', 
                backgroundColor: '#f9f9f9', 
                borderRadius: '4px' 
              }}
            >
              <input
                type="text"
                value={item.name}
                onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                placeholder="Item name"
                style={{ flex: 3, marginRight: '10px', padding: '5px' }}
                required
              />
              <input
                type="number"
                value={item.quantity}
                onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                placeholder="Qty"
                min="1"
                style={{ flex: 1, marginRight: '10px', padding: '5px' }}
                required
              />
              <input
                type="number"
                value={item.price}
                onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                placeholder="Price"
                step="0.01"
                min="0"
                style={{ flex: 1, marginRight: '10px', padding: '5px' }}
                required
              />
              <button 
                type="button" 
                onClick={() => handleRemoveItem(index)}
                style={{ 
                  backgroundColor: '#ff4d4d',
                  color: 'white',
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div style={{ 
          display: 'flex', 
          marginBottom: '20px',
          padding: '15px', 
          backgroundColor: '#e6f7ff', 
          borderRadius: '4px' 
        }}>
          <input
            type="text"
            value={newItem.name}
            onChange={(e) => handleNewItemChange('name', e.target.value)}
            placeholder="Item name"
            style={{ flex: 3, marginRight: '10px', padding: '8px' }}
          />
          <input
            type="number"
            value={newItem.quantity}
            onChange={(e) => handleNewItemChange('quantity', e.target.value)}
            placeholder="Qty"
            min="1"
            style={{ flex: 1, marginRight: '10px', padding: '8px' }}
          />
          <input
            type="number"
            value={newItem.price}
            onChange={(e) => handleNewItemChange('price', e.target.value)}
            placeholder="Price"
            step="0.01"
            min="0"
            style={{ flex: 1, marginRight: '10px', padding: '8px' }}
          />
          <button 
            type="button" 
            onClick={handleAddItem}
            disabled={!newItem.name || !newItem.price}
            style={{ 
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '8px 15px',
              borderRadius: '4px',
              cursor: newItem.name && newItem.price ? 'pointer' : 'not-allowed',
              opacity: newItem.name && newItem.price ? 1 : 0.7
            }}
          >
            Add Item
          </button>
        </div>

        {receipt.extracted_text && (
          <div style={{ marginBottom: '20px' }}>
            <h3>OCR Text</h3>
            <textarea
              value={editedReceipt.extracted_text}
              readOnly
              style={{ 
                width: '100%', 
                height: '150px', 
                padding: '8px', 
                borderRadius: '4px', 
                border: '1px solid #ccc',
                backgroundColor: '#f9f9f9'
              }}
            />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button 
            type="button" 
            onClick={onCancel}
            style={{ 
              backgroundColor: '#ccc',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button 
            type="submit"
            style={{ 
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
};

export default ReceiptEditor;
