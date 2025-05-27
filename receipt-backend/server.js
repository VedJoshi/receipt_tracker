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
    region: 'ap-southeast-1',
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
        
        const { data, error } = await supabase
            .from('receipts')
            .select('id, created_at, image_url, extracted_text, store_name, total_amount, purchase_date, items')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

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
                        Expires: 3600
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
        
        let imageBuffer;
        let originalFilename;
        let base64Image;
        
        if (req.file) {
            imageBuffer = fs.readFileSync(req.file.path);
            originalFilename = req.file.originalname || 'receipt.jpg';
            base64Image = imageBuffer.toString('base64');
            fs.unlinkSync(req.file.path);
        } else if (req.body.image) {
            const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
            base64Image = base64Data;
            originalFilename = 'receipt.jpg';
        } else {
            return res.status(400).json({ message: 'Missing image file or data' });
        }

        const s3Key = `receipts/${userId}/${Date.now()}_${originalFilename}`;
        const uploadParams = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: s3Key,
            Body: imageBuffer,
            ContentType: 'image/jpeg'
        };
        
        await s3.upload(uploadParams).promise();
        const imageUrl = `s3://${process.env.S3_BUCKET_NAME}/${s3Key}`;
        
        let extractedData;
        try {
            const processorResponse = await axios.post('http://localhost:5000/process', {
                image: base64Image
            });
            extractedData = processorResponse.data;
            console.log('Receipt processor response:', extractedData);
        } catch (processorError) {
            console.error('Error calling receipt processor:', processorError);
            extractedData = {
                extracted_text: "Error processing receipt",
                store_name: null,
                total_amount: null,
                purchase_date: null,
                items: []
            };
        }

        let purchaseDate = extractedData.purchase_date;
        if (purchaseDate && typeof purchaseDate === 'string') {
            try {
                purchaseDate = formatDateForDatabase(purchaseDate);
            } catch (dateError) {
                console.warn(`Failed to format date "${purchaseDate}": ${dateError.message}`);
                purchaseDate = null;
            }
        }
        
        const { data: dbData, error: dbError } = await supabase
            .from('receipts')
            .insert({
                user_id: userId,
                image_url: imageUrl,
                extracted_text: extractedData.extracted_text,
                store_name: extractedData.store_name,
                total_amount: extractedData.total_amount,
                purchase_date: purchaseDate,
                items: extractedData.items || []
            })
            .select()
            .single();
        
        if (dbError) {
            throw new Error(`Failed to store receipt metadata: ${dbError.message}`);
        }
        
        const presignedUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: s3Key,
            Expires: 3600
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

// Helper function to format date strings for database storage
function formatDateForDatabase(dateStr) {
    if (!dateStr) return null;
    
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return dateStr;
    }
    
    let formattedDate;
    
    const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(dateStr);
    if (slashMatch) {
        const [_, part1, part2, part3] = slashMatch;
        
        if (parseInt(part1) > 12) {
            const day = parseInt(part1);
            const month = parseInt(part2);
            let year = parseInt(part3);
            
            if (year < 100) {
                year = year < 50 ? 2000 + year : 1900 + year;
            }
            
            if (month > 0 && month <= 12 && day > 0 && day <= 31) {
                return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            }
        } else {
            const month = parseInt(part1);
            const day = parseInt(part2);
            let year = parseInt(part3);
            
            if (year < 100) {
                year = year < 50 ? 2000 + year : 1900 + year;
            }
            
            if (month > 0 && month <= 12 && day > 0 && day <= 31) {
                return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            }
        }
    }
    
    try {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }
    } catch (e) {
        console.warn(`Failed to parse date with built-in parser: ${e.message}`);
    }
    
    console.warn(`Could not parse date string: ${dateStr}`);
    return null;
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});