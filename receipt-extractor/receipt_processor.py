import base64
import cv2
import numpy as np
import re
import logging
from datetime import datetime
from typing import Dict, List, Optional, Union, Any

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def process_receipt(image_data: Union[str, bytes]) -> Dict[str, Any]:
    """Process a receipt image and extract information"""
    try:
        logger.info("Starting receipt processing")
        
        # Handle base64 encoded images
        if isinstance(image_data, str):
            # Check if it's base64 with data URL prefix
            if image_data.startswith('data:image'):
                image_data = image_data.split(',')[1]
            
            # Decode base64
            image_data = base64.b64decode(image_data)
        
        # Convert to numpy array
        nparr = np.frombuffer(image_data, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            return {"error": "Could not decode image"}
        
        # Simple placeholder data - in real app, you would do OCR here
        store_name = "SAMPLE STORE"
        items = [
            {"name": "MILK", "price": 3.99},
            {"name": "BREAD", "price": 2.49},
            {"name": "EGGS", "price": 2.99}
        ]
        total_amount = sum(item["price"] for item in items)
        purchase_date = datetime.now().strftime("%m/%d/%Y")
        
        # Generate sample extracted text
        extracted_text = f"{store_name}\n\n"
        for item in items:
            extracted_text += f"{item['name']} ${item['price']:.2f}\n"
        extracted_text += f"\nTOTAL: ${total_amount:.2f}\n"
        extracted_text += f"DATE: {purchase_date}"
        
        return {
            "extracted_text": extracted_text,
            "store_name": store_name,
            "total_amount": total_amount,
            "purchase_date": purchase_date,
            "items": items
        }
        
    except Exception as e:
        logger.error(f"Error in receipt processing: {str(e)}")
        return {
            "error": str(e),
            "extracted_text": None,
            "store_name": None,
            "total_amount": None,
            "purchase_date": None,
            "items": []
        }
