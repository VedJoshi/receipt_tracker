import cv2
import numpy as np
import pytesseract
from PIL import Image
import io
import re
import json
import os
import logging
import base64

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

if os.name == 'nt':  # Windows
    pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# Configure pytesseract path if running in Docker
if os.path.exists('/usr/bin/tesseract'):
    pytesseract.pytesseract.tesseract_cmd = '/usr/bin/tesseract'

def preprocess_image(image_data):
    """
    Preprocess the image to improve OCR results
    
    Args:
        image_data: Either a bytes object or a file path
    """
    # Load image data
    if isinstance(image_data, str) and os.path.exists(image_data):
        # Load from file path
        image = cv2.imread(image_data)
    else:
        # Convert bytes to numpy array
        nparr = np.frombuffer(image_data, np.uint8)
        # Decode image
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    # Check if image was loaded correctly
    if image is None:
        raise ValueError("Failed to decode image")
    
    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # Increase contrast using histogram equalization
    # This can help with faded receipt text
    equalized = cv2.equalizeHist(blurred)
    
    # Apply adaptive thresholding to enhance text
    thresh = cv2.adaptiveThreshold(
        equalized, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )
    
    # Use morphological operations to further clean the image
    kernel = np.ones((1, 1), np.uint8)
    opening = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    
    # Dilate text slightly to make it more readable
    kernel = np.ones((1, 1), np.uint8)
    dilated = cv2.dilate(opening, kernel, iterations=1)
    
    # Optional: Write the preprocessed image for debugging
    # cv2.imwrite('preprocessed.jpg', dilated)
    
    return dilated

def extract_text(preprocessed_image):
    """Extract text from the preprocessed image using Tesseract OCR"""
    # Convert numpy array to PIL Image
    pil_image = Image.fromarray(preprocessed_image)
    
    # Configure Tesseract options
    # -l eng: Use English language
    # --oem 3: Use LSTM OCR Engine mode
    # --psm 4: Assume a single column of text (typical for receipts)
    config = '--oem 3 --psm 4 -l eng'
    
    # Apply OCR using pytesseract
    text = pytesseract.image_to_string(pil_image, config=config)
    
    logger.info("Text extraction completed")
    return text

def extract_store_name(text):
    """Extract store name from OCR text"""
    # Split text into lines
    lines = text.split('\n')
    
    # Typically, store name appears in the first few lines
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
        r'TOTAL\s*[\$£€]?\s*(\d+[\.,]\d{2})',
        r'Total\s*[\$£€]?\s*(\d+[\.,]\d{2})',
        r'AMOUNT\s*[\$£€]?\s*(\d+[\.,]\d{2})',
        r'Amount\s*[\$£€]?\s*(\d+[\.,]\d{2})',
        r'SUBTOTAL\s*[\$£€]?\s*(\d+[\.,]\d{2})',
        r'GRAND TOTAL\s*[\$£€]?\s*(\d+[\.,]\d{2})',
        r'BALANCE\s*[\$£€]?\s*(\d+[\.,]\d{2})',
        r'AMOUNT DUE\s*[\$£€]?\s*(\d+[\.,]\d{2})',
    ]
    
    for pattern in total_patterns:
        matches = re.search(pattern, text, re.IGNORECASE)
        if matches:
            return float(matches.group(1).replace(',', '.'))
    
    # If we can't find a specific total, look for dollar amounts
    # and take the largest one as a fallback
    dollar_amounts = re.findall(r'[\$£€]?\s*(\d+[\.,]\d{2})', text)
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
    
    # Look for date keywords to help narrow the search
    date_keywords = ['Date:', 'DATE:', 'Transaction Date:', 'Purchase Date:']
    
    # First, try to find dates with keywords
    for keyword in date_keywords:
        if keyword in text:
            line_with_date = None
            for line in text.split('\n'):
                if keyword in line:
                    line_with_date = line
                    break
            
            if line_with_date:
                for pattern in date_patterns:
                    match = re.search(pattern, line_with_date)
                    if match:
                        return match.group(0)
    
    # If that fails, look for any date pattern in the entire text
    for pattern in date_patterns:
        matches = re.search(pattern, text)
        if matches:
            if len(matches.groups()) == 3:
                # For numeric patterns
                return matches.group(0)
            else:
                # For text patterns
                return matches.group(0)
    
    return None

def extract_items(text):
    """
    Extract list of items with prices
    This is a simplified approach and might need refinement based on receipt format
    """
    lines = text.split('\n')
    items = []
    
    # Common patterns for item lines in receipts
    # 1. ITEM NAME               $PRICE
    # 2. ITEM NAME $PRICE
    # 3. QTY X ITEM NAME         $PRICE
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Skip lines that are likely headers or footers
        skip_keywords = ['receipt', 'invoice', 'order', 'tel:', 'phone:', 'address:',
                         'cashier:', 'register:', 'terminal:', 'customer:', 'thank you',
                         'date:', 'time:']
                         
        if any(keyword in line.lower() for keyword in skip_keywords):
            continue
        
        # Look for price pattern at end of line
        price_match = re.search(r'.*?[\$£€]?\s*(\d+[\.,]\d{2})\s*$', line)
        if not price_match:
            continue
            
        price_str = price_match.group(1)
        price = float(price_str.replace(',', '.'))
        
        # Extract item name by removing the price part
        item_name = line[:line.rfind(price_str)].strip()
        item_name = re.sub(r'[\$£€]', '', item_name).strip()
        
        # Skip if it looks like a total, subtotal, tax, etc.
        skip_item_keywords = ['total', 'subtotal', 'tax', 'change', 'cash', 'credit', 
                             'debit', 'balance', 'due', 'payment', 'tender']
                             
        if any(keyword in item_name.lower() for keyword in skip_item_keywords):
            continue
            
        # Skip if the item name is very short (likely not a real item)
        if len(item_name) < 3:
            continue
            
        # Try to extract quantity if present
        qty = 1
        qty_match = re.match(r'(\d+)\s*[xX]\s*', item_name)
        if qty_match:
            try:
                qty = int(qty_match.group(1))
                # Remove the quantity part from the item name
                item_name = re.sub(r'^\d+\s*[xX]\s*', '', item_name)
            except ValueError:
                pass
                
        items.append({
            "name": item_name,
            "price": price,
            "quantity": qty
        })
    
    return items

def process_receipt(image_data):
    """
    Process a receipt image and extract information
    
    Args:
        image_data: Either a file path, bytes object, or base64 encoded string
        
    Returns:
        dict: Extracted receipt information
    """
    try:
        # Handle different input types
        if isinstance(image_data, str):
            # Try to treat it as a file path first
            try:
                # Open the file to see if it exists and can be read
                with open(image_data, 'rb') as f:
                    image_bytes = f.read()
                logger.info(f"Successfully read image from file: {image_data}")
                return process_receipt_from_bytes(image_bytes)
            except (FileNotFoundError, IOError) as e:
                logger.warning(f"Could not open as file: {e}, trying other formats")
                
                # Not a file, try other formats
                if image_data.startswith('data:image/'):
                    # It's a data URL
                    logger.info("Processing image from data URL")
                    _, encoded = image_data.split(',', 1)
                    image_bytes = base64.b64decode(encoded)
                    return process_receipt_from_bytes(image_bytes)
                elif image_data.startswith('s3://'):
                    # For S3 URIs
                    logger.error("S3 URIs not implemented in this version")
                    raise NotImplementedError("S3 URI processing not implemented")
                else:
                    # Try base64 decode as last resort
                    logger.info("Trying as base64 string")
                    try:
                        image_bytes = base64.b64decode(image_data)
                        return process_receipt_from_bytes(image_bytes)
                    except Exception as e:
                        logger.error(f"Error decoding as base64: {e}")
                        raise ValueError(f"Could not process input as file path or base64: {e}")
        else:
            # Assume it's already bytes
            logger.info("Processing image from bytes object")
            return process_receipt_from_bytes(image_data)
            
    except Exception as e:
        logger.error(f"Error processing receipt: {e}", exc_info=True)
        return {
            "error": str(e),
            "extracted_text": None,
            "store_name": None,
            "total_amount": None,
            "purchase_date": None,
            "items": []
        }

def process_receipt_from_file(file_path):
    """Process receipt directly from a file path"""
    # Directly read the image file using OpenCV
    image = cv2.imread(file_path)
    
    if image is None:
        raise ValueError(f"Failed to load image from {file_path}")
    
    # Convert to grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # Increase contrast using histogram equalization
    equalized = cv2.equalizeHist(blurred)
    
    # Apply adaptive thresholding to enhance text
    thresh = cv2.adaptiveThreshold(
        equalized, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )
    
    # Use morphological operations to further clean the image
    kernel = np.ones((1, 1), np.uint8)
    opening = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    
    # Dilate text slightly to make it more readable
    kernel = np.ones((1, 1), np.uint8)
    preprocessed = cv2.dilate(opening, kernel, iterations=1)
    
    # Extract text and other information
    extracted_text = extract_text(preprocessed)
    logger.info(f"Extracted text (first 500 chars): {extracted_text[:500]}")
    
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

def process_receipt_from_bytes(image_bytes):
    """Process receipt from bytes data"""
    # Convert bytes to numpy array
    nparr = np.frombuffer(image_bytes, np.uint8)
    
    # Decode image
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if image is None:
        raise ValueError("Failed to decode image bytes")
    
    # Continue with the same preprocessing as above
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    equalized = cv2.equalizeHist(blurred)
    thresh = cv2.adaptiveThreshold(
        equalized, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )
    kernel = np.ones((1, 1), np.uint8)
    opening = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
    kernel = np.ones((1, 1), np.uint8)
    preprocessed = cv2.dilate(opening, kernel, iterations=1)
    
    # Extract text and other information
    extracted_text = extract_text(preprocessed)
    logger.info(f"Extracted text (first 500 chars): {extracted_text[:500]}")
    
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

# For testing directly
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        result = process_receipt(image_path)
        print(json.dumps(result, indent=2))
    else:
        print("Usage: python receipt_processor.py <image_path>")