# test_direct.py
import cv2
import numpy as np
import pytesseract
from PIL import Image
import json
from receipt_processor import extract_text, extract_store_name, extract_total_amount, extract_purchase_date, extract_items

def test_image(image_path):
    # Directly read the image
    image = cv2.imread(image_path)
    
    if image is None:
        print(f"ERROR: Could not read image from {image_path}")
        return
        
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
    print(f"Extracted text (first 500 chars): {extracted_text[:500]}")
    
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
    
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        test_image(sys.argv[1])
    else:
        print("Usage: python test_direct.py <image_path>")