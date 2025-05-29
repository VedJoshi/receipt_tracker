from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import logging
import time
from typing import Optional, List, Dict, Any
import base64
import io
from PIL import Image
import os

from receipt_processor import ReceiptProcessor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Receipt OCR Processing Service",
    description="Advanced OCR service for receipt text extraction and data parsing",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the receipt processor
processor = ReceiptProcessor()

# Pydantic models for request/response
class ImageProcessRequest(BaseModel):
    image: str  # base64 encoded image
    enhance_quality: Optional[bool] = True
    
class ProcessingResult(BaseModel):
    success: bool
    processing_time_ms: int
    confidence_score: float
    extracted_text: str
    store_name: Optional[str]
    total_amount: Optional[float]
    purchase_date: Optional[str]
    items: List[Dict[str, Any]]
    suggested_category: Optional[str]
    confidence_breakdown: Dict[str, float]
    error_message: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    tesseract_available: bool

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint with Tesseract availability check"""
    try:
        # Test if Tesseract is available
        tesseract_available = processor.test_tesseract()
        
        return HealthResponse(
            status="healthy",
            service="receipt-ocr-processor",
            version="1.0.0",
            tesseract_available=tesseract_available
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Service unhealthy: {str(e)}")

@app.post("/process", response_model=ProcessingResult)
async def process_receipt(request: ImageProcessRequest):
    """
    Process a receipt image and extract structured data
    
    Args:
        request: ImageProcessRequest containing base64 encoded image
        
    Returns:
        ProcessingResult with extracted data and confidence scores
    """
    start_time = time.time()
    
    try:
        logger.info("Starting receipt processing")
        
        # Decode base64 image
        try:
            # Handle data URL format (data:image/jpeg;base64,...)
            if request.image.startswith('data:image'):
                header, encoded = request.image.split(',', 1)
                image_data = base64.b64decode(encoded)
            else:
                image_data = base64.b64decode(request.image)
                
            # Validate image
            try:
                img = Image.open(io.BytesIO(image_data))
                img.verify()  # Verify it's a valid image
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid image format: {str(e)}")
                
        except Exception as e:
            logger.error(f"Failed to decode image: {e}")
            raise HTTPException(status_code=400, detail=f"Invalid base64 image: {str(e)}")
        
        # Process the receipt
        result = processor.process_receipt(
            image_data, 
            enhance_quality=request.enhance_quality
        )
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Build response
        response = ProcessingResult(
            success=result.get('success', True),
            processing_time_ms=processing_time,
            confidence_score=result.get('overall_confidence', 0.0),
            extracted_text=result.get('extracted_text', ''),
            store_name=result.get('store_name'),
            total_amount=result.get('total_amount'),
            purchase_date=result.get('purchase_date'),
            items=result.get('items', []),
            suggested_category=result.get('suggested_category'),
            confidence_breakdown=result.get('confidence_breakdown', {}),
            error_message=result.get('error_message')
        )
        
        logger.info(f"Processing completed in {processing_time}ms with confidence {response.confidence_score}")
        return response
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        processing_time = int((time.time() - start_time) * 1000)
        logger.error(f"Unexpected error processing receipt: {e}", exc_info=True)
        
        return ProcessingResult(
            success=False,
            processing_time_ms=processing_time,
            confidence_score=0.0,
            extracted_text="",
            store_name=None,
            total_amount=None,
            purchase_date=None,
            items=[],
            suggested_category=None,
            confidence_breakdown={},
            error_message=str(e)
        )

@app.post("/process-file")
async def process_receipt_file(file: UploadFile = File(...)):
    """
    Alternative endpoint for direct file upload
    """
    try:
        # Read the uploaded file
        contents = await file.read()
        
        # Convert to base64
        base64_image = base64.b64encode(contents).decode('utf-8')
        
        # Process using the main endpoint logic
        request = ImageProcessRequest(image=base64_image)
        return await process_receipt(request)
        
    except Exception as e:
        logger.error(f"Error processing uploaded file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/categories")
async def get_suggested_categories():
    """
    Get list of categories that can be suggested by the OCR system
    """
    return {
        "categories": processor.get_available_categories()
    }

if __name__ == "__main__":
    import uvicorn
    
    # Get configuration from environment
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    
    logger.info(f"Starting Receipt OCR Service on {host}:{port}")
    uvicorn.run(
        "main:app", 
        host=host, 
        port=port, 
        reload=True,  # Enable auto-reload for development
        log_level="info"
    )