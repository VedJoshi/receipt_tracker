import os
import cv2
import numpy as np
import torch
import torchvision.transforms as transforms
from PIL import Image
import json
import boto3
import base64
import requests
import logging
from io import BytesIO
import re

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global variables
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
logger.info(f"Using device: {device}")

class ReceiptExtractor:
    def __init__(self):
        """Initialize the receipt extractor with models"""
        self.craft_net = None
        self.recognition_model = None
        
        # Load models
        self.load_models()
        
        logger.info("Receipt Extractor initialized")
    
    def load_models(self):
        """Load pre-trained models for text detection and recognition"""
        try:
            # Load CRAFT text detector
            self.craft_net = self.load_craft_model()
            logger.info("CRAFT model loaded successfully")
            
            # Load text recognition model
            self.recognition_model = self.load_recognition_model()
            logger.info("Recognition model loaded successfully")
        except Exception as e:
            logger.error(f"Error loading models: {e}")
            raise
    
    def load_craft_model(self):
        """Load CRAFT text detection model"""
        # For production, you would download a pre-trained model
        # Here we're using a placeholder function that would be replaced
        # with actual model loading code
        
        # Check if models directory exists, create if not
        if not os.path.exists('models'):
            os.makedirs('models')
        
        # Check if model file exists, download if not
        craft_model_path = 'models/craft_mlt_25k.pth'
        if not os.path.exists(craft_model_path):
            logger.info("Downloading CRAFT model...")
            # In a real implementation, you would download the model from a URL
            # For now, we'll use a placeholder
            # self.download_file(model_url, craft_model_path)
            
            # For now, we'll create a dummy model
            # This would be replaced with the actual model loading in production
            from torch import nn
            dummy_model = nn.Sequential(
                nn.Conv2d(3, 64, kernel_size=3, padding=1),
                nn.ReLU(),
                nn.MaxPool2d(2, 2),
                nn.Conv2d(64, 128, kernel_size=3, padding=1),
                nn.ReLU(),
                nn.MaxPool2d(2, 2),
                nn.Conv2d(128, 2, kernel_size=3, padding=1)
            )
            dummy_model.eval()
            return dummy_model
        
        # Here you would load the actual CRAFT model
        # For example:
        # from craft_text_detector import CRAFT
        # craft_net = CRAFT()
        # craft_net.load_state_dict(torch.load(craft_model_path, map_location=device))
        # craft_net.eval()
        # return craft_net
        
        # For now, return a placeholder
        return self.create_placeholder_model()
    
    def load_recognition_model(self):
        """Load text recognition model"""
        # Similar to CRAFT, you would load a pre-trained recognition model
        # For example, a CRNN model
        
        # For now, return a placeholder
        return self.create_placeholder_model()
    
    def create_placeholder_model(self):
        """Create a placeholder model for demonstration purposes"""
        # This is just a placeholder and would be replaced with actual model loading
        from torch import nn
        model = nn.Sequential(
            nn.Conv2d(3, 64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2, 2)
        )
        model.eval()
        return model
    
    def preprocess_image(self, image_data):
        """Preprocess the image for model input"""
        try:
            # Convert to OpenCV format
            if isinstance(image_data, str):
                # Check if it's a file path
                if os.path.isfile(image_data):
                    image = cv2.imread(image_data)
                    if image is None:
                        raise ValueError(f"Failed to read image file: {image_data}")
                else:
                    # Assume it's base64 encoded
                    try:
                        image_data = base64.b64decode(image_data)
                        nparr = np.frombuffer(image_data, np.uint8)
                        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    except:
                        raise ValueError("Failed to decode base64 image data")
            elif isinstance(image_data, bytes):
                # Convert bytes to numpy array
                nparr = np.frombuffer(image_data, np.uint8)
                image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            else:
                raise ValueError("Unsupported image data type")
            
            if image is None:
                raise ValueError("Failed to process image data")
            
            # Resize for better processing
            # Typical receipt images work well at this resolution
            h, w = image.shape[:2]
            aspect_ratio = h / w
            
            # Target height around 1000-1200px for receipts
            target_height = 1200
            target_width = int(target_height / aspect_ratio)
            
            # Resize maintaining aspect ratio
            image = cv2.resize(image, (target_width, target_height))
            
            # Convert to RGB (from BGR)
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            
            # Apply preprocessing techniques specific to receipts
            # 1. Convert to grayscale
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # 2. Apply adaptive thresholding 
            # This helps with different lighting conditions and improves text extraction
            thresh = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
            )
            
            # 3. Denoise
            denoised = cv2.fastNlMeansDenoising(thresh, None, 10, 7, 21)
            
            # 4. Convert to RGB for model input
            processed_rgb = cv2.cvtColor(denoised, cv2.COLOR_GRAY2RGB)
            
            # 5. Prepare tensor for model input (normalized)
            transform = transforms.Compose([
                transforms.ToTensor(),
                transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
            ])
            
            pil_image = Image.fromarray(processed_rgb)
            input_tensor = transform(pil_image)
            input_tensor = input_tensor.unsqueeze(0)  # Add batch dimension
            
            # Save both original RGB and preprocessed image for reference
            self.original_image = image_rgb
            self.processed_image = processed_rgb
            
            return input_tensor.to(device)
            
        except Exception as e:
            logger.error(f"Error in image preprocessing: {e}")
            raise
    
    def detect_text_regions(self, image_tensor):
        """Detect text regions in the image using CRAFT model"""
        try:
            # This would use the CRAFT model to detect text regions
            # For now, we'll simulate text detection
            
            # In a real implementation:
            # with torch.no_grad():
            #     y_pred = self.craft_net(image_tensor)
            #     score_text = y_pred[0, :, :, 0].cpu().numpy()
            #     score_link = y_pred[0, :, :, 1].cpu().numpy()
            #     boxes = self.get_detection_boxes(score_text, score_link)
            
            # For demonstration, simulate text detection by dividing the image into regions
            # that might contain text on a receipt (simplified)
            h, w = self.processed_image.shape[:2]
            
            # Generate regions that simulate text areas on a receipt
            # Headers (store name, address, etc.)
            header_height = int(h * 0.15)
            header_boxes = [
                [int(w * 0.1), 10, int(w * 0.9), header_height - 10]  # Store name
            ]
            
            # Items section (middle of receipt)
            items_start = header_height
            items_end = int(h * 0.8)
            item_height = 30
            
            items_boxes = []
            for y in range(items_start, items_end, item_height):
                # Item name (left side)
                items_boxes.append([int(w * 0.1), y, int(w * 0.7), y + item_height - 5])
                # Item price (right side)
                items_boxes.append([int(w * 0.75), y, int(w * 0.9), y + item_height - 5])
            
            # Total section (bottom of receipt)
            total_start = items_end
            total_boxes = [
                [int(w * 0.1), total_start, int(w * 0.5), total_start + 30],  # Total text
                [int(w * 0.6), total_start, int(w * 0.9), total_start + 30],  # Total amount
                [int(w * 0.1), total_start + 40, int(w * 0.9), total_start + 70]  # Date
            ]
            
            all_boxes = header_boxes + items_boxes + total_boxes
            
            # Add some randomness to make it more realistic
            import random
            for box in all_boxes:
                for i in range(4):
                    box[i] += random.randint(-5, 5)
            
            return all_boxes
            
        except Exception as e:
            logger.error(f"Error in text detection: {e}")
            raise
    
    def recognize_text(self, regions):
        """Recognize text in the detected regions"""
        try:
            # This would use the recognition model to extract text from each region
            # For now, we'll simulate text recognition
            
            recognized_text = []
            
            # In a real implementation:
            # for box in regions:
            #     x_min, y_min, x_max, y_max = box
            #     region_img = self.processed_image[y_min:y_max, x_min:x_max]
            #     # Preprocess for recognition model
            #     region_tensor = self.preprocess_region(region_img)
            #     # Recognize text
            #     with torch.no_grad():
            #         text = self.recognition_model(region_tensor)
            #     recognized_text.append(text)
            
            # For demonstration, simulate different parts of a receipt
            h, w = self.processed_image.shape[:2]
            
            # Simulate receipt content
            store_info = {
                "name": "GROCERY MARKET",
                "address": "123 MAIN ST, ANYTOWN, USA",
                "phone": "555-123-4567"
            }
            
            items = [
                {"name": "MILK 1 GAL", "price": 3.99},
                {"name": "BREAD", "price": 2.49},
                {"name": "EGGS DOZEN", "price": 2.99},
                {"name": "BANANAS", "price": 1.19},
                {"name": "COFFEE", "price": 8.99}
            ]
            
            total = sum(item["price"] for item in items)
            tax = round(total * 0.07, 2)
            grand_total = round(total + tax, 2)
            
            # Generate full text
            full_text = f"{store_info['name']}\n{store_info['address']}\n{store_info['phone']}\n\n"
            full_text += "ITEM                PRICE\n"
            full_text += "------------------------\n"
            
            for item in items:
                full_text += f"{item['name'].ljust(20)}${item['price']:.2f}\n"
            
            full_text += "------------------------\n"
            full_text += f"SUBTOTAL           ${total:.2f}\n"
            full_text += f"TAX                ${tax:.2f}\n"
            full_text += f"TOTAL              ${grand_total:.2f}\n\n"
            
            import datetime
            date_str = datetime.datetime.now().strftime("%m/%d/%Y %I:%M %p")
            full_text += f"DATE: {date_str}\n"
            full_text += "THANK YOU FOR SHOPPING WITH US!"
            
            # For each detected region, extract part of this text
            # based on the position of the region
            
            # In a real solution, you'd run OCR on each region
            # Here we're just simulating text extraction
            
            return full_text
            
        except Exception as e:
            logger.error(f"Error in text recognition: {e}")
            raise
    
    def extract_receipt_information(self, text):
        """Extract structured information from the recognized text"""
        try:
            # Parse the text to extract key information
            store_name = None
            total_amount = None
            purchase_date = None
            items = []
            
            # Extract store name (typically at the top)
            lines = text.split('\n')
            if lines:
                store_name = lines[0].strip()
            
            # Extract total amount
            total_pattern = r'TOTAL\s*\$?(\d+\.\d{2})'
            total_matches = re.findall(total_pattern, text, re.IGNORECASE)
            if total_matches:
                total_amount = float(total_matches[-1])  # Use the last match
            
            # Extract date
            date_pattern = r'DATE:\s*(\d{1,2}/\d{1,2}/\d{4})'
            date_matches = re.findall(date_pattern, text, re.IGNORECASE)
            if date_matches:
                purchase_date = date_matches[0]
            
            # Extract items
            # This is a simplified version and would need to be customized
            # based on the actual receipt format
            item_pattern = r'([A-Z\s]+)\s+\$(\d+\.\d{2})'
            item_matches = re.findall(item_pattern, text)
            
            for match in item_matches:
                item_name = match[0].strip()
                if item_name.lower() not in ['subtotal', 'tax', 'total']:
                    try:
                        price = float(match[1])
                        items.append({
                            "name": item_name,
                            "price": price
                        })
                    except ValueError:
                        continue
            
            # Return structured information
            return {
                "extracted_text": text,
                "store_name": store_name,
                "total_amount": total_amount,
                "purchase_date": purchase_date,
                "items": items
            }
            
        except Exception as e:
            logger.error(f"Error extracting receipt information: {e}")
            return {
                "extracted_text": text,
                "error": str(e)
            }
    
    def process_receipt(self, image_data):
        """Process a receipt image end to end"""
        try:
            logger.info("Starting receipt processing")
            
            # 1. Preprocess the image
            preprocessed_image = self.preprocess_image(image_data)
            logger.info("Image preprocessing completed")
            
            # 2. Detect text regions
            text_regions = self.detect_text_regions(preprocessed_image)
            logger.info(f"Detected {len(text_regions)} text regions")
            
            # 3. Recognize text in the regions
            recognized_text = self.recognize_text(text_regions)
            logger.info("Text recognition completed")
            
            # 4. Extract structured information
            result = self.extract_receipt_information(recognized_text)
            logger.info("Information extraction completed")
            
            return result
            
        except Exception as e:
            logger.error(f"Error in receipt processing: {e}")
            return {
                "error": str(e),
                "extracted_text": None,
                "store_name": None,
                "total_amount": None,
                "purchase_date": None,
                "items": []
            }

class S3Handler:
    def __init__(self, bucket_name):
        """Initialize S3 handler"""
        self.s3_client = boto3.client('s3')
        self.bucket_name = bucket_name
        logger.info(f"S3 Handler initialized for bucket: {bucket_name}")
    
    def get_object(self, object_key):
        """Get an object from S3"""
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=object_key
            )
            return response['Body'].read()
        except Exception as e:
            logger.error(f"Error getting object from S3: {e}")
            raise
    
    def put_object(self, object_key, data, content_type='application/json'):
        """Put an object in S3"""
        try:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=object_key,
                Body=data,
                ContentType=content_type
            )
            logger.info(f"Successfully uploaded to S3: {object_key}")
        except Exception as e:
            logger.error(f"Error putting object in S3: {e}")
            raise

class SupabaseHandler:
    def __init__(self, supabase_url, supabase_key):
        """Initialize Supabase handler"""
        self.supabase_url = supabase_url
        self.supabase_key = supabase_key
        logger.info("Supabase Handler initialized")
    
    def update_receipt_data(self, receipt_id, extracted_data):
        """Update receipt data in Supabase"""
        try:
            # Endpoint for updating a receipt
            url = f"{self.supabase_url}/rest/v1/receipts?id=eq.{receipt_id}"
            
            # Prepare the data
            update_data = {
                "extracted_text": extracted_data.get("extracted_text"),
                "store_name": extracted_data.get("store_name"),
                "total_amount": extracted_data.get("total_amount"),
                "purchase_date": extracted_data.get("purchase_date")
                # Add more fields as needed
            }
            
            # Make the request
            headers = {
                "apikey": self.supabase_key,
                "Authorization": f"Bearer {self.supabase_key}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            }
            
            response = requests.patch(url, json=update_data, headers=headers)
            
            if response.status_code == 204:
                logger.info(f"Successfully updated receipt data in Supabase: {receipt_id}")
                return True
            else:
                logger.error(f"Failed to update receipt data in Supabase: {response.status_code} - {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error updating receipt data in Supabase: {e}")
            raise

def handler(event, context):
    """Lambda handler to process receipt images from S3"""
    try:
        # Parse event to get bucket and key
        bucket = event['Records'][0]['s3']['bucket']['name']
        key = event['Records'][0]['s3']['object']['key']
        
        logger.info(f"Processing new receipt image: s3://{bucket}/{key}")
        
        # Extract receipt ID from the key (assumes format: receipts/user_id/timestamp_filename)
        parts = key.split('/')
        if len(parts) < 3:
            logger.error(f"Invalid key format: {key}")
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Invalid key format'})
            }
        
        # Get environment variables
        supabase_url = os.environ.get('SUPABASE_URL')
        supabase_key = os.environ.get('SUPABASE_SERVICE_KEY')
        
        if not supabase_url or not supabase_key:
            logger.error("Missing required environment variables")
            return {
                'statusCode': 500,
                'body': json.dumps({'error': 'Missing required environment variables'})
            }
        
        # Initialize handlers
        s3_handler = S3Handler(bucket)
        receipt_extractor = ReceiptExtractor()
        supabase_handler = SupabaseHandler(supabase_url, supabase_key)
        
        # Get the image from S3
        image_data = s3_handler.get_object(key)
        
        # Process the receipt
        result = receipt_extractor.process_receipt(image_data)
        
        # Query Supabase to get the receipt ID based on image_url
        # For now, we'll assume we're updating the receipt we just processed
        # In a real implementation, you would query Supabase to get the receipt ID
        # based on the image URL (s3://{bucket}/{key})
        
        # Update the receipt data in Supabase
        image_url = f"s3://{bucket}/{key}"
        
        # Here you would query Supabase to get the receipt ID
        # For now, we'll log the result
        logger.info(f"Extracted receipt data: {json.dumps(result)}")
        
        # Save the processed result to S3
        result_key = key.replace('.jpg', '.json').replace('.jpeg', '.json').replace('.png', '.json')
        s3_handler.put_object(
            f"processed/{result_key}",
            json.dumps(result, indent=2)
        )
        
        # Return success
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Receipt processed successfully'})
        }
        
    except Exception as e:
        logger.error(f"Error in lambda handler: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

# For testing locally
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        receipt_extractor = ReceiptExtractor()
        result = receipt_extractor.process_receipt(image_path)
        print(json.dumps(result, indent=2))
    else:
        print("Usage: python receipt_extractor.py <image_path>")