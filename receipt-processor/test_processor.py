import requests
import base64
import sys
import json

def test_processor(image_path):
    """Test the receipt processor API with a local image file"""
    # Read the image file
    with open(image_path, 'rb') as f:
        image_data = f.read()
    
    # Convert to base64
    base64_image = base64.b64encode(image_data).decode('utf-8')
    
    # Call the API
    response = requests.post(
        'http://localhost:5000/process',
        json={'image': base64_image},
        headers={'Content-Type': 'application/json'}
    )
    
    # Print the response
    print(f"Status code: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print("Response:")
        print(json.dumps(result, indent=2))
    else:
        print(f"Error: {response.text}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python test_processor.py <image_path>")
        sys.exit(1)
    
    test_processor(sys.argv[1])
