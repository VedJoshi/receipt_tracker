from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import logging
import json
import base64
from receipt_extractor import ReceiptExtractor

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize the receipt extractor
receipt_extractor = ReceiptExtractor()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "service": "receipt-extractor"})

@app.route('/process', methods=['POST'])
def process_receipt_endpoint():
    """
    Endpoint to process a receipt image
    Accepts:
    - base64 encoded image in 'image' field
    - or a file upload with name 'receiptImage'
    - or an S3 URL in 's3_url' field
    """
    try:
        logger.info("Received receipt processing request")
        
        # Check if the request has a JSON body with an image field
        if request.is_json and 'image' in request.json:
            # Get base64 image from JSON body
            image_data = request.json['image']
            logger.info("Processing base64 image from JSON body")
        
        # Check if the request is a multipart form with a file
        elif request.files and 'receiptImage' in request.files:
            # Get file from form
            file = request.files['receiptImage']
            logger.info(f"Processing file upload: {file.filename}")
            
            # Read the file
            image_data = file.read()
        
        # Check if the request has an S3 URL
        elif request.is_json and 's3_url' in request.json:
            s3_url = request.json['s3_url']
            logger.info(f"Processing S3 URL: {s3_url}")
            
            # Parse S3 URL format: s3://bucket-name/key
            if not s3_url.startswith('s3://'):
                return jsonify({"error": "Invalid S3 URL format"}), 400
            
            parts = s3_url[5:].split('/', 1)
            if len(parts) != 2:
                return jsonify({"error": "Invalid S3 URL format"}), 400
            
            bucket = parts[0]
            key = parts[1]
            
            # Import boto3 here to avoid import issues if not needed
            import boto3
            s3_client = boto3.client('s3')
            
            try:
                response = s3_client.get_object(Bucket=bucket, Key=key)
                image_data = response['Body'].read()
                logger.info(f"Successfully read image from S3: {s3_url}")
            except Exception as e:
                logger.error(f"Error reading from S3: {e}")
                return jsonify({"error": f"Failed to read from S3: {str(e)}"}), 500
        
        else:
            logger.error("No image data provided")
            return jsonify({
                "error": "No image data provided. Send either a base64 encoded 'image' in JSON, a file upload with name 'receiptImage', or an S3 URL in 's3_url'"
            }), 400
        
        # Process the receipt
        result = receipt_extractor.process_receipt(image_data)
        
        # Check if there was an error
        if 'error' in result and result['error']:
            logger.error(f"Error processing receipt: {result['error']}")
            return jsonify({"error": f"Receipt processing failed: {result['error']}"}), 500
        
        logger.info("Receipt processed successfully")
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/process-webhook', methods=['POST'])
def process_webhook():
    """
    Webhook endpoint for S3 event notifications
    This would be triggered by S3 events via SNS or directly
    """
    try:
        # Parse the incoming webhook
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 400
        
        data = request.json
        logger.info(f"Received webhook: {json.dumps(data)[:500]}...")
        
        # Check if this is an SNS message
        if 'Type' in data and data['Type'] == 'Notification':
            # Parse SNS message
            message = json.loads(data['Message'])
            records = message.get('Records', [])
        else:
            # Assume direct S3 event
            records = data.get('Records', [])
        
        if not records:
            return jsonify({"error": "No records found in event"}), 400
        
        results = []
        
        for record in records:
            # Check if this is an S3 event
            if record.get('eventSource') == 'aws:s3' or 's3' in record:
                s3_info = record.get('s3', {})
                bucket = s3_info.get('bucket', {}).get('name')
                key = s3_info.get('object', {}).get('key')
                
                if not bucket or not key:
                    logger.error(f"Invalid S3 event format: {json.dumps(record)}")
                    continue
                
                logger.info(f"Processing S3 object: s3://{bucket}/{key}")
                
                # Import boto3 here to avoid import issues if not needed
                import boto3
                s3_client = boto3.client('s3')
                
                try:
                    # Get the image from S3
                    response = s3_client.get_object(Bucket=bucket, Key=key)
                    image_data = response['Body'].read()
                    
                    # Process the receipt
                    result = receipt_extractor.process_receipt(image_data)
                    
                    # Store the result back to S3
                    result_key = key.replace('.jpg', '.json').replace('.jpeg', '.json').replace('.png', '.json')
                    result_key = f"processed/{result_key}"
                    
                    s3_client.put_object(
                        Bucket=bucket,
                        Key=result_key,
                        Body=json.dumps(result, indent=2),
                        ContentType='application/json'
                    )
                    
                    logger.info(f"Stored result in S3: s3://{bucket}/{result_key}")
                    
                    # If Supabase integration is enabled, update the database
                    supabase_url = os.environ.get('SUPABASE_URL')
                    supabase_key = os.environ.get('SUPABASE_SERVICE_KEY')
                    
                    if supabase_url and supabase_key:
                        from receipt_extractor import SupabaseHandler
                        
                        supabase_handler = SupabaseHandler(supabase_url, supabase_key)
                        
                        # Get the image URL for Supabase
                        image_url = f"s3://{bucket}/{key}"
                        
                        # Query Supabase to get the receipt ID based on image_url
                        import requests
                        
                        query_url = f"{supabase_url}/rest/v1/receipts?image_url=eq.{image_url}"
                        headers = {
                            "apikey": supabase_key,
                            "Authorization": f"Bearer {supabase_key}"
                        }
                        
                        response = requests.get(query_url, headers=headers)
                        
                        if response.status_code == 200 and response.json():
                            receipt_data = response.json()[0]
                            receipt_id = receipt_data.get('id')
                            
                            if receipt_id:
                                # Update the receipt data
                                supabase_handler.update_receipt_data(receipt_id, result)
                                logger.info(f"Updated Supabase receipt data for ID: {receipt_id}")
                            else:
                                logger.warning(f"Receipt found but no ID in response: {response.text}")
                        else:
                            logger.warning(f"No receipt found in Supabase for image_url: {image_url}")
                            logger.warning(f"Supabase response: {response.status_code} - {response.text}")
                    
                    results.append({
                        "bucket": bucket,
                        "key": key,
                        "processed": True,
                        "result_key": result_key
                    })
                    
                except Exception as e:
                    logger.error(f"Error processing S3 object {bucket}/{key}: {e}")
                    results.append({
                        "bucket": bucket,
                        "key": key,
                        "processed": False,
                        "error": str(e)
                    })
            else:
                logger.warning(f"Skipping non-S3 event: {json.dumps(record)}")
        
        return jsonify({
            "message": f"Processed {len(results)} records",
            "results": results
        })
        
    except Exception as e:
        logger.error(f"Error in webhook handler: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Get port from the environment or use default 5000
    port = int(os.environ.get('PORT', 5000))
    
    # Enable debug mode if not in production
    debug = os.environ.get('FLASK_ENV', 'development') == 'development'
    
    logger.info(f"Starting receipt extractor service on port {port}, debug={debug}")
    app.run(host='0.0.0.0', port=port, debug=debug)