import cv2
import numpy as np
import pytesseract
import re
from PIL import Image
import io
import base64
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def preprocess_image(image_data):
    """Preprocess the image for better OCR results"""
    try:
        # Convert bytes to numpy array
        nparr = np.frombuffer(image_data, np.uint8)
        # Decode image
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("Failed to decode image")
        
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Apply adaptive thresholding
        thresh = cv2.adaptiveThreshold(
            blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
        
        return thresh
    except Exception as e:
        logger.error(f"Error preprocessing image: {e}")
        raise

def extract_text(preprocessed_image):
    """Extract text from the preprocessed image using Tesseract OCR"""
    try:
        # Convert numpy array to PIL Image
        pil_image = Image.fromarray(preprocessed_image)
        
        # Apply OCR
        text = pytesseract.image_to_string(pil_image)
        return text
    except Exception as e:
        logger.error(f"Error extracting text: {e}")
        raise

def extract_store_name(text):
    """Extract store name from OCR text"""
    lines = text.split('\n')
    for i in range(min(3, len(lines))):
        if lines[i].strip() and not re.search(r'\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}', lines[i]):
            return lines[i].strip()
    return None

def extract_total_amount(text):
    """Extract total amount from OCR text"""
    patterns = [
        r'TOTAL\s*\$?\s*(\d+\.\d{2})',
        r'Total\s*\$?\s*(\d+\.\d{2})',
        r'AMOUNT\s*\$?\s*(\d+\.\d{2})',
        r'BALANCE\s*\$?\s*(\d+\.\d{2})'
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            return float(matches[-1])  # Return the last match
    
    return None

def extract_purchase_date(text):
    """Extract purchase date from OCR text"""
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

def process_receipt(image_data):
    """Process a receipt image and extract text/information"""
    try:
        # Preprocess the image
        preprocessed = preprocess_image(image_data)
        
        # Extract text
        text = extract_text(preprocessed)
        
        # Extract structured information
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
            "extracted_text": "Error processing receipt"
        }