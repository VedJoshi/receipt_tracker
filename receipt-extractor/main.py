from fastapi import FastAPI, File, UploadFile, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List, Union
import logging
import base64
import json
import os
from receipt_processor import process_receipt

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Receipt Processor API", 
              description="API for processing receipt images and extracting data")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, restrict this to your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data models
class ImageRequest(BaseModel):
    image: str

class S3Request(BaseModel):
    s3_url: str

class ProcessResponse(BaseModel):
    extracted_text: Optional[str] = None
    store_name: Optional[str] = None
    total_amount: Optional[float] = None
    purchase_date: Optional[str] = None
    items: Optional[List[Dict[str, Any]]] = None
    error: Optional[str] = None

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "receipt-processor"}

@app.post("/process", response_model=ProcessResponse)
async def process_receipt_endpoint(
    image_file: Optional[UploadFile] = File(None),
    image_data: Optional[ImageRequest] = None,
    s3_data: Optional[S3Request] = None
):
    """
    Process a receipt image
    
    Accept one of:
    - A file upload
    - Base64 encoded image in the request body
    - S3 URL pointing to an image
    """
    try:
        logger.info("Received receipt processing request")
        
        # Check which input method was used
        if image_file:
            # Process file upload
            logger.info(f"Processing file upload: {image_file.filename}")
            contents = await image_file.read()
            result = process_receipt(contents)
            
        elif image_data:
            # Process base64 image
            logger.info("Processing base64 image")
            result = process_receipt(image_data.image)
            
        elif s3_data:
            # Process image from S3
            logger.info(f"Processing S3 URL: {s3_data.s3_url}")
            
            # Parse S3 URL
            if not s3_data.s3_url.startswith("s3://"):
                raise HTTPException(status_code=400, detail="Invalid S3 URL format")
            
            parts = s3_data.s3_url[5:].split('/', 1)
            if len(parts) != 2:
                raise HTTPException(status_code=400, detail="Invalid S3 URL format")
                
            bucket = parts[0]
            key = parts[1]
            
            # Import boto3 here to avoid issues if not needed
            try:
                import boto3
                s3_client = boto3.client('s3')
                response = s3_client.get_object(Bucket=bucket, Key=key)
                image_data = response['Body'].read()
                result = process_receipt(image_data)
            except Exception as e:
                logger.error(f"Error reading from S3: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to read from S3: {str(e)}")
        else:
            # No valid input provided
            raise HTTPException(
                status_code=400,
                detail="No image provided. Send either a file upload, base64 encoded image, or S3 URL."
            )
        
        # Check for processing errors
        if "error" in result and result["error"]:
            logger.error(f"Error processing receipt: {result['error']}")
            raise HTTPException(status_code=500, detail=f"Receipt processing failed: {result['error']}")
        
        logger.info("Receipt processed successfully")
        return result
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # When running directly, start with uvicorn
    import uvicorn
    port = int(os.environ.get("PORT", 5000))
    logger.info(f"Starting receipt processor service on port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
