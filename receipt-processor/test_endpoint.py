import requests
import base64
import json
import sys

if len(sys.argv) != 2:
    print("Usage: python test_endpoint.py <image_path>")
    sys.exit(1)

# Read image file
with open(sys.argv[1], 'rb') as image_file:
    image_data = image_file.read()

# Encode as base64
base64_image = base64.b64encode(image_data).decode('utf-8')

# Send to API
response = requests.post(
    'http://localhost:5000/process',
    json={'image': base64_image},
    headers={'Content-Type': 'application/json'}
)

# Print result
print(f"Status code: {response.status_code}")
print(json.dumps(response.json(), indent=2))