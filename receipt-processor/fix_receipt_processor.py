# fix_receipt_processor.py
import receipt_processor
import json

# Override the process_receipt function
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
                receipt_processor.logger.info(f"Successfully read image from file: {image_data}")
                return receipt_processor.process_receipt_from_bytes(image_bytes)
            except (FileNotFoundError, IOError) as e:
                receipt_processor.logger.warning(f"Could not open as file: {e}, trying other formats")
                
                # Not a file, try other formats
                if image_data.startswith('data:image/'):
                    # It's a data URL
                    receipt_processor.logger.info("Processing image from data URL")
                    _, encoded = image_data.split(',', 1)
                    image_bytes = base64.b64decode(encoded)
                    return receipt_processor.process_receipt_from_bytes(image_bytes)
                elif image_data.startswith('s3://'):
                    # For S3 URIs
                    receipt_processor.logger.error("S3 URIs not implemented in this version")
                    raise NotImplementedError("S3 URI processing not implemented")
                else:
                    # Last attempt - maybe it's a relative path
                    try:
                        import os
                        # Try with different path formats
                        current_dir = os.path.dirname(os.path.abspath(__file__))
                        alt_path = os.path.join(current_dir, image_data)
                        with open(alt_path, 'rb') as f:
                            image_bytes = f.read()
                        receipt_processor.logger.info(f"Successfully read image from alternative path: {alt_path}")
                        return receipt_processor.process_receipt_from_bytes(image_bytes)
                    except:
                        # Try base64 decode as last resort
                        receipt_processor.logger.info("Trying as base64 string")
                        try:
                            import base64
                            image_bytes = base64.b64decode(image_data)
                            return receipt_processor.process_receipt_from_bytes(image_bytes)
                        except Exception as e:
                            receipt_processor.logger.error(f"Error decoding as base64: {e}")
                            raise ValueError(f"Could not process input as file path or base64: {e}")
        else:
            # Assume it's already bytes
            receipt_processor.logger.info("Processing image from bytes object")
            return receipt_processor.process_receipt_from_bytes(image_data)
            
    except Exception as e:
        receipt_processor.logger.error(f"Error processing receipt: {e}", exc_info=True)
        return {
            "error": str(e),
            "extracted_text": None,
            "store_name": None,
            "total_amount": None,
            "purchase_date": None,
            "items": []
        }

# Replace the original function with our fixed version
receipt_processor.process_receipt = process_receipt

# Keep the original main block functionality
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        result = process_receipt(image_path)
        print(json.dumps(result, indent=2))
    else:
        print("Usage: python fix_receipt_processor.py <image_path>")