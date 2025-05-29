const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Supabase setup
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// S3 setup
const s3 = new AWS.S3({
    region: process.env.AWS_REGION || 'ap-southeast-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// Set up multer for file uploads
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// OCR service URL
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:8000';

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        // Check OCR service health
        const ocrHealth = await axios.get(`${OCR_SERVICE_URL}/health`).catch(() => ({ data: { status: 'unhealthy' } }));
        
        res.json({ 
            status: 'API is running',
            ocr_service: ocrHealth.data.status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({ 
            status: 'API is running',
            ocr_service: 'unknown',
            timestamp: new Date().toISOString()
        });
    }
});

// Get user's receipts
app.get('/receipts', async (req, res) => {
    try {
        // Verify JWT token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        
        if (userError || !userData.user) {
            return res.status(401).json({ message: 'Invalid token' });
        }
        
        const userId = userData.user.id;
        
        // Get receipts from Supabase
        const { data, error } = await supabase
            .from('receipts')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        // Generate presigned URLs for all receipt images
        const receiptsWithUrls = await Promise.all(data.map(async (receipt) => {
            let presignedUrl = null;
            
            if (receipt.image_url && receipt.image_url.startsWith('s3://')) {
                const parts = receipt.image_url.replace('s3://', '').split('/');
                const bucket = parts[0];
                const key = parts.slice(1).join('/');
                
                try {
                    presignedUrl = s3.getSignedUrl('getObject', {
                        Bucket: bucket,
                        Key: key,
                        Expires: 3600 // URL expires in 1 hour
                    });
                } catch (err) {
                    console.error('Error generating presigned URL:', err);
                }
            }
            
            return {
                ...receipt,
                presigned_url: presignedUrl
            };
        }));

        res.json(receiptsWithUrls);
    } catch (error) {
        console.error('Error fetching receipts:', error);
        res.status(500).json({ message: 'Failed to fetch receipts', error: error.message });
    }
});

// Upload receipt endpoint with enhanced error handling
app.post('/upload', upload.single('receiptImage'), async (req, res) => {
    let tempFilePath = null;
    
    try {
        // Verify JWT token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        
        if (userError || !userData.user) {
            return res.status(401).json({ message: 'Invalid token' });
        }
        
        const userId = userData.user.id;
        
        // Get file from request
        let imageBuffer;
        let originalFilename;
        let base64Image;
        
        if (req.file) {
            // File uploaded through multer
            tempFilePath = req.file.path;
            imageBuffer = fs.readFileSync(req.file.path);
            originalFilename = req.file.originalname || 'receipt.jpg';
            base64Image = imageBuffer.toString('base64');
        } else if (req.body.image) {
            // Base64 image in request body
            const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
            base64Image = base64Data;
            originalFilename = 'receipt.jpg';
        } else {
            return res.status(400).json({ message: 'Missing image file or data' });
        }

        // Generate unique filename
        const fileExtension = path.extname(originalFilename);
        const timestamp = Date.now();
        const uniqueId = uuidv4().substring(0, 8);
        const s3Filename = `${timestamp}_${uniqueId}${fileExtension}`;
        
        // Upload to S3
        const s3Key = `receipts/${userId}/${s3Filename}`;
        const uploadParams = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: s3Key,
            Body: imageBuffer,
            ContentType: 'image/jpeg',
            Metadata: {
                'user-id': userId,
                'original-filename': originalFilename
            }
        };
        
        console.log(`Uploading to S3: ${s3Key}`);
        await s3.upload(uploadParams).promise();
        const imageUrl = `s3://${process.env.S3_BUCKET_NAME}/${s3Key}`;
        
        // Initialize receipt data with defaults
        let receiptData = {
            user_id: userId,
            image_url: imageUrl,
            extracted_text: '',
            store_name: null,
            total_amount: null,
            purchase_date: null,
            items: [],
            processing_status: 'pending',
            confidence_score: 0,
            is_manually_edited: false,
            retry_count: 0,
            category: null
        };
        
        // Process receipt using the OCR service
        try {
            console.log(`Calling OCR service at ${OCR_SERVICE_URL}/process`);
            
            const processorResponse = await axios.post(
                `${OCR_SERVICE_URL}/process`,
                {
                    image: base64Image,
                    enhance_quality: true
                },
                {
                    timeout: 30000, // 30 second timeout
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            const result = processorResponse.data;
            console.log('OCR processing result:', {
                success: result.success,
                confidence: result.overall_confidence,
                hasText: !!result.extracted_text,
                itemCount: result.items?.length || 0
            });
            
            if (result.success) {
                receiptData = {
                    ...receiptData,
                    extracted_text: result.extracted_text || '',
                    store_name: result.store_name,
                    total_amount: result.total_amount,
                    purchase_date: result.purchase_date,
                    items: result.items || [],
                    processing_status: 'success',
                    confidence_score: result.overall_confidence || 0,
                    category: result.suggested_category,
                    ocr_metadata: {
                        preprocessing_method: result.preprocessing_method,
                        ocr_config: result.ocr_config,
                        confidence_breakdown: result.confidence_breakdown,
                        processing_time_ms: result.processing_time_ms
                    }
                };
            } else {
                console.error('OCR processing failed:', result.error_message);
                receiptData.processing_status = 'failed';
                receiptData.extracted_text = result.error_message || 'OCR processing failed';
            }
        } catch (ocrError) {
            console.error('Error calling OCR service:', ocrError.message);
            if (ocrError.response) {
                console.error('OCR service response:', ocrError.response.data);
            }
            
            receiptData.processing_status = 'failed';
            receiptData.extracted_text = `OCR service error: ${ocrError.message}`;
            
            // Don't fail the entire upload if OCR fails
            // User can manually edit the receipt
        }
        
        // Store receipt in database
        const { data: dbData, error: dbError } = await supabase
            .from('receipts')
            .insert(receiptData)
            .select()
            .single();
        
        if (dbError) {
            throw new Error(`Failed to store receipt: ${dbError.message}`);
        }
        
        // Generate a pre-signed URL for the uploaded image
        const presignedUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: s3Key,
            Expires: 3600
        });
        
        // Prepare response
        const response = {
            message: receiptData.processing_status === 'success' 
                ? 'Receipt uploaded and processed successfully' 
                : 'Receipt uploaded but OCR processing failed',
            receipt: {
                ...dbData,
                presigned_url: presignedUrl
            }
        };
        
        res.status(201).json(response);
        
    } catch (error) {
        console.error('Error in upload endpoint:', error);
        res.status(500).json({ 
            message: 'Upload failed', 
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        // Clean up temporary file if it exists
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
});

// Update receipt endpoint
app.put('/receipts/:id', async (req, res) => {
    try {
        const receiptId = req.params.id;
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        
        if (userError || !userData.user) {
            return res.status(401).json({ message: 'Invalid token' });
        }
        
        const userId = userData.user.id;
        const updates = req.body;
        
        // Validate updates
        const allowedFields = ['store_name', 'purchase_date', 'total_amount', 'items', 'category'];
        const filteredUpdates = {};
        
        for (const field of allowedFields) {
            if (updates.hasOwnProperty(field)) {
                filteredUpdates[field] = updates[field];
            }
        }
        
        // Update the receipt
        const { data, error } = await supabase
            .from('receipts')
            .update({
                ...filteredUpdates,
                is_manually_edited: true,
                updated_at: new Date().toISOString()
            })
            .eq('id', receiptId)
            .eq('user_id', userId)
            .select()
            .single();
        
        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ message: 'Receipt not found' });
            }
            throw error;
        }
        
        res.json({ message: 'Receipt updated successfully', receipt: data });
    } catch (error) {
        console.error('Error updating receipt:', error);
        res.status(500).json({ message: 'Failed to update receipt', error: error.message });
    }
});

// Reprocess receipt endpoint
app.post('/receipts/:id/reprocess', async (req, res) => {
    try {
        const receiptId = req.params.id;
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        
        if (userError || !userData.user) {
            return res.status(401).json({ message: 'Invalid token' });
        }
        
        const userId = userData.user.id;
        
        // Get the receipt
        const { data: receipt, error: fetchError } = await supabase
            .from('receipts')
            .select('*')
            .eq('id', receiptId)
            .eq('user_id', userId)
            .single();
        
        if (fetchError || !receipt) {
            return res.status(404).json({ message: 'Receipt not found' });
        }
        
        // Check retry count
        if (receipt.retry_count >= 3) {
            return res.status(400).json({ message: 'Maximum retry attempts reached' });
        }
        
        // Get image from S3
        if (!receipt.image_url || !receipt.image_url.startsWith('s3://')) {
            return res.status(400).json({ message: 'Invalid image URL' });
        }
        
        const parts = receipt.image_url.replace('s3://', '').split('/');
        const bucket = parts[0];
        const key = parts.slice(1).join('/');
        
        // Download image from S3
        const s3Object = await s3.getObject({
            Bucket: bucket,
            Key: key
        }).promise();
        
        const base64Image = s3Object.Body.toString('base64');
        
        // Reprocess with OCR service
        try {
            const processorResponse = await axios.post(
                `${OCR_SERVICE_URL}/process`,
                {
                    image: base64Image,
                    enhance_quality: true
                },
                {
                    timeout: 30000
                }
            );
            
            const result = processorResponse.data;
            
            if (result.success) {
                // Update receipt with new data
                const { data: updatedReceipt, error: updateError } = await supabase
                    .from('receipts')
                    .update({
                        extracted_text: result.extracted_text || '',
                        store_name: result.store_name,
                        total_amount: result.total_amount,
                        purchase_date: result.purchase_date,
                        items: result.items || [],
                        processing_status: 'success',
                        confidence_score: result.overall_confidence || 0,
                        category: result.suggested_category,
                        retry_count: receipt.retry_count + 1,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', receiptId)
                    .select()
                    .single();
                
                if (updateError) {
                    throw updateError;
                }
                
                res.json({ 
                    message: 'Receipt reprocessed successfully', 
                    receipt: updatedReceipt 
                });
            } else {
                // Update retry count even on failure
                await supabase
                    .from('receipts')
                    .update({ 
                        retry_count: receipt.retry_count + 1,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', receiptId);
                
                res.status(400).json({ 
                    message: 'Reprocessing failed', 
                    error: result.error_message 
                });
            }
        } catch (ocrError) {
            console.error('OCR reprocessing error:', ocrError);
            
            // Update retry count
            await supabase
                .from('receipts')
                .update({ 
                    retry_count: receipt.retry_count + 1,
                    updated_at: new Date().toISOString()
                })
                .eq('id', receiptId);
            
            res.status(500).json({ 
                message: 'OCR service error', 
                error: ocrError.message 
            });
        }
        
    } catch (error) {
        console.error('Error reprocessing receipt:', error);
        res.status(500).json({ message: 'Failed to reprocess receipt', error: error.message });
    }
});

// Get categories endpoint
app.get('/categories', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const token = authHeader.split(' ')[1];
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        
        if (userError || !userData.user) {
            return res.status(401).json({ message: 'Invalid token' });
        }
        
        // Return default categories
        const defaultCategories = [
            { id: 1, name: 'Groceries', color: '#4CAF50', is_system_default: true },
            { id: 2, name: 'Restaurants', color: '#FF9800', is_system_default: true },
            { id: 3, name: 'Gas & Fuel', color: '#795548', is_system_default: true },
            { id: 4, name: 'Shopping', color: '#E91E63', is_system_default: true },
            { id: 5, name: 'Healthcare', color: '#F44336', is_system_default: true },
            { id: 6, name: 'Entertainment', color: '#9C27B0', is_system_default: true },
            { id: 7, name: 'Transportation', color: '#3F51B5', is_system_default: true },
            { id: 8, name: 'Other', color: '#607D8B', is_system_default: true }
        ];
        
        res.json(defaultCategories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Failed to fetch categories', error: error.message });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
app.listen(port, () => {
    console.log(`Receipt backend server running at http://localhost:${port}`);
    console.log(`OCR service expected at: ${OCR_SERVICE_URL}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});