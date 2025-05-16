from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import io
import base64
import logging
from receipt_processor import process_receipt

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.route('/process', methods=['POST'])
def process_receipt_endpoint():
    try:
        if not request.json or 'image' not in request.json:
            return jsonify({"error": "Missing image data"}), 400
        
        # Get base64 image from request
        image_data = request.json['image']
        if image_data.startswith('data:image'):
            # Remove data URL prefix if present
            image_data = image_data.split(',')[1]
        
        # Decode base64 to binary
        image_bytes = base64.b64decode(image_data)
        
        # Process the receipt
        result = process_receipt(image_bytes)
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
