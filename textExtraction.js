const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

/**
 * Extract text from receipt image using FastAPI OCR service
 * 
 * @param {Buffer} imageBuffer - The image file buffer
 * @returns {Object} Extracted receipt data
 */
const extractTextFromReceipt = async (imageBuffer) => {
    try {
        console.log(`Processing image buffer of ${imageBuffer.length} bytes`);
        
        // Convert buffer to base64
        const base64Image = imageBuffer.toString('base64');
        
        // Call FastAPI OCR service
        const ocrServiceUrl = process.env.OCR_SERVICE_URL || 'http://localhost:8000';
        const response = await axios.post(`${ocrServiceUrl}/process`, {
            image: base64Image,
            enhance_quality: true
        }, {
            timeout: 30000, // 30 second timeout
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('OCR service response received');
        
        if (response.data.success) {
            return {
                full_text: response.data.extracted_text,
                store_name: response.data.store_name,
                total_amount: response.data.total_amount,
                date: response.data.purchase_date,
                items: response.data.items || [],
                confidence_score: response.data.overall_confidence || 0,
                processing_time: response.data.processing_time_ms || 0
            };
        } else {
            throw new Error(response.data.error_message || 'OCR processing failed');
        }
        
    } catch (error) {
        console.error('Error in text extraction:', error.message);
        
        // Return a basic result on error
        return {
            full_text: `Error processing receipt: ${error.message}`,
            store_name: null,
            total_amount: null,
            date: null,
            items: [],
            error: error.message,
            confidence_score: 0
        };
    }
};

module.exports = { extractTextFromReceipt };
