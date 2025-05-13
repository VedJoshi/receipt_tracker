from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import logging
import json
import base64
import pytesseract
import cv2
import numpy as np
from PIL import Image
import re
import tempfile

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configure pytesseract path for Windows
if os.name == 'nt':  # Windows
    pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "service": "receipt-processor"})

@app.route('/process', methods=['POST'])
def process_receipt_endpoint():
    """Process a receipt image from file upload or base64 encoded image"""
    try:
        logger.info("Received receipt processing request")
        
        # Get image data from request (either from file or JSON)
        image_data = None
        
        # Check if the request has a JSON body with an image field
        if request.is_json and 'image' in request.json:
            # Get base64 image from JSON body
            base64_image = request.json['image']
            # Remove data URL prefix if present
            if ',' in base64_image:
                base64_image = base64_image.split(',', 1)[1]
            image_data = base64.b64decode(base64_image)
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
        
        logger.info("Receipt processed successfully")
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

def process_receipt(image_data):
    """Process a receipt image and extract text/information"""
    try:
        # Convert bytes to numpy array
        nparr = np.frombuffer(image_data, np.uint8)
        # Decode image
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            raise ValueError("Failed to decode image")
        
        # Preprocess the image for better OCR
        # 1. Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # 2. Apply Gaussian blur
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # 3. Apply adaptive thresholding
        thresh = cv2.adaptiveThreshold(
            blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
        
        # 4. Save preprocessed image to a temporary file for Tesseract
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp:
            temp_filename = temp.name
            cv2.imwrite(temp_filename, thresh)
        
        # 5. Extract text using Tesseract
        text = pytesseract.image_to_string(temp_filename)
        
        # 6. Delete temporary file
        os.unlink(temp_filename)
        
        # 7. Extract structured information
        store_name = extract_store_name(text)
        total_amount = extract_total_amount(text)
        date = extract_purchase_date(text)
        items = extract_items(text)
        
        return {
            "extracted_text": text,
            "store_name": store_name,
            "total_amount": total_amount,
            "purchase_date": date,
            "items": items
        }
    except Exception as e:
        logger.error(f"Error processing receipt: {e}")
        return {
            "error": str(e),
            "extracted_text": None
        }

def extract_store_name(text):
    """Extract store name from text - usually one of the first lines"""
    lines = text.split('\n')
    for i in range(min(3, len(lines))):
        if lines[i].strip() and not re.search(r'\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}', lines[i]):
            return lines[i].strip()
    return None

def extract_total_amount(text):
    """Extract total amount from text"""
    # Common patterns for totals on receipts
    patterns = [
        r'TOTAL\s*\$?\s*(\d+\.\d{2})',
        r'Total\s*\$?\s*(\d+\.\d{2})',
        r'AMOUNT\s*\$?\s*(\d+\.\d{2})',
        r'BALANCE\s*\$?\s*(\d+\.\d{2})'
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            return float(matches[-1])  # Return the last match as it's likely the grand total
    
    return None

def extract_purchase_date(text):
    """Extract purchase date from text"""
    # Look for common date formats
    date_patterns = [
        r'\d{1,2}/\d{1,2}/\d{2,4}',  # MM/DD/YYYY or DD/MM/YYYY
        r'\d{1,2}-\d{1,2}-\d{2,4}',  # MM-DD-YYYY or DD-MM-YYYY
        r'\d{1,2}\.\d{1,2}\.\d{2,4}'  # MM.DD.YYYY or DD.MM.YYYY
    ]
    
    for pattern in date_patterns:
        matches = re.findall(pattern, text)
        if matches:
            return matches[0]  # Return the first date found
    
    return None

def extract_items(text):
    """Extract items and prices from the receipt"""
    items = []
    
    # Look for patterns like "Item name $12.34" or "Item name 12.34"
    lines = text.split('\n')
    for line in lines:
        # Skip header and footer lines
        if 'TOTAL' in line.upper() or 'SUBTOTAL' in line.upper():
            continue
            
        # Try to find price pattern at the end of the line
        match = re.search(r'(.+?)\s+\$?(\d+\.\d{2})\s*$', line)
        if match:
            name = match.group(1).strip()
            try:
                price = float(match.group(2))
                items.append({"name": name, "price": price})
            except ValueError:
                pass
    
    return items

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV', 'development') == 'development'
    
    logger.info(f"Starting receipt processor service on port {port}, debug={debug}")
    app.run(host='0.0.0.0', port=port, debug=debug)
