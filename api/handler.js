'use strict';

const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const jwt = require('jsonwebtoken');
const formidable = require('formidable');
const fs = require('fs');

// Initialize Supabase Admin Client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Initialize S3 Client
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-southeast-1' });
const bucketName = process.env.S3_BUCKET_NAME;

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
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
            },
            body: ''
        };
    }

    // --- Authenticate User ---
    const user = verifyTokenAndGetUser(event);
    const isPublicPath = (path === '/' && httpMethod === 'GET');
    
    if (!user && !isPublicPath) {
        console.log('Authentication required and failed or missing for path:', path);
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Unauthorized' }),
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        };
    }

    try {
        // Properly handle the path - parse out the {proxy+} template
        const pathSegments = path.split('/').filter(segment => segment);
        const endpoint = pathSegments[pathSegments.length - 1];
        
        console.log('Parsed endpoint:', endpoint);

        // --- Route: Upload Receipt ---
        if (endpoint === 'upload' && httpMethod === 'POST') {
            if (!user) return { 
                statusCode: 401, 
                body: JSON.stringify({ message: 'Unauthorized' }), 
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                }
            };

            const contentType = event.headers['content-type'] || event.headers['Content-Type'];
            if (!contentType || !contentType.startsWith('multipart/form-data')) {
                return { 
                    statusCode: 400, 
                    body: JSON.stringify({ message: 'Content-Type must be multipart/form-data' }),
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    }
                };
            }

            // Use formidable to parse multipart data
            const form = formidable({ multiples: false });

            // Promise wrapper for formidable parsing
            const parseForm = () => new Promise((resolve, reject) => {
                if (!event.body) {
                   return reject(new Error("Request body is missing"));
                }

                const bodyBuffer = event.isBase64Encoded 
                    ? Buffer.from(event.body, 'base64') 
                    : Buffer.from(event.body);

                const pseudoReq = {
                    headers: event.headers,
                    body: bodyBuffer
                };

                form.parse(pseudoReq, async (err, fields, files) => {
                    if (err) {
                        console.error('Formidable parsing error:', err);
                        return reject(new Error(`Failed to parse form data: ${err.message || err}`));
                    }

                    const file = files.receiptImage;
                    if (!file) {
                        return reject(new Error('Missing "receiptImage" part in form data'));
                    }

                    const uploadedFile = Array.isArray(file) ? file[0] : file;
                    if (!uploadedFile || !uploadedFile.filepath) {
                        return reject(new Error('Uploaded file data is invalid or missing filepath.'));
                    }

                    console.log('File parsed:', uploadedFile.originalFilename, uploadedFile.mimetype, uploadedFile.size);

                    try {
                        // Read the file content
                        const imageBuffer = fs.readFileSync(uploadedFile.filepath);
                        const originalFilename = uploadedFile.originalFilename || 'receipt.jpg';
                        const fileExtension = originalFilename.split('.').pop() || 'jpg';
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

                        console.log('Metadata stored in Supabase:', dbData);
                        resolve({
                            statusCode: 201,
                            body: JSON.stringify({
                                message: 'Receipt uploaded successfully',
                                receipt: dbData
                            }),
                            headers: { 
                                'Content-Type': 'application/json',
                                'Access-Control-Allow-Origin': '*',
                            },
                        });
                    } catch (innerError) {
                        console.error('Error during upload processing:', innerError);
                        reject(innerError);
                    }
                });
            });

            return await parseForm();

        // --- Route: Get User's Receipts ---
        } else if (endpoint === 'receipts' && httpMethod === 'GET') {
            if (!user) return { 
                statusCode: 401, 
                body: JSON.stringify({ message: 'Unauthorized' }), 
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                }
            };

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

            console.log(`Found ${data.length} receipts`);
            return {
                statusCode: 200,
                body: JSON.stringify(data),
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            };
        }
        // --- Health Check or other routes ---
        else if (path === '/' && httpMethod === 'GET') {
            return { 
                statusCode: 200, 
                body: JSON.stringify({ message: 'API is running' }),
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                }
            };
        }
        // --- Route Not Found ---
        else {
            console.log(`Route not found: ${httpMethod} ${path}`);
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Not Found', path, method: httpMethod }),
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            };
        }
    } catch (error) {
        console.error('Unhandled error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        };
    }
};