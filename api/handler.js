'use strict';

const { createClient } = require('@supabase/supabase-js');
const { 
    S3Client, 
    PutObjectCommand, 
    GetObjectCommand 
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const jwt = require('jsonwebtoken');
const Busboy = require('busboy');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Initialize Supabase Admin Client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Initialize S3 Client
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-1' });
const bucketName = process.env.S3_BUCKET_NAME;

// Standard CORS headers for all responses
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

// --- Helper: Create standardized response with CORS ---
const createResponse = (statusCode, body) => {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
        },
        body: JSON.stringify(body)
    };
};

// --- Helper: Generate a pre-signed URL for S3 object ---
const generatePresignedUrl = async (s3Uri) => {
    // Parse the S3 URI to get bucket and key
    // s3Uri format: s3://bucket-name/path/to/object
    const parts = s3Uri.replace('s3://', '').split('/');
    const bucket = parts[0];
    const key = parts.slice(1).join('/');
    
    try {
        const command = new GetObjectCommand({
            Bucket: bucket,
            Key: key
        });
        
        // Generate a pre-signed URL that expires in 1 hour (3600 seconds)
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        return signedUrl;
    } catch (error) {
        console.error('Error generating pre-signed URL:', error);
        return null;
    }
};

// --- Helper: Verify JWT and get User ID ---
const verifyTokenAndGetUser = (event) => {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error('No valid Authorization header found');
        return null;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
        if (!decoded.sub) {
            console.error('JWT does not contain sub (user ID)');
            return null;
        }
        console.log('Token verified for user:', decoded.sub);
        return { id: decoded.sub };
    } catch (error) {
        console.error('JWT verification failed:', error.message);
        return null;
    }
};

// --- Helper: Placeholder CV Processing ---
const placeholderProcessReceipt = async (imageBuffer) => {
    console.log(`Placeholder: Processing image of size ${imageBuffer.length} bytes.`);
    await new Promise(resolve => setTimeout(resolve, 500));
    return `Placeholder Text: Processed receipt at ${new Date().toISOString()}`;
};

// --- Helper: Parse multipart form data using Busboy ---
// --- Helper: Parse multipart form data using Busboy ---
const parseMultipartForm = (event) => {
    return new Promise((resolve, reject) => {
        const boundary = event.headers['content-type'].split('=')[1];
        const busboy = Busboy({ headers: { 'content-type': event.headers['content-type'] } });
        
        const fields = {};
        const files = {};
        const tmpdir = os.tmpdir();
        const fileWritePromises = []; // Track all file write operations
        
        busboy.on('field', (fieldname, val) => {
            fields[fieldname] = val;
        });
        
        busboy.on('file', (fieldname, fileStream, info) => {
            const { filename, encoding, mimeType } = info;
            
            console.log(`Processing file: ${filename}, mimetype: ${mimeType}`);
            
            // Create a temporary file
            const tmpFilePath = path.join(tmpdir, `${uuidv4()}-${filename}`);
            const writeStream = fs.createWriteStream(tmpFilePath);
            
            // Create a promise that resolves when the file is written
            const writePromise = new Promise((resolveFile, rejectFile) => {
                writeStream.on('finish', () => {
                    // Log the file size to verify it's not empty
                    const stats = fs.statSync(tmpFilePath);
                    console.log(`File written to ${tmpFilePath}, size: ${stats.size} bytes`);
                    
                    files[fieldname] = {
                        filepath: tmpFilePath,
                        originalFilename: filename,
                        mimetype: mimeType,
                        size: stats.size
                    };
                    resolveFile();
                });
                
                writeStream.on('error', (error) => {
                    console.error(`Error writing to ${tmpFilePath}:`, error);
                    rejectFile(error);
                });
            });
            
            // Add this write operation to our tracking array
            fileWritePromises.push(writePromise);
            
            // Pipe the upload stream to the file
            fileStream.pipe(writeStream);
            
            // Handle errors in the incoming stream
            fileStream.on('error', (error) => {
                console.error(`Error in file stream for ${filename}:`, error);
                writeStream.end();
            });
            
            // Close the write stream when the file stream ends
            fileStream.on('end', () => {
                writeStream.end();
            });
        });
        
        busboy.on('finish', () => {
            // Wait for all file writes to complete before resolving
            Promise.all(fileWritePromises)
                .then(() => {
                    // All files have been processed, now we can resolve
                    console.log(`All files processed successfully: ${Object.keys(files).length} files`);
                    resolve({ fields, files });
                })
                .catch((error) => {
                    console.error('Error processing files:', error);
                    reject(error);
                });
        });
        
        busboy.on('error', (error) => {
            reject(new Error(`Error parsing form data: ${error.message}`));
        });
        
        // Handle the API Gateway event format
        if (event.body) {
            const bodyBuffer = event.isBase64Encoded 
                ? Buffer.from(event.body, 'base64') 
                : Buffer.from(event.body);
                
            busboy.write(bodyBuffer);
            busboy.end();
        } else {
            reject(new Error('Missing request body'));
        }
    });
};

// --- API Endpoint Logic ---
module.exports.endpoint = async (event) => {
    console.log('Received event:', JSON.stringify(event, null, 2));

    // Log headers specifically for debugging CORS
    console.log('Request headers:', JSON.stringify(event.headers || {}, null, 2));

    const httpMethod = event.requestContext.http.method;
    // Extract path correctly from event
    const path = event.requestContext.http.path;
    
    // Log the actual invoked path
    console.log('Path being processed:', path);

    // Handle OPTIONS requests for CORS preflight
    if (httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }

    // --- Authenticate User ---
    const user = verifyTokenAndGetUser(event);
    const isPublicPath = (path === '/' && httpMethod === 'GET');
    
    if (!user && !isPublicPath) {
        console.log('Authentication required and failed or missing for path:', path);
        return createResponse(401, { message: 'Unauthorized' });
    }

    try {
        // Properly handle the path - parse out the {proxy+} template
        const pathSegments = path.split('/').filter(segment => segment);
        const endpoint = pathSegments[pathSegments.length - 1];
        
        console.log('Parsed endpoint:', endpoint);

        // --- Route: Upload Receipt ---
        if (endpoint === 'upload' && httpMethod === 'POST') {
            if (!user) return createResponse(401, { message: 'Unauthorized' });

            const contentType = event.headers['content-type'] || event.headers['Content-Type'];
            if (!contentType || !contentType.startsWith('multipart/form-data')) {
                return createResponse(400, { message: 'Content-Type must be multipart/form-data' });
            }

            try {
                // Parse the multipart form data
                const { files } = await parseMultipartForm(event);
                
                if (!files.receiptImage) {
                    return createResponse(400, { message: 'Missing "receiptImage" part in form data' });
                }
                
                const uploadedFile = files.receiptImage;
                console.log('File parsed:', uploadedFile.originalFilename, uploadedFile.mimetype);
                
                // Read the file content
                const imageBuffer = fs.readFileSync(uploadedFile.filepath);
                const originalFilename = uploadedFile.originalFilename || 'receipt.jpg';
                const s3Key = `receipts/${user.id}/${Date.now()}_${originalFilename}`;
                
                // 1. Upload to S3
                console.log(`Uploading ${s3Key} to bucket ${bucketName}`);
                const s3Params = {
                    Bucket: bucketName,
                    Key: s3Key,
                    Body: imageBuffer,
                    ContentType: uploadedFile.mimetype || 'image/jpeg',
                };
                
                await s3Client.send(new PutObjectCommand(s3Params));
                const imageUrl = `s3://${bucketName}/${s3Key}`;
                console.log('Image uploaded to S3:', imageUrl);
                
                // Cleanup temporary file
                fs.unlinkSync(uploadedFile.filepath);
                
                // 2. Process receipt (placeholder)
                const extractedText = await placeholderProcessReceipt(imageBuffer);
                console.log('Placeholder processing complete.');
                
                // 3. Store metadata in Supabase
                const { data: dbData, error: dbError } = await supabase
                    .from('receipts')
                    .insert({
                        user_id: user.id,
                        image_url: imageUrl,
                        extracted_text: extractedText,
                        store_name: null,
                        total_amount: null,
                        purchase_date: null,
                    })
                    .select()
                    .single();
                
                if (dbError) {
                    console.error('Supabase insert error:', dbError);
                    throw new Error(`Failed to store receipt metadata: ${dbError.message}`);
                }
                
                // Generate a pre-signed URL for the uploaded image
                const presignedUrl = await generatePresignedUrl(imageUrl);
                
                console.log('Metadata stored in Supabase:', dbData);
                return createResponse(201, {
                    message: 'Receipt uploaded successfully',
                    receipt: {
                        ...dbData,
                        presigned_url: presignedUrl
                    }
                });
            } catch (error) {
                console.error('Error processing upload:', error);
                return createResponse(500, { message: 'Upload failed', error: error.message });
            }
        // --- Route: Get User's Receipts ---
        } else if (endpoint === 'receipts' && httpMethod === 'GET') {
            if (!user) return createResponse(401, { message: 'Unauthorized' });

            console.log(`Fetching receipts for user: ${user.id}`);
            const { data, error } = await supabase
                .from('receipts')
                .select('id, created_at, image_url, extracted_text, store_name, total_amount, purchase_date')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Supabase select error:', error);
                throw new Error(`Failed to fetch receipts: ${error.message}`);
            }

            // Generate pre-signed URLs for all receipt images
            const receiptsWithUrls = await Promise.all(data.map(async (receipt) => {
                const presignedUrl = await generatePresignedUrl(receipt.image_url);
                return {
                    ...receipt,
                    presigned_url: presignedUrl
                };
            }));

            console.log(`Found ${receiptsWithUrls.length} receipts`);
            return createResponse(200, receiptsWithUrls);
        }
        // --- Health Check or other routes ---
        else if (path === '/' && httpMethod === 'GET') {
            return createResponse(200, { message: 'API is running' });
        }
        // --- Route Not Found ---
        else {
            console.log(`Route not found: ${httpMethod} ${path}`);
            return createResponse(404, { message: 'Not Found', path, method: httpMethod });
        }
    } catch (error) {
        console.error('Unhandled error:', error);
        return createResponse(500, { message: 'Internal Server Error', error: error.message });
    }
};