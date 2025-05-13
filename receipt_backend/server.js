const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
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
    region: 'ap-southeast-1', // Set your region
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// Set up multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'API is running' });
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
            .select('id, created_at, image_url, extracted_text, store_name, total_amount, purchase_date, items')
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

// Upload receipt endpoint
app.post('/upload', upload.single('receiptImage'), async (req, res) => {
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
        
        if (req.file) {
            // File uploaded through multer
            imageBuffer = fs.readFileSync(req.file.path);
            originalFilename = req.file.originalname || 'receipt.jpg';
            
            // Clean up the temporary file
            fs.unlinkSync(req.file.path);
        } else if (req.body.image) {
            // Base64 image in request body
            const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
            originalFilename = 'receipt.jpg';
        } else {
            return res.status(400).json({ message: 'Missing image file or data' });
        }

        // Upload to S3
        const s3Key = `receipts/${userId}/${Date.now()}_${originalFilename}`;
        const uploadParams = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: s3Key,
            Body: imageBuffer,
            ContentType: 'image/jpeg'
        };
        
        await s3.upload(uploadParams).promise();
        const imageUrl = `s3://${process.env.S3_BUCKET_NAME}/${s3Key}`;
        
        // Process receipt (placeholder for now)
        const extractedText = "Sample extracted text";
        
        // Store metadata in Supabase
        const { data: dbData, error: dbError } = await supabase
            .from('receipts')
            .insert({
                user_id: userId,
                image_url: imageUrl,
                extracted_text: extractedText,
                store_name: null,
                total_amount: null,
                purchase_date: null,
                items: []
            })
            .select()
            .single();
        
        if (dbError) {
            throw new Error(`Failed to store receipt metadata: ${dbError.message}`);
        }
        
        // Generate a pre-signed URL for the uploaded image
        const presignedUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: s3Key,
            Expires: 3600 // URL expires in 1 hour
        });
        
        res.status(201).json({
            message: 'Receipt uploaded successfully',
            receipt: {
                ...dbData,
                presigned_url: presignedUrl
            }
        });
        
    } catch (error) {
        console.error('Error uploading receipt:', error);
        res.status(500).json({ message: 'Upload failed', error: error.message });
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});