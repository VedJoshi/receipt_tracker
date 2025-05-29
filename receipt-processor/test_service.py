import requests
import base64
import json
from PIL import Image, ImageDraw, ImageFont
import io
import sys

def create_test_receipt_image():
    """Create a simple test receipt image for testing"""
    # Create a white image
    width, height = 300, 400
    image = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(image)
    
    try:
        # Try to use a default font, fallback to basic if not available
        font = ImageFont.load_default()
    except:
        font = None
    
    # Draw receipt content
    y_position = 20
    lines = [
        "WALMART SUPERCENTER",
        "1234 MAIN STREET",
        "ANYTOWN, ST 12345",
        "",
        "11/25/2024  2:45 PM",
        "",
        "BANANAS           $2.48",
        "MILK 1 GAL        $3.99",
        "BREAD WHEAT       $2.19", 
        "EGGS LARGE        $4.29",
        "",
        "SUBTOTAL          $13.95",
        "TAX               $0.84",
        "TOTAL            $14.79",
        "",
        "CASH             $20.00",
        "CHANGE            $5.21",
        "",
        "THANK YOU FOR SHOPPING!"
    ]
    
    for line in lines:
        draw.text((20, y_position), line, fill='black', font=font)
        y_position += 18
    
    return image

def image_to_base64(image):
    """Convert PIL image to base64 string"""
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG')
    image_data = buffer.getvalue()
    return base64.b64encode(image_data).decode('utf-8')

def test_health_endpoint(base_url):
    """Test the health endpoint"""
    try:
        response = requests.get(f"{base_url}/health")
        print(f"Health Check Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Service Status: {data.get('status')}")
            print(f"Tesseract Available: {data.get('tesseract_available')}")
            return True
        else:
            print(f"Health check failed: {response.text}")
            return False
    except Exception as e:
        print(f"Health check error: {e}")
        return False

def test_process_endpoint(base_url, image_base64):
    """Test the OCR processing endpoint"""
    try:
        payload = {
            "image": image_base64,
            "enhance_quality": True
        }
        
        print("Sending image for processing...")
        response = requests.post(f"{base_url}/process", json=payload)
        
        print(f"Process Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("\n=== OCR PROCESSING RESULTS ===")
            print(f"Success: {result.get('success')}")
            print(f"Processing Time: {result.get('processing_time_ms')}ms")
            print(f"Overall Confidence: {result.get('confidence_score', 0):.2f}")
            print(f"OCR Method: {result.get('ocr_method', 'unknown')}")
            
            print(f"\n--- Extracted Data ---")
            print(f"Store Name: {result.get('store_name')}")
            print(f"Total Amount: ${result.get('total_amount')}")
            print(f"Purchase Date: {result.get('purchase_date')}")
            print(f"Suggested Category: {result.get('suggested_category')}")
            
            items = result.get('items', [])
            print(f"\nItems ({len(items)}):")
            for i, item in enumerate(items, 1):
                print(f"  {i}. {item.get('name')} - ${item.get('price')} (qty: {item.get('quantity', 1)})")
            
            print(f"\n--- Confidence Breakdown ---")
            confidence = result.get('confidence_breakdown', {})
            for key, value in confidence.items():
                print(f"  {key}: {value:.2f}")
            
            print(f"\n--- Raw OCR Text (first 200 chars) ---")
            raw_text = result.get('extracted_text', '')
            print(raw_text[:200] + "..." if len(raw_text) > 200 else raw_text)
            
            return True
        else:
            print(f"Processing failed: {response.text}")
            return False
            
    except Exception as e:
        print(f"Processing error: {e}")
        return False

def main():
    """Main test function"""
    # Default service URL
    base_url = "http://localhost:8000"
    
    # Allow custom URL from command line
    if len(sys.argv) > 1:
        base_url = sys.argv[1]
    
    print(f"Testing OCR Service at: {base_url}")
    print("=" * 50)
    
    # Test 1: Health check
    print("1. Testing Health Endpoint...")
    if not test_health_endpoint(base_url):
        print("❌ Health check failed. Make sure the service is running.")
        return
    print("✅ Health check passed!\n")
    
    # Test 2: Create test image
    print("2. Creating test receipt image...")
    test_image = create_test_receipt_image()
    
    # Save test image for manual inspection
    test_image.save("test_receipt.jpg")
    print("✅ Test image saved as 'test_receipt.jpg'\n")
    
    # Test 3: Process the image
    print("3. Testing OCR Processing...")
    image_base64 = image_to_base64(test_image)
    
    if test_process_endpoint(base_url, image_base64):
        print("\n✅ OCR processing test passed!")
    else:
        print("\n❌ OCR processing test failed!")
    
    print("\n" + "=" * 50)
    print("Test completed!")

if __name__ == "__main__":
    main()