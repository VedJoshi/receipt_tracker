import cv2
import numpy as np
import re
import os
import json
from datetime import datetime

def preprocess_image(image_path):
    """
    Preprocess the receipt image to enhance features
    """
    # Read the image
    img = cv2.imread(image_path)
    
    # Check if image was properly loaded
    if img is None:
        raise Exception(f"Failed to load image from {image_path}")
    
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # Apply adaptive thresholding
    thresh = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv2.THRESH_BINARY, 11, 2
    )
    
    # Dilate the text to make it more visible
    kernel = np.ones((1, 1), np.uint8)
    dilated = cv2.dilate(thresh, kernel, iterations=1)
    
    # Apply erosion to remove noise
    eroded = cv2.erode(dilated, kernel, iterations=1)
    
    return eroded, img

def detect_text_regions(preprocessed_img, original_img):
    """
    Use contour detection to find potential text regions
    Instead of OCR, we'll analyze visual structures to identify regions
    """
    # Find contours in the image
    contours, _ = cv2.findContours(
        preprocessed_img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    
    # Filter contours by size and shape to find potential text lines
    min_contour_width = 40
    min_contour_height = 8
    max_contour_height = 40
    
    text_line_regions = []
    
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        
        # Filter by size to identify text-like regions
        if (w > min_contour_width and 
            min_contour_height < h < max_contour_height and
            w > h * 2):  # Text lines are typically wider than tall
            text_line_regions.append((x, y, w, h))
    
    # Sort regions by y-coordinate (top to bottom)
    text_line_regions.sort(key=lambda r: r[1])
    
    # Create a visualization of detected regions (for debugging)
    visualization = original_img.copy()
    for x, y, w, h in text_line_regions:
        cv2.rectangle(visualization, (x, y), (x + w, y + h), (0, 255, 0), 2)
    
    # Save the visualization for debugging
    cv2.imwrite("detected_regions.jpg", visualization)
    
    return text_line_regions

def analyze_receipt_structure(text_regions, img_height, img_width):
    """
    Analyze the receipt structure based on text regions positioning
    """
    # Identify header region (typically first ~20% of receipt)
    header_cutoff = img_height * 0.2
    header_regions = [r for r in text_regions if r[1] < header_cutoff]
    
    # Identify total region (typically in bottom 30% of receipt)
    total_cutoff = img_height * 0.7
    total_regions = [r for r in text_regions if r[1] > total_cutoff]
    
    # Identify middle regions (items)
    item_regions = [r for r in text_regions if header_cutoff <= r[1] <= total_cutoff]
    
    # Analyze density and alignment of regions to refine detection
    # (this can be expanded based on your specific receipt formats)
    
    return {
        "header": header_regions,
        "items": item_regions,
        "total": total_regions
    }

def extract_receipt_data(img, regions):
    """
    Extract structured data from the identified regions
    Since we're not using OCR, we'll create a placeholder extraction
    based on the structure detection
    """
    # In a real implementation, you would:
    # 1. Use a text recognition model (like EAST or a CNN) on each region
    # 2. Analyze patterns to identify store name, total, date, etc.
    
    # For this demo, we'll create placeholder data based on the regions
    
    # Extract potential store name (largest region in header)
    store_name = "Unknown Store"
    if regions["header"]:
        biggest_header = max(regions["header"], key=lambda r: r[2] * r[3])
        store_name = f"Store (Region at {biggest_header[0]},{biggest_header[1]})"
    
    # Extract potential total (regions in the bottom that are right-aligned)
    total_amount = None
    if regions["total"]:
        # Look for right-aligned regions
        right_aligned = [r for r in regions["total"] if r[0] + r[2] > img.shape[1] * 0.7]
        if right_aligned:
            # Usually the total is one of the last right-aligned elements
            total_amount = 99.99  # Placeholder
    
    # Extract potential date (often in header, has specific pattern)
    date = datetime.now().strftime("%m/%d/%Y")  # Placeholder
    
    # Extract potential items (regions in the middle section)
    items = []
    for i, region in enumerate(regions["items"]):
        # In reality, you would extract text and price from each item region
        items.append({
            "name": f"Item {i+1}",
            "price": round(9.99 * (i+1), 2)  # Placeholder
        })
    
    return {
        "full_text": "OpenCV detected structures without OCR text extraction",
        "store_name": store_name,
        "total_amount": total_amount,
        "date": date,
        "items": items
    }

def process_receipt(image_path):
    """
    Main function to process receipt image and extract structured data
    using OpenCV-only approach
    """
    try:
        # Preprocess the image
        preprocessed, original = preprocess_image(image_path)
        
        # Detect text regions
        text_regions = detect_text_regions(preprocessed, original)
        
        # Analyze receipt structure
        img_height, img_width = original.shape[:2]
        receipt_structure = analyze_receipt_structure(text_regions, img_height, img_width)
        
        # Extract data from structure
        result = extract_receipt_data(original, receipt_structure)
        
        # Add some metadata
        result["detected_regions"] = len(text_regions)
        result["processing_method"] = "OpenCV-only structure analysis"
        
        return result
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        
        # Return error
        return {
            "error": str(e),
            "full_text": "Error processing receipt with OpenCV"
        }

# For command-line testing
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) != 2:
        print("Usage: python receipt_processor.py <input_image_path>")
        sys.exit(1)
        
    input_path = sys.argv[1]
    
    if not os.path.exists(input_path):
        print(f"Input image {input_path} not found")
        sys.exit(1)
        
    result = process_receipt(input_path)
    print(json.dumps(result, indent=2))