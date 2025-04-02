import cv2
import numpy as np
import pytesseract
from PIL import Image
import io
import re
import json
import os
import boto3
from botocore.exceptions import ClientError
import logging
from flask import Flask, request, jsonify
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Initialize AWS S3 client
s3_client = boto3.client(
    's3',
    region_name=os.environ.get('AWS_REGION', 'ap-southeast-1'),
    aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY')
)

# Initialize Supabase client (if needed for direct DB updates)
# We'll use HTTP requests for simplicity instead of the supabase-py library

# Configure pytesseract path if running in Docker
if os.path.exists('/usr/bin/tesseract'):
    pytesseract.pytesseract.tesseract_cmd = '/usr/bin/tesseract'

def download_image_from_s3(bucket, key):
    """Download an image from S3 bucket"""
    try:
        logger.info(f"Downloading image from S3: {bucket}/{key}")
        response = s3_client.get_object(Bucket=bucket, Key=key)
        image_content = response['Body'].read()
        return image_content
    except ClientError as e:
        logger.error(f"Error downloading image from S3: {e}")
        raise

def preprocess_image(image_bytes):
    """Preprocess the image to improve OCR results"""
    # Convert bytes to numpy array
    nparr = np.frombuffer(image_bytes, np.uint8)
    # Decode image
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # Check if image was loaded correctly
    if image is None:
        raise ValueError("Failed to decode image")
    
    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # Apply adaptive thresholding to enhance text
    thresh = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )
    
    # Use morphological operations to further clean the image
    kernel = np.ones((1, 1), np.uint8)
    opening = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    
    return opening

def extract_text(preprocessed_image):
    """Extract text from the preprocessed image using Tesseract OCR"""
    # Convert numpy array to PIL Image
    pil_image = Image.fromarray(preprocessed_image)
    
    # Apply OCR using pytesseract
    text = pytesseract.image_to_string(pil_image)
    
    logger.info("Text extraction completed")
    return text

def extract_store_name(text):
    """Extract store name from OCR text"""
    # Split text into lines
    lines = text.split('\n')
    
    # Typically, store name appears in the first few lines
    # This is a simplified approach and might need refinement
    store_candidates = [line.strip() for line in lines[:5] if line.strip()]
    
    # Return the first non-empty candidate that is not a date, time, or address pattern
    for candidate in store_candidates:
        # Skip if it looks like a date
        if re.search(r'\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}', candidate):
            continue
        
        # Skip if it looks like a time
        if re.search(r'\d{1,2}:\d{2}', candidate):
            continue
        
        # Skip if it looks like a phone number
        if re.search(r'\d{3}[.\-\s]?\d{3}[.\-\s]?\d{4}', candidate):
            continue
        
        # Skip if it has too many digits
        if sum(c.isdigit() for c in candidate) > len(candidate) / 3:
            continue
        
        return candidate
    
    return "Unknown Store"

def extract_total_amount(text):
    """Extract total amount from OCR text"""
    # Patterns to look for total amount
    total_patterns = [
        r'TOTAL\s*[\$]?\s*(\d+[\.,]\d{2})',
        r'Total\s*[\$]?\s*(\d+[\.,]\d{2})',
        r'AMOUNT\s*[\$]?\s*(\d+[\.,]\d{2})',
        r'Amount\s*[\$]?\s*(\d+[\.,]\d{2})',
        r'SUBTOTAL\s*[\$]?\s*(\d+[\.,]\d{2})',
        r'GRAND TOTAL\s*[\$]?\s*(\d+[\.,]\d{2})',
    ]
    
    for pattern in total_patterns:
        matches = re.search(pattern, text)
        if matches:
            return float(matches.group(1).replace(',', '.'))
    
    # If we can't find a specific total, look for dollar amounts
    # and take the largest one as a fallback
    dollar_amounts = re.findall(r'[\$]?\s*(\d+[\.,]\d{2})', text)
    if dollar_amounts:
        try:
            amounts = [float(amount.replace(',', '.')) for amount in dollar_amounts]
            return max(amounts)
        except ValueError:
            pass
    
    return None

def extract_purchase_date(text):
    """Extract purchase date from OCR text"""
    # Common date formats
    date_patterns = [
        r'(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2,4})',  # MM/DD/YYYY or DD/MM/YYYY
        r'(\d{4})[/\-\.](\d{1,2})[/\-\.](\d{1,2})',    # YYYY/MM/DD
        r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{1,2}),? (\d{4})',  # Month DD, YYYY
        r'(\d{1,2}) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4})'     # DD Month YYYY
    ]
    
    for pattern in date_patterns:
        matches = re.search(pattern, text)
        if matches:
            if len(matches.groups()) == 3:
                # For numeric patterns
                # Assume MM/DD/YYYY format for simplicity
                # In a production scenario, you'd need to handle different regional formats
                month, day, year = matches.groups()
                
                # Handle 2-digit year
                if len(year) == 2:
                    year = '20' + year if int(year) < 50 else '19' + year
                    
                return f"{month}/{day}/{year}"
            else:
                # For text patterns
                return matches.group(0)
    
    return None

def extract_items(text):
    """
    Extract list of items with prices
    This is a simplified approach and might need refinement based on receipt format
    """
    # This is a challenging task and often requires custom training for specific receipt formats
    # Here's a simplified approach that might work for some receipt formats
    
    lines = text.split('\n')
    items = []
    
    for line in lines:
        # Look for lines with a price pattern at the end
        match = re.search(r'(.+?)\s+[\$]?(\d+[\.,]\d{2})$', line.strip())
        if match:
            item_name = match.group(1).strip()
            item_price = float(match.group(2).replace(',', '.'))
            
            # Skip if it looks like a total, subtotal, tax, etc.
            skip_keywords = ['total', 'subtotal', 'tax', 'change', 'cash', 'credit', 'debit', 'balance', 'due']
            if any(keyword in item_name.lower() for keyword in skip_keywords):
                continue
                
            items.append({
                "name": item_name,
                "price": item_price
            })
    
    return items

def parse_s3_uri(s3_uri):
    """Parse S3 URI into bucket and key"""
    if not s3_uri.startswith('s3://'):
        raise ValueError("Invalid S3 URI format")
    
    path = s3_uri[5:]  # Remove 's3://'
    parts = path.split('/', 1)
    
    if len(parts) == 1:
        bucket = parts[0]
        key = ''
    else:
        bucket, key = parts
    
    return bucket, key

def process_receipt(image_uri):
    """
    Process a receipt image and extract information
    
    Args:
        image_uri: S3 URI of the image (s3://bucket/key)
        
    Returns:
        dict: Extracted receipt information
    """
    try:
        # Parse S3 URI
        bucket, key = parse_s3_uri(image_uri)
        
        # Download image from S3
        image_bytes = download_image_from_s3(bucket, key)
        
        # Preprocess image
        preprocessed = preprocess_image(image_bytes)
        
        # Extract text using OCR
        extracted_text = extract_text(preprocessed)
        
        # Extract structured data
        store_name = extract_store_name(extracted_text)
        total_amount = extract_total_amount(extracted_text)
        purchase_date = extract_purchase_date(extracted_text)
        items = extract_items(extracted_text)
        
        # Return structured results
        result = {
            "extracted_text": extracted_text,
            "store_name": store_name,
            "total_amount": total_amount,
            "purchase_date": purchase_date,
            "items": items
        }
        
        logger.info(f"Receipt processing completed: {store_name}, {total_amount}, {purchase_date}")
        return result
        
    except Exception as e:
        logger.error(f"Error processing receipt: {e}", exc_info=True)
        raise

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "service": "receipt-processor"})

@app.route('/process', methods=['POST'])
def process_receipt_endpoint():
    """Endpoint to process a receipt image"""
    try:
        # Get request data
        data = request.json
        
        if not data or 'image_uri' not in data:
            return jsonify({"error": "Missing image_uri in request"}), 400
            
        image_uri = data['image_uri']
        receipt_id = data.get('receipt_id')
        callback_url = data.get('callback_url')
        
        # Process the receipt
        result = process_receipt(image_uri)
        
        # If a callback URL is provided, send results there
        if callback_url:
            payload = {
                "receipt_id": receipt_id,
                "processing_result": result
            }
            
            try:
                response = requests.post(callback_url, json=payload)
                logger.info(f"Callback response: {response.status_code}")
            except Exception as e:
                logger.error(f"Error sending callback: {e}")
                # Continue processing even if callback fails
        
        # Return the result
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in process endpoint: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)