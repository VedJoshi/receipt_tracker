'use strict';

const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const jwt = require('jsonwebtoken');
const formidable = require('formidable'); // Use formidable
const fs = require('fs'); // Needed for reading temp file with formidable

// Initialize Supabase Admin Client (uses service_role key)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Initialize S3 Client
const s3Client = new S3Client({ region: process.env.AWS_REGION });
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

    const httpMethod = event.requestContext.http.method;
    const path = event.requestContext.http.path;

    // --- Authenticate User ---
    const user = verifyTokenAndGetUser(event);
    // Allow unauthenticated access only for specific paths if needed (e.g., health check)
    const isPublicPath = (path === '/' && httpMethod === 'GET'); // Example public path
    if (!user && !isPublicPath) {
        console.log('Authentication required and failed or missing for path:', path);
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Unauthorized' }),
            headers: { 'Content-Type': 'application/json' },
        };
    }

    try {
        // --- Route: Upload Receipt ---
        if (path === '/upload' && httpMethod === 'POST') {
            if (!user) return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }), headers: { 'Content-Type': 'application/json' }};

            const contentType = event.headers['content-type'] || event.headers['Content-Type'];
            if (!contentType || !contentType.startsWith('multipart/form-data')) {
                return { statusCode: 400, body: JSON.stringify({ message: 'Content-Type must be multipart/form-data' }) };
            }

            // Use formidable to parse multipart data
            const form = formidable({ multiples: false }); // Allow only single file for 'receiptImage'

            // Promise wrapper for formidable parsing
            const parseForm = () => new Promise((resolve, reject) => {
                 // NOTE: AWS Lambda might not provide the raw request object formidable expects directly from `event`.
                 // We need to reconstruct something stream-like or pass the buffer.
                 // For API Gateway v2 (HTTP API), the body is often base64 encoded.

                if (!event.body) {
                   return reject(new Error("Request body is missing"));
                }

                 // Decode if base64 encoded
                 const bodyBuffer = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body);

                 // Pass the buffer and headers to formidable's .parse method - This is tricky without a proper req object.
                 // A common workaround is to simulate a request object or use a library designed for this with Lambda.
                 // Let's try a simpler approach: Pass relevant info directly.
                 // **Alternative (and often more reliable in Lambda):** Manually handle buffer parsing if formidable proves difficult without a req stream.
                 // For now, let's attempt the formidable parse with buffer:

                 // ** Correction ** Formidable v3 needs a request *object* not just the buffer.
                 // Parsing directly from the buffer + headers in a raw Lambda event is complex.
                 // Let's pivot to a simpler parser for this specific Lambda context IF formidable is difficult.
                 // OR - we process the raw buffer and manually find the file part (less robust).

                 // **Let's stick with formidable but use its async/await capabilities on a pseudo-request**
                 // This might still be problematic depending on how API Gateway formats things.

                // *** Simpler Approach: Using formidable to handle the base64 body directly ***
                 const pseudoReq = { // Create a minimal object that looks like a Node.js request
                    headers: event.headers,
                    body: bodyBuffer // Pass the decoded buffer
                 };

                 // We might need to manually pipe the buffer to formidable if parse doesn't work directly
                 // Let's try parse first:
                 form.parse(pseudoReq, async (err, fields, files) => {
                     if (err) {
                        console.error('Formidable parsing error:', err);
                         // Provide more detail if available
                         return reject(new Error(`Failed to parse form data: ${err.message || err}`));
                     }

                     // formidable nests files under their field names
                     const file = files.receiptImage;

                     if (!file) {
                         return reject(new Error('Missing "receiptImage" part in form data'));
                     }

                     // formidable v3 gives an array even for single files
                     const uploadedFile = Array.isArray(file) ? file[0] : file;

                     if (!uploadedFile || !uploadedFile.filepath) {
                        return reject(new Error('Uploaded file data is invalid or missing filepath.'));
                     }

                     console.log('File parsed:', uploadedFile.originalFilename, uploadedFile.mimetype, uploadedFile.size);

                     // Read the file content from the temporary path formidable created
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

                     // Cleanup temporary file created by formidable
                     fs.unlinkSync(uploadedFile.filepath);

                     // 2. Placeholder CV Processing
                     const extractedText = await placeholderProcessReceipt(imageBuffer);
                     console.log('Placeholder processing complete.');

                     // 3. Store metadata in Supabase
                     const { data: dbData, error: dbError } = await supabase
                         .from('receipts')
                         .insert({
                             user_id: user.id,
                             image_url: imageUrl,
                             extracted_text: extractedText, // Make sure your DB schema has this
                             // Add other fields based on your updated schema (store_name, etc.) - initially null
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
                       headers: { 'Content-Type': 'application/json' },
                     });
                 });
            });

            return await parseForm(); // Execute the parsing promise


        // --- Route: Get User's Receipts ---
        } else if (path === '/receipts' && httpMethod === 'GET') {
            if (!user) return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }), headers: { 'Content-Type': 'application/json' }};

            console.log(`Fetching receipts for user: ${user.id}`);
            const { data, error } = await supabase
                .from('receipts')
                // Select columns based on your latest schema
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
                headers: { 'Content-Type': 'application/json' },
            };
        }
        // --- Health Check or other routes ---
        else if (path === '/' && httpMethod === 'GET') {
             return { statusCode: 200, body: JSON.stringify({ message: 'API is running' })};
        }
        // --- Route Not Found ---
        else {
            console.log(`Route not found: ${httpMethod} ${path}`);
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Not Found' }),
                headers: { 'Content-Type': 'application/json' },
            };
        }
    } catch (error) {
        console.error('Unhandled error:', error);
        // Clean up formidable temp file in case of error during processing after parsing
        // This is tricky, might need careful state management if needed
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
            headers: { 'Content-Type': 'application/json' },
        };
    }
};