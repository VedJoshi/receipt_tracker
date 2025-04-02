from flask import Flask, request, jsonify
import os
import tempfile
import base64
import json
import logging
from receipt_processor import process_receipt

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy"})

@app.route('/process', methods=['POST'])
def process_receipt_endpoint():
    try:
        # Log request received
        logger.info("Received receipt processing request")
        
        # Get the image from the request
        request_data = request.json
        if not request_data or 'image' not in request_data:
            return jsonify({"error": "No image data provided"}), 400
        
        # Decode base64 image
        try:
            image_data = base64.b64decode(request_data['image'])
            logger.info(f"Decoded image, size: {len(image_data)} bytes")
        except Exception as e:
            logger.error(f"Failed to decode base64 image: {str(e)}")
            return jsonify({"error": "Invalid base64 image data"}), 400
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as temp:
            temp.write(image_data)
            temp_filename = temp.name
            logger.info(f"Image saved to temporary file: {temp_filename}")
        
        try:
            # Process with our OpenCV receipt processor
            result = process_receipt(temp_filename)
            logger.info(f"Receipt processed successfully: {json.dumps(result)}")
            
            # Clean up the temporary file
            os.unlink(temp_filename)
            logger.info(f"Temporary file removed: {temp_filename}")
            
            return jsonify(result)
        except Exception as e:
            logger.error(f"Error processing receipt: {str(e)}")
            # Clean up the temporary file even if processing fails
            try:
                os.unlink(temp_filename)
                logger.info(f"Temporary file removed after error: {temp_filename}")
            except:
                pass
            return jsonify({"error": f"Receipt processing failed: {str(e)}"}), 500
            
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)