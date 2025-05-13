from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import logging
import base64
from typing import Optional
import json
import io
from receipt_processor import process_receipt

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="Receipt Processor API", description="API for processing receipt images")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Update with your frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "receipt-processor"}

@app.post("/process")
async def process_receipt_endpoint(
    file: Optional[UploadFile] = File(None),
    image_base64: Optional[str] = Body(None)
):
    """
    Process receipt image and extract information
    
    Accept either:
    - Upload a file directly
    - Provide a base64 encoded image
    """
    try:
        logger.info("Received receipt processing request")
        
        # Handle file upload
        if file:
            logger.info(f"Processing file upload: {file.filename}")
            contents = await file.read()
            image_data = contents
        
        # Handle base64 image
        elif image_base64:
            logger.info("Processing base64 image")
            # Remove potential data URL prefix
            if "base64," in image_base64:
                image_base64 = image_base64.split("base64,")[1]
            
            # Decode base64 to binary
            try:
                image_data = base64.b64decode(image_base64)
            except Exception as e:
                logger.error(f"Failed to decode base64 image: {e}")
                raise HTTPException(status_code=400, detail="Invalid base64 image data")
        
        else:
            logger.error("No image data provided")
            raise HTTPException(
                status_code=400, 
                detail="No image data provided. Send either a file upload or base64 encoded image"
            )
        
        # Process the receipt
        result = process_receipt(image_data)
        
        # Check if there was an error
        if 'error' in result and result['error']:
            logger.error(f"Error processing receipt: {result['error']}")
            raise HTTPException(
                status_code=500, 
                detail=f"Receipt processing failed: {result['error']}"
            )
        
        logger.info("Receipt processed successfully")
        return result
        
    except HTTPException:
        # Re-raise HTTP exceptions without modification
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Use environment variable for port or default to 8000
    port = int(os.environ.get("PORT", 8000))
    # Use environment variable for host or default to 0.0.0.0 (all interfaces)
    host = os.environ.get("HOST", "0.0.0.0")
    # Enable debug mode if not in production
    debug = os.environ.get("ENV", "development") == "development"
    
    logger.info(f"Starting receipt processor API on {host}:{port}, debug={debug}")
    uvicorn.run("app_fastapi:app", host=host, port=port, reload=debug)
