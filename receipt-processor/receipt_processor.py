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
    Enhanced preprocessing for receipt images to improve OCR results
    
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
    
    # Store original image for multiple processing attempts
    original = image.copy()
    results = []
    
    # Attempt 1: Basic grayscale + adaptive threshold
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
    results.append(thresh)
    
    # Attempt 2: Bilateral filtering (preserves edges while removing noise)
    bilateral = cv2.bilateralFilter(gray, 11, 17, 17)
    adap_thresh = cv2.adaptiveThreshold(bilateral, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
    results.append(adap_thresh)
    
    # Attempt 3: CLAHE (Contrast Limited Adaptive Histogram Equalization)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    cl1 = clahe.apply(gray)
    ret, thresh2 = cv2.threshold(cl1, 150, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    results.append(thresh2)
    
    # Attempt 4: Sharpening
    kernel_sharpen = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    sharpened = cv2.filter2D(gray, -1, kernel_sharpen)
    thresh3 = cv2.adaptiveThreshold(sharpened, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
    results.append(thresh3)
    
    # Attempt 5: Deskew (straighten) the image if it's tilted
    def deskew(img):
        coords = np.column_stack(np.where(img > 0))
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
        (h, w) = img.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        return rotated
    
    # Try to deskew the third result (often works well with CLAHE)
    try:
        deskewed = deskew(thresh2)
        results.append(deskewed)
    except:
        logger.warning("Deskew operation failed, skipping")
    
    # Return all processed images for OCR attempts
    return results

def extract_text(preprocessed_images):
    """
    Extract text from preprocessed images using multiple configurations
    Returns the best result based on confidence score
    """
    best_text = ""
    best_conf = -1
    
    # Different OCR configurations to try
    configs = [
        '--oem 3 --psm 4 -l eng',  # Assume a single column of text
        '--oem 3 --psm 6 -l eng',  # Assume a single uniform block of text
        '--oem 3 --psm 3 -l eng',  # Fully automatic page segmentation
        '--oem 1 --psm 4 -l eng',  # Using legacy engine which may work better for some receipts
        '--oem 1 --psm 6 -l eng'   # Legacy engine with uniform block assumption
    ]
    
    for img in preprocessed_images:
        pil_image = Image.fromarray(img)
        for config in configs:
            try:
                # Extract text with current configuration
                text = pytesseract.image_to_string(pil_image, config=config)
                
                # Calculate a simple confidence score based on text length and non-empty lines
                lines = [line for line in text.split('\n') if line.strip()]
                if not lines:
                    continue
                
                conf_score = len(text) * len(lines)
                
                # Check if it has some expected receipt patterns to boost confidence
                if re.search(r'total|amount|price|subtotal|balance|item|qty|quantity', text, re.IGNORECASE):
                    conf_score *= 1.5
                
                if re.search(r'\$\d+\.\d{2}|\d+\.\d{2}', text):
                    conf_score *= 1.2
                    
                # If this is the best result so far, save it
                if conf_score > best_conf:
                    best_text = text
                    best_conf = conf_score
            except Exception as e:
                logger.error(f"OCR error with config {config}: {str(e)}")
                continue
    
    if best_text:
        logger.info(f"Text extraction completed. Confidence score: {best_conf}")
        return best_text
    else:
        logger.warning("Failed to extract text from all attempts")
        return ""

def extract_store_name(text):
    """Extract store name from OCR text with improved patterns"""
    # Split text into lines
    lines = text.split('\n')
    
    # Typically, store name appears in the first few lines
    store_candidates = [line.strip() for line in lines[:7] if line.strip()]
    
    # Common store name indicators
    store_indicators = [
        r'welcome to',
        r'store:',
        r'restaurant:',
        r'shop:',
        r'location:',
        r'branch:',
    ]
    
    # First look for lines with store indicators
    for indicator in store_indicators:
        for line in store_candidates:
            if re.search(indicator, line.lower()):
                # Return the part after the indicator
                match = re.search(rf'{indicator}\s*(.*)', line.lower())
                if match:
                    return match.group(1).strip()
                else:
                    # Or just return the whole line if it's short
                    if len(line) < 30:
                        return line.strip()
    
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
        
        # Skip if too short
        if len(candidate) < 3:
            continue
            
        # Skip common receipt headers
        skip_terms = ['receipt', 'invoice', 'order', 'tel:', 'phone:', 'fax:', 
                     'customer copy', 'merchant copy']
        if any(term in candidate.lower() for term in skip_terms):
            continue
            
        return candidate
    
    return "Unknown Store"

def extract_total_amount(text):
    """Extract total amount from OCR text with improved patterns"""
    # Patterns to look for total amount
    total_patterns = [
        # Most common total patterns
        r'(?:total|tot)(?:[\s:]*|[\s:]*\$[\s:]*)([\d,]+\.\d{2})',
        r'(?:total|tot)(?:[\s:]*|[\s:]*\$[\s:]*)([\d,]+)',
        # Patterns with currency symbols
        r'(?:total|tot|sum)[\s:]*[\$£€]([\d,]+\.\d{2})',
        r'[\$£€]\s*([\d,]+\.\d{2})(?=\s*(?:total|tot|sum))',
        # Additional total variations
        r'(?:amount|amt)(?:[\s:]*|[\s:]*\$[\s:]*)([\d,]+\.\d{2})',
        r'(?:grand total|g\.total|g total)(?:[\s:]*|[\s:]*\$[\s:]*)([\d,]+\.\d{2})',
        r'(?:balance|bal)(?:[\s:]*|[\s:]*\$[\s:]*)([\d,]+\.\d{2})',
        r'(?:amount due|amt due)(?:[\s:]*|[\s:]*\$[\s:]*)([\d,]+\.\d{2})',
        # Look for word "TOTAL" near the end of receipt with a number nearby
        r'total\W+[\$£€]?\s*([\d,]+\.\d{2})',
        r'[\$£€]?\s*([\d,]+\.\d{2})\W+total',
    ]
    
    # Check each pattern
    for pattern in total_patterns:
        matches = re.search(pattern, text, re.IGNORECASE)
        if matches:
            try:
                amount_str = matches.group(1).replace(',', '')
                return float(amount_str)
            except (ValueError, IndexError):
                continue
    
    # If no matches, try to find the last number that appears after "total" or similar words
    last_amount = None
    for line in text.split('\n'):
        if re.search(r'total|amount|balance|sum|due', line, re.IGNORECASE):
            # Find all numbers in this line
            amounts = re.findall(r'[\$£€]?\s*([\d,]+\.\d{2})', line)
            if amounts:
                try:
                    last_amount = float(amounts[-1].replace(',', ''))
                except ValueError:
                    continue
    
    if last_amount:
        return last_amount
    
    # If we still can't find a specific total, look for dollar amounts
    # and take the largest one as a fallback
    dollar_amounts = re.findall(r'[\$£€]?\s*([\d,]+\.\d{2})', text)
    if dollar_amounts:
        try:
            amounts = [float(amount.replace(',', '')) for amount in dollar_amounts]
            return max(amounts)
        except ValueError:
            pass
    
    return None

def extract_purchase_date(text):
    """Extract purchase date with improved patterns and normalize to ISO format"""
    # Common date formats
    date_patterns = [
        r'(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2,4})',  # MM/DD/YYYY or DD/MM/YYYY
        r'(\d{4})[/\-\.](\d{1,2})[/\-\.](\d{1,2})',    # YYYY/MM/DD
        r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{1,2}),? (\d{4})',  # Month DD, YYYY
        r'(\d{1,2}) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4})',     # DD Month YYYY
        r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[.\-\s]+(\d{1,2})[.\-\s]+(\d{4})'  # Month DD YYYY
    ]
    
    # Date-related keywords to look for
    date_keywords = [
        'date:', 'date', 'receipt date:', 'receipt date', 
        'purchase date:', 'purchase date', 'transaction date:',
        'transaction date', 'order date:', 'order date'
    ]
    
    # First try to find lines with date keywords
    date_lines = []
    for line in text.split('\n'):
        if any(keyword.lower() in line.lower() for keyword in date_keywords):
            date_lines.append(line)
    
    # If no specific date lines found, use all lines
    if not date_lines:
        date_lines = text.split('\n')
    
    # Try to extract dates from date-specific lines first
    for line in date_lines:
        for pattern in date_patterns:
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                date_str = match.group(0)
                iso_date = normalize_date(date_str)
                return iso_date if iso_date else date_str
    
    # If that fails, check the entire text
    for pattern in date_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            date_str = match.group(0)
            iso_date = normalize_date(date_str)
            return iso_date if iso_date else date_str
    
    return None

def normalize_date(date_str):
    """Convert various date formats to ISO format (YYYY-MM-DD)"""
    try:
        # Try to identify the format
        if re.match(r'\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{4}', date_str):
            # DD/MM/YYYY or MM/DD/YYYY format
            parts = re.split(r'[/\-\.]', date_str)
            
            # Check which is more likely (DD/MM or MM/DD)
            day, month = int(parts[0]), int(parts[1])
            
            # Simple heuristic: if first number > 12, it's likely DD/MM
            if day > 12:
                # It's DD/MM/YYYY
                return f"{parts[2]}-{parts[1]:0>2}-{parts[0]:0>2}"
            else:
                # Try to guess based on region (default to MM/DD/YYYY for US)
                # You might want to make this configurable
                return f"{parts[2]}-{parts[0]:0>2}-{parts[1]:0>2}"
                
        elif re.match(r'\d{4}[/\-\.]\d{1,2}[/\-\.]\d{1,2}', date_str):
            # YYYY/MM/DD format
            parts = re.split(r'[/\-\.]', date_str)
            return f"{parts[0]}-{parts[1]:0>2}-{parts[2]:0>2}"
            
        elif re.match(r'[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}', date_str):
            # Month DD, YYYY format
            from datetime import datetime
            return datetime.strptime(date_str, "%B %d, %Y").strftime("%Y-%m-%d")
        
        # Add more formats as needed
        
        return None
    except Exception as e:
        logger.warning(f"Failed to normalize date '{date_str}': {e}")
        return None

def extract_items(text):
    """
    Extract list of items with prices - improved version
    Handles different receipt layouts and formats
    """
    lines = text.split('\n')
    items = []
    in_items_section = False
    
    # Skip words often found in headers/footers
    skip_keywords = ['receipt', 'invoice', 'order', 'tel:', 'phone:', 'address:',
                    'cashier:', 'register:', 'terminal:', 'customer:', 'thank you',
                    'date:', 'time:', 'subtotal', 'tax', 'total']
    
    # Words that might indicate start of items section
    item_section_starts = ['item', 'description', 'qty', 'price', 'amount']
    
    # Words that might indicate end of items section
    item_section_ends = ['subtotal', 'sub-total', 'sub total', 'total', 
                        'tax', 'balance', 'amount due', 'payment']
    
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
            
        # Check if this line indicates start of items section
        if any(keyword.lower() in line.lower() for keyword in item_section_starts) and not in_items_section:
            in_items_section = True
            continue
            
        # Check if this line indicates end of items section
        if any(keyword.lower() in line.lower() for keyword in item_section_ends) and in_items_section:
            in_items_section = False
            continue
        
        # If we haven't identified an items section yet, consider all lines
        # until we find an end marker or until the end of the receipt
        if not in_items_section and i > 5:  # Skip first few lines (usually header)
            # Look for price pattern at end of line as a heuristic for item lines
            price_match = re.search(r'.*?[\$£€]?\s*(\d+[\.,]\d{2})\s*$', line)
            if price_match:
                in_items_section = True
            else:
                continue
                
        # Skip lines that are likely headers or footers
        if any(keyword in line.lower() for keyword in skip_keywords):
            continue
        
        # Look for price pattern at end of line
        price_match = re.search(r'.*?[\$£€]?\s*(\d+[\.,]\d{2})\s*$', line)
        if not price_match:
            continue
            
        price_str = price_match.group(1).replace(',', '.')
        try:
            price = float(price_str)
        except ValueError:
            continue
        
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
        qty_match = re.search(r'(\d+)\s*[xX]\s*', item_name)
        if qty_match:
            try:
                qty = int(qty_match.group(1))
                # Remove the quantity part from the item name
                item_name = re.sub(r'^\d+\s*[xX]\s*', '', item_name)
            except ValueError:
                pass
        
        # Also look for quantity pattern: "3 @ $1.99"
        qty_price_match = re.search(r'(\d+)\s*@\s*[\$£€]?\s*(\d+[\.,]\d{2})', item_name)
        if qty_price_match:
            try:
                qty = int(qty_price_match.group(1))
                unit_price = float(qty_price_match.group(2).replace(',', '.'))
                # Remove the "qty @ price" part from item name
                item_name = re.sub(r'\d+\s*@\s*[\$£€]?\s*\d+[\.,]\d{2}', '', item_name).strip()
                # Recalculate price if needed
                if abs(price - (qty * unit_price)) < 0.01:
                    # Price matches quantity × unit price
                    price = unit_price
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
    Enhanced process receipt function with better error handling
    
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
    """Process receipt directly from a file path with enhanced processing"""
    try:
        with open(file_path, 'rb') as f:
            image_bytes = f.read()
        return process_receipt_from_bytes(image_bytes)
    except Exception as e:
        logger.error(f"Error processing receipt from file: {e}", exc_info=True)
        raise

def process_receipt_from_bytes(image_bytes):
    """Process receipt from bytes data using enhanced extraction"""
    try:
        # Preprocess the image using multiple techniques
        preprocessed_images = preprocess_image(image_bytes)
        
        if not preprocessed_images:
            raise ValueError("Image preprocessing failed")
        
        # Extract text using multiple OCR configurations
        extracted_text = extract_text(preprocessed_images)
        
        if not extracted_text:
            logger.warning("No text extracted from image")
            return {
                "error": "No text could be extracted from the image",
                "extracted_text": "",
                "store_name": None,
                "total_amount": None,
                "purchase_date": None,
                "items": []
            }
        
        logger.info(f"Extracted text (first 200 chars): {extracted_text[:200]}")
        
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
        
        # Add a confidence score for the extraction
        extraction_success = (
            store_name != "Unknown Store" and 
            total_amount is not None and
            purchase_date is not None and
            len(items) > 0
        )
        
        result["extraction_confidence"] = "high" if extraction_success else "low"
        
        return result
    except Exception as e:
        logger.error(f"Error in process_receipt_from_bytes: {e}", exc_info=True)
        return {
            "error": str(e),
            "extracted_text": "",
            "store_name": None,
            "total_amount": None,
            "purchase_date": None,
            "items": []
        }