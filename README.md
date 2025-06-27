# ReceiptIQ - AI-Powered Receipt Management System

> Transform receipt chaos into organized financial data with intelligent OCR technology

## 🎯 Overview

ReceiptIQ is a full-stack web application that digitizes and organizes receipts using OCR technology. Upload a photo of your receipt, and the system attempts to extract store names, amounts, dates, and individual items with varying degrees of accuracy.

**🚨 Demo Note**: This is a development project showcasing full-stack capabilities. OCR accuracy depends heavily on receipt quality and may require manual corrections.

## ✨ Key Features

### 🤖 OCR Processing Engine
- **Multi-stage image preprocessing** using OpenCV (CLAHE, bilateral filtering, adaptive thresholding)
- **Multiple OCR configurations** with confidence scoring to select best results
- **Structured data extraction** for stores, totals, dates, items, and tax amounts
- **Automatic retry logic** with fallback to manual editing
- **Category suggestion** based on extracted content patterns

### 📱 Modern User Interface
- **Responsive React frontend** optimized for mobile and desktop
- **Real-time upload progress** with detailed processing stage indicators
- **Drag-and-drop file interface** with visual feedback
- **Advanced search and filtering** across all receipt data
- **Manual editing capabilities** for OCR corrections
- **Bulk operations** for categorizing and managing multiple receipts

### 🏗️ Production-Ready Architecture
- **Microservice design** with separate OCR processing service
- **Cloud infrastructure** using AWS S3 + CloudFront + EC2
- **Secure authentication** via Supabase with JWT tokens
- **PostgreSQL database** with row-level security
- **RESTful API design** with comprehensive error handling

## 🛠️ Technology Stack

### Frontend Layer
- **React 19** with hooks and context for state management
- **React Router** for client-side navigation
- **Axios** for HTTP client with interceptors
- **Custom CSS** with modern gradients, animations, and responsive design

### Backend Services
- **Node.js + Express** RESTful API with middleware stack
- **Multer** for multipart file upload handling
- **AWS SDK** for S3 integration and presigned URLs
- **Supabase Client** for database operations and authentication

### OCR Microservice
- **FastAPI** Python framework for high-performance OCR endpoints
- **OpenCV 4.8** for advanced image preprocessing pipelines
- **Tesseract 0.3** for optical character recognition
- **NumPy** for efficient image array operations
- **Custom confidence scoring** algorithm for result selection

### Infrastructure & DevOps
- **AWS CloudFront** CDN for HTTPS termination and API routing
- **AWS S3** for scalable image storage with lifecycle policies
- **AWS EC2** single instance hosting (t2.micro) with PM2 process management
- **Vercel** for frontend deployment with automatic CI/CD
- **Supabase** managed PostgreSQL with real-time subscriptions

## 🚀 Live Demo

**Demo URL**: [https://receipt-tracker-navy.vercel.app](https://receipt-tracker-navy.vercel.app)

### Test the System:
1. **Sign Up** - Create account with email verification
2. **Upload Receipt** - Try with clear, high-quality receipt images
3. **Review Extraction** - See OCR results and confidence scores
4. **Manual Editing** - Correct any extraction errors
5. **Organization** - Categorize and search your receipts

*Note: For best results, use well-lit, uncrumpled receipts from major retailers*

## 📊 Technical Deep Dive

### OCR Processing Pipeline
```python
class ReceiptProcessor:
    def process_receipt(self, image_data, enhance_quality=True):
        # 1. Multi-strategy preprocessing
        preprocessed_images = self.preprocess_image(image_data, enhance_quality)
        
        # 2. Multiple OCR configurations
        ocr_results = self.perform_ocr(preprocessed_images)
        
        # 3. Confidence-based selection
        best_result = self.select_best_ocr_result(ocr_results)
        
        # 4. Structured data extraction
        extracted_data = self.extract_structured_data(best_result['text'])
        
        return {
            'success': True,
            'confidence_score': self.calculate_overall_confidence(extracted_data),
            'extracted_text': best_result['text'],
            'structured_data': extracted_data
        }
```

### Advanced Data Extraction
```python
def extract_items_improved(self, text):
    """Pattern-based item extraction with multiple fallback strategies"""
    patterns = [
        r'^(\d+)\s*[xX]?\s+(.+?)\s+\$?\s*(\d+\.?\d{0,2})\s*$',  # Qty Item Price
        r'^(.+?)\s+(\d+)\s*@\s*\$?\s*(\d+\.?\d{0,2})\s*$',      # Item Qty @ Price
        r'^(.+?)\s+\$?\s*(\d+\.\d{2})\s*$'                       # Item Price
    ]
    
    items = []
    for line in text.split('\n'):
        for pattern in patterns:
            if match := re.match(pattern, line.strip()):
                items.append(self.parse_item_match(match))
                break
    
    return self.clean_item_list(items)
```

### API Architecture
```javascript
// Express middleware stack with comprehensive error handling
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// JWT authentication middleware
const authenticateUser = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    const { data: userData, error } = await supabase.auth.getUser(token);
    
    if (error || !userData.user) {
        return res.status(401).json({ message: 'Invalid token' });
    }
    
    req.user = userData.user;
    next();
};

// Receipt processing endpoint with S3 integration
app.post('/upload', authenticateUser, upload.single('receiptImage'), async (req, res) => {
    // 1. Validate and process uploaded file
    // 2. Upload original image to S3 with metadata
    // 3. Send to OCR microservice for processing
    // 4. Store results in Supabase with confidence scores
    // 5. Return structured data with presigned image URL
});
```

## 📈 Performance Characteristics

### Current Metrics
- **OCR Processing Time**: 8-15 seconds per receipt (varies by complexity)
- **Supported Formats**: JPG, PNG, GIF up to 10MB
- **Text Extraction Accuracy**: 60-85% depending on receipt quality
- **Database Operations**: <200ms average response time
- **File Upload**: <3 seconds for typical receipt images
- **Concurrent Users**: Limited to ~10-15 simultaneous uploads

### Deployment Configuration
```yaml
Production Setup:
  Frontend:
    Platform: Vercel
    Build: Automatic on git push to main
    Domain: Custom domain with automatic SSL
    
  Backend API:
    Platform: AWS EC2 t2.micro (1 vCPU, 1GB RAM)
    Process Manager: PM2 with cluster mode
    Load Balancer: None (single instance)
    
  OCR Service:
    Platform: Same EC2 instance
    Port: 8000 (internal communication)
    Dependencies: OpenCV, Tesseract, FastAPI
    
  Database:
    Provider: Supabase (managed PostgreSQL)
    Tier: Free (500MB storage, 50MB database size)
    Security: Row-level security enabled
    
  Storage:
    Provider: AWS S3 Standard
    Region: ap-southeast-1
    CDN: CloudFront for global distribution
```

## 🗄️ Database Schema

```sql
-- Main receipts table with comprehensive metadata
CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- File storage
    image_url TEXT NOT NULL,                    -- S3 object path
    
    -- OCR results
    extracted_text TEXT,                        -- Raw OCR output
    processing_status TEXT DEFAULT 'pending',   -- pending|success|failed
    confidence_score DECIMAL(3,2) DEFAULT 0,    -- Overall confidence (0-1)
    retry_count INTEGER DEFAULT 0,              -- Failed processing attempts
    
    -- Extracted structured data
    store_name TEXT,                            -- Parsed store name
    total_amount DECIMAL(10,2),                 -- Extracted total amount
    purchase_date TEXT,                         -- Extracted date (flexible format)
    items JSONB DEFAULT '[]',                   -- Array of {name, price, quantity}
    tax_amount DECIMAL(10,2),                   -- Extracted tax
    subtotal DECIMAL(10,2),                     -- Pre-tax subtotal
    
    -- User management
    category TEXT,                              -- User-assigned category
    is_manually_edited BOOLEAN DEFAULT false,   -- User has modified OCR results
    is_deleted BOOLEAN DEFAULT false,           -- Soft delete flag
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_receipts_user_created ON receipts(user_id, created_at DESC);
CREATE INDEX idx_receipts_category ON receipts(category) WHERE category IS NOT NULL;
CREATE INDEX idx_receipts_store ON receipts(store_name) WHERE store_name IS NOT NULL;
```

## 🚧 Known Limitations & Considerations

### OCR Technology Constraints
- **Image Quality Dependency**: Requires high-quality, well-lit, uncrumpled receipts
- **Processing Speed**: 8-15 seconds per receipt (not suitable for real-time applications)
- **Accuracy Variance**: 60-85% accuracy depending on receipt format and print quality
- **Format Limitations**: Works best with standard thermal receipt formats
- **Language Support**: English-only text recognition
- **Handwritten Text**: Cannot process handwritten receipts

### Infrastructure Limitations
- **Single Point of Failure**: No redundancy or auto-scaling (single EC2 instance)
- **Concurrent Processing**: Limited to ~10-15 simultaneous OCR operations
- **Storage Costs**: S3 storage costs scale with usage (not optimized for high volume)
- **Database Tier**: Free Supabase tier has 500MB storage limit
- **No Monitoring**: Limited error tracking and performance monitoring

### Development Constraints
- **Error Recovery**: Basic retry logic, no dead letter queues
- **File Size Limits**: 10MB maximum upload size
- **Session Management**: Simple JWT tokens without refresh token rotation
- **CORS Configuration**: Broad permissions for development (should be restricted in production)

## 🔮 Production Roadmap

### Technical Improvements Needed
- [ ] **Load Balancing**: Implement ALB with multiple EC2 instances
- [ ] **Caching Layer**: Add Redis for API response caching
- [ ] **Monitoring**: Integrate CloudWatch/DataDog for observability
- [ ] **Error Tracking**: Add Sentry for error monitoring and alerting
- [ ] **Database Scaling**: Migrate to dedicated RDS instance
- [ ] **OCR Optimization**: Implement image compression and queue processing
- [ ] **Security Hardening**: Add rate limiting, input validation, CSRF protection

### Feature Extensions
- [ ] **Mobile Application**: React Native app for better mobile UX
- [ ] **Batch Processing**: Handle multiple receipt uploads simultaneously
- [ ] **Export Functionality**: CSV/PDF export for accounting software integration
- [ ] **Receipt Templates**: Custom parsing rules for specific store formats
- [ ] **Machine Learning**: Train custom models for improved accuracy
- [ ] **API Documentation**: OpenAPI/Swagger documentation for third-party integration

### Business Logic Enhancements
- [ ] **Expense Reporting**: Generate tax-ready expense reports
- [ ] **Budget Tracking**: Monthly/yearly spending analysis
- [ ] **Receipt Validation**: Cross-reference with bank statements
- [ ] **Multi-tenant Architecture**: Support for team/organization accounts

## 🎯 Use Cases & Target Applications

### Personal Finance Management
- **Expense Tracking**: Digitize receipts for personal budgeting
- **Tax Preparation**: Organize deductible business expenses
- **Warranty Tracking**: Store purchase records for warranty claims
- **Return Processing**: Quick access to receipt details for returns

### Small Business Applications
- **Expense Reporting**: Employee expense submission and approval
- **Inventory Tracking**: Monitor supply purchases and costs
- **Accounting Integration**: Export data for QuickBooks/Xero integration
- **Audit Preparation**: Maintain digital receipt records for tax audits

## 🔧 Local Development Setup

```bash
# Prerequisites: Node.js 18+, Python 3.9+, Git

# 1. Clone repository
git clone https://github.com/yourusername/receiptiq.git
cd receiptiq

# 2. Frontend setup
cd receipt-frontend
npm install
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
npm start  # Runs on http://localhost:3000

# 3. Backend setup (new terminal)
cd ../receipt_backend
npm install
cp .env.example .env
# Edit .env with AWS and Supabase credentials
npm start  # Runs on http://localhost:3001

# 4. OCR service setup (new terminal)
cd ../receipt-processor
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py  # Runs on http://localhost:8000

# 5. Test the full stack
# Upload a receipt through the React frontend
# Monitor logs in all three terminals
```

### Required Environment Variables
```bash
# Frontend (.env.local)
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=...
REACT_APP_API_GATEWAY_URL=http://localhost:3001

# Backend (.env)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=your-receipt-bucket
OCR_SERVICE_URL=http://localhost:8000

# OCR Service (.env)
PORT=8000
LOG_LEVEL=INFO
```

---

## 📋 Project Structure

```
receiptiq/
├── receipt-frontend/          # React.js frontend application
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── AuthContext.js     # Authentication state management
│   │   └── App.js            # Main application component
│   ├── public/               # Static assets
│   └── package.json
│
├── receipt_backend/          # Node.js Express API server
│   ├── server.js            # Main server file with all endpoints
│   ├── package.json
│   └── .env.example
│
├── receipt-processor/        # Python FastAPI OCR microservice
│   ├── main.py              # FastAPI application with OCR endpoints
│   ├── receipt_processor.py # Core OCR processing logic
│   ├── requirements.txt
│   └── .env.example
│
└── README.md                # This file
```

---

**Technical Demonstration Project** | Built with React, Node.js, Python, AWS, and Supabase

*Showcasing full-stack development capabilities with modern web technologies, cloud infrastructure, and AI/ML integration*