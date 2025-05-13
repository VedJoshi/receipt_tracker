import os
import json
import logging
import boto3
from flask import Flask, request, jsonify
from flask_cors import CORS
from custom_model import ReceiptTextExtractor
import base64
import requests
from botocore.exceptions import ClientError

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create Flask app and configure CORS
app = Flask(__name__)
CORS(app)

# Initialize the receipt text extractor model
logger.info("Initializing receipt text extractor model...")
text_extractor = ReceiptTextExtractor()
logger.info("Model initialized successfully")

# Initialize AWS S3 client
s3_client = None
try:
    s3_client = boto3.client('s3')
    logger.info("AWS S3 client initialized")
except Exception as e:
    logger.error(f"Error initializing S3 client: {e}")

# Initialize Supabase parameters
supabase_url = os.environ.get('SUPABASE_URL')
supabase_key = os.environ.get('SUPABASE_SERVICE_KEY')

def update_supabase_receipt(receipt_id, extracted_data):
    """Update receipt data in Supabase database"""
    if not supabase_url or not supabase_key:
        logger.warning("Supabase credentials not set, skipping database update")
        return False
    
    try:
        logger.info(f"Updating receipt data in Supabase for ID: {receipt_id}")
        
        # Endpoint for updating a receipt
        url = f"{supabase_url}/rest/v1/receipts?id=eq.{receipt_id}"
        
        # Prepare the data
        update_data = {
            "extracted_text": extracted_data.get("extracted_text"),
            "store_name": extracted_data.get("store_name"),
            "total_amount": extracted_data.get("total_amount"),
            "purchase_date": extracted_data.get("purchase_date"),
            "items": json.dumps(extracted_data.get("items", []))
        }
        
        # Make the request
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        
        response = requests.patch(url, json=update_data, headers=headers)
        
        if response.status_code == 204:
            logger.info(f"Successfully updated receipt data in Supabase: {receipt_id}")
            return True
        else:
            logger.error(f"Failed to update receipt data in Supabase: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        logger.error(f"Error updating receipt data in Supabase: {e}")
        return False

def find_receipt_by_image_url(image_url):
    """Find a receipt in Supabase by image URL"""
    if not supabase_url or not supabase_key:
        logger.warning("Supabase credentials not set, skipping database lookup")
        return None
    
    try:
        logger.info(f"Looking up receipt in Supabase by image_url: {image_url}")
        
        # Endpoint for querying receipts
        url = f"{supabase_url}/rest/v1/receipts?image_url=eq.{image_url}"
        
        # Make the request
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json"
        }
        
        response = requests.get(url, headers=headers)
        
        if response.status_code == 200 and response.json():
            receipt_data = response.json()[0]
            receipt_id = receipt_data.get('id')
            logger.info(f"Found receipt with ID: {receipt_id}")
            return receipt_id
        else:
            logger.warning(f"No receipt found for image_url: {image_url}")
            return None
            
    except Exception as e:
        logger.error(f"Error looking up receipt in Supabase: {e}")
        return None

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy", 
        "message": "Custom receipt model service is running",
        "model": "custom_text_extraction"
    })

@app.route('/process', methods=['POST'])
def process_receipt():
    """Process a receipt image directly via API call"""
    try:
        if request.is_json:
            # Process base64 image from request body
            data = request.json
            
            if 'image' in data:
                # Decode base64 image
                try:
                    image_data = base64.b64decode(data['image'])
                    logger.info(f"Received base64 image of size {len(image_data)} bytes")
                except Exception as e:
                    logger.error(f"Error decoding base64 image: {e}")
                    return jsonify({"error": "Invalid base64 image"}), 400
            
            elif 's3_uri' in data:
                # Extract from S3 URI
                s3_uri = data['s3_uri']
                logger.info(f"Processing image from S3: {s3_uri}")
                
                if s3_uri.startswith('s3://'):
                    parts = s3_uri[5:].split('/', 1)
                    if len(parts) == 2:
                        bucket, key = parts
                        
                        try:
                            if s3_client is None:
                                s3_client = boto3.client('s3')
                                
                            response = s3_client.get_object(Bucket=bucket, Key=key)
                            image_data = response['Body'].read()
                            logger.info(f"Successfully retrieved {len(image_data)} bytes from S3")
                        except Exception as e:
                            logger.error(f"Error retrieving from S3: {e}")
                            return jsonify({"error": f"S3 error: {str(e)}"}), 500
                    else:
                        return jsonify({"error": "Invalid S3 URI format"}), 400
                else:
                    return jsonify({"error": "Invalid S3 URI format"}), 400
            else:
                return jsonify({"error": "No image provided. Send 'image' (base64) or 's3_uri'"}), 400
        
        elif request.files and 'file' in request.files:
            # Process uploaded file
            file = request.files['file']
            image_data = file.read()
            logger.info(f"Received file upload: {file.filename}, size: {len(image_data)} bytes")
        
        else:
            return jsonify({"error": "No image provided"}), 400
        
        # Process the receipt with the custom model
        logger.info("Processing receipt with custom model")
        result = text_extractor.process_receipt(image_data)
        
        if 'error' in result and result['error']:
            logger.error(f"Error processing receipt: {result['error']}")
            return jsonify({"error": result['error']}), 500
        
        logger.info("Receipt processed successfully")
        
        # Check if we need to update Supabase
        receipt_id = data.get('receipt_id') if request.is_json and 'receipt_id' in data else None
        if receipt_id:
            update_supabase_receipt(receipt_id, result)
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/s3-webhook', methods=['POST'])
def s3_webhook():
    """Webhook endpoint for S3 event notifications"""
    try:
        # Check if request is JSON
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 400
        
        data = request.json
        logger.info(f"Received S3 event notification")
        
        # Parse S3 event notification
        if 'Records' in data:
            processed_count = 0
            for record in data['Records']:
                if 's3' in record and 'object' in record['s3'] and 'bucket' in record['s3']:
                    bucket = record['s3']['bucket']['name']
                    key = record['s3']['object']['key']
                    
                    logger.info(f"Processing S3 object: {bucket}/{key}")
                    
                    # Only process image files
                    if key.lower().endswith(('.jpg', '.jpeg', '.png', '.gif')):
                        try:
                            # Initialize S3 client if needed
                            if s3_client is None:
                                s3_client = boto3.client('s3')
                            
                            # Get the image from S3
                            response = s3_client.get_object(Bucket=bucket, Key=key)
                            image_data = response['Body'].read()
                            
                            # Process with the custom model
                            result = text_extractor.process_receipt(image_data)
                            
                            # Store the result back to S3 as JSON
                            result_key = key.split('.')
                            result_key = '.'.join(result_key[:-1]) + '.json'
                            processed_key = f"processed/{result_key}"
                            
                            s3_client.put_object(
                                Bucket=bucket,
                                Key=processed_key,
                                Body=json.dumps(result, indent=2),
                                ContentType='application/json'
                            )
                            
                            logger.info(f"Processed results saved to S3: {bucket}/{processed_key}")
                            
                            # Update Supabase if needed
                            image_url = f"s3://{bucket}/{key}"
                            receipt_id = find_receipt_by_image_url(image_url)
                            
                            if receipt_id:
                                update_success = update_supabase_receipt(receipt_id, result)
                                if update_success:
                                    logger.info(f"Updated Supabase record for receipt ID: {receipt_id}")
                                else:
                                    logger.warning(f"Failed to update Supabase record for receipt ID: {receipt_id}")
                            
                            processed_count += 1
                            
                        except ClientError as e:
                            logger.error(f"AWS Error processing {bucket}/{key}: {e}")
                        except Exception as e:
                            logger.error(f"Error processing {bucket}/{key}: {e}")
                            continue
            
            return jsonify({
                "message": f"Processed {processed_count} images successfully",
                "processed_count": processed_count
            })
        
        return jsonify({"message": "No valid S3 records found in webhook data"})
        
    except Exception as e:
        logger.error(f"Error in S3 webhook: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV") == "development"
    
    logger.info(f"Starting receipt extractor service on port {port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
