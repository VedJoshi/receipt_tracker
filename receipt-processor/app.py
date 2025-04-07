from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import logging
import json
from receipt_processor import process_receipt

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "service": "receipt-processor"})

@app.route('/process', methods=['POST'])
def process_receipt_endpoint():
    """
    Endpoint to process a receipt image
    Accepts:
    - base64 encoded image in 'image' field
    - or a file upload with name 'receiptImage'
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
        
        else:
            logger.error("No image data provided")
            return jsonify({"error": "No image data provided. Send either a base64 encoded 'image' in JSON or a file upload with name 'receiptImage'"}), 400
        
        # Process the receipt
        result = process_receipt(image_data)
        
        # Check if there was an error
        if 'error' in result and result['error']:
            logger.error(f"Error processing receipt: {result['error']}")
            return jsonify({"error": f"Receipt processing failed: {result['error']}"}), 500
        
        logger.info("Receipt processed successfully")
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Get port from the environment or use default 5000
    port = int(os.environ.get('PORT', 5000))
    
    # Enable debug mode if not in production
    debug = os.environ.get('FLASK_ENV', 'development') == 'development'
    
    logger.info(f"Starting receipt processor service on port {port}, debug={debug}")
    app.run(host='0.0.0.0', port=port, debug=debug)