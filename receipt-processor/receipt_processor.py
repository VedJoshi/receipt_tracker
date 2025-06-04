import cv2
import numpy as np
import pytesseract
from PIL import Image
import io
import re
import json
import os
import logging
import base64
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configure pytesseract path based on OS
if os.name == 'nt':  # Windows
    pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
elif os.path.exists('/usr/bin/tesseract'):
    pytesseract.pytesseract.tesseract_cmd = '/usr/bin/tesseract'

class ReceiptProcessor:
    """Enhanced receipt processing with improved item parsing and tax extraction"""
    
    def __init__(self):
        self.categories = [
            'Groceries', 'Restaurants', 'Gas & Fuel', 'Shopping', 
            'Healthcare', 'Entertainment', 'Transportation', 'Other'
        ]
        
        # Common receipt section patterns
        self.skip_patterns = [
            r'(?i)(thank\s+you|visit\s+us|store\s+hours|customer\s+service)',
            r'(?i)(phone|tel|fax|email|website|www\.)',
            r'(?i)(address|street|ave|avenue|road|rd|blvd|boulevard)',
            r'(?i)(city|state|zip|postal|country)',
            r'(?i)(receipt|invoice|bill|order)\s*#?\s*\d*',
            r'(?i)(cashier|clerk|server|manager)',
            r'(?i)(tender|payment|change|cash|credit|debit)',
            r'(?i)(subtotal|sub\s*total|total|tax|hst|gst|vat|amount)',
            r'^\d{1,2}[:/]\d{1,2}',  # Time patterns
            r'^\d+$',  # Just numbers
            r'^[\W\s]*$',  # Just special characters
        ]
        
    def test_tesseract(self) -> bool:
        """Test if Tesseract is available and working"""
        try:
            version = pytesseract.get_tesseract_version()
            logger.info(f"Tesseract version: {version}")
            return True
        except Exception as e:
            logger.error(f"Tesseract not available: {e}")
            return False
    
    def process_receipt(self, image_data: bytes, enhance_quality: bool = True) -> Dict[str, Any]:
        """
        Main entry point for receipt processing
        """
        try:
            # Preprocess image with multiple strategies
            preprocessed_images = self.preprocess_image(image_data, enhance_quality)
            
            # Extract text using multiple OCR configurations
            ocr_results = self.perform_ocr(preprocessed_images)
            
            # Select best OCR result based on confidence
            best_result = self.select_best_ocr_result(ocr_results)
            
            if not best_result['text']:
                return self._create_error_response("No text could be extracted from the image")
            
            # Extract structured data with improved parsing
            extracted_data = self.extract_structured_data(best_result['text'])
            
            # Calculate confidence scores
            confidence_breakdown = self.calculate_confidence_scores(extracted_data, best_result)
            overall_confidence = sum(confidence_breakdown.values()) / len(confidence_breakdown)
            
            # Suggest category
            suggested_category = self.suggest_category(extracted_data)
            
            return {
                'success': True,
                'extracted_text': best_result['text'],
                'store_name': extracted_data['store_name'],
                'total_amount': extracted_data['total_amount'],
                'purchase_date': extracted_data['purchase_date'],
                'items': extracted_data['items'],
                'tax_amount': extracted_data['tax_amount'],
                'subtotal': extracted_data['subtotal'],
                'suggested_category': suggested_category,
                'overall_confidence': overall_confidence,
                'confidence_breakdown': confidence_breakdown,
                'preprocessing_method': best_result['method'],
                'ocr_config': best_result['config']
            }
            
        except Exception as e:
            logger.error(f"Error processing receipt: {e}", exc_info=True)
            return self._create_error_response(str(e))
    
    def preprocess_image(self, image_data: bytes, enhance_quality: bool) -> List[Dict[str, Any]]:
        """Apply multiple preprocessing strategies to improve OCR accuracy"""
        # Load image
        nparr = np.frombuffer(image_data, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            raise ValueError("Failed to decode image")
        
        # Store results from different preprocessing methods
        results = []
        
        # Method 1: Basic grayscale + adaptive threshold
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        results.append({
            'image': gray,
            'method': 'grayscale',
            'description': 'Basic grayscale conversion'
        })
        
        if enhance_quality:
            # Method 2: Bilateral filter + Otsu's threshold
            bilateral = cv2.bilateralFilter(gray, 11, 17, 17)
            _, otsu = cv2.threshold(bilateral, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            results.append({
                'image': otsu,
                'method': 'bilateral_otsu',
                'description': 'Bilateral filter with Otsu threshold'
            })
            
            # Method 3: CLAHE (Contrast Limited Adaptive Histogram Equalization)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(gray)
            _, thresh_clahe = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            results.append({
                'image': thresh_clahe,
                'method': 'clahe',
                'description': 'CLAHE contrast enhancement'
            })
            
            # Method 4: Adaptive threshold with noise reduction
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            adaptive = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                           cv2.THRESH_BINARY, 11, 2)
            results.append({
                'image': adaptive,
                'method': 'adaptive_gaussian',
                'description': 'Adaptive Gaussian threshold'
            })
        
        return results
    
    def perform_ocr(self, preprocessed_images: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Perform OCR with multiple configurations on preprocessed images"""
        results = []
        
        # Different Tesseract configurations to try
        configs = [
            ('--oem 3 --psm 4', 'single_column'),      # Assume single column
            ('--oem 3 --psm 6', 'uniform_block'),      # Uniform block of text
            ('--oem 3 --psm 3', 'automatic'),          # Fully automatic
            ('--oem 1 --psm 4', 'legacy_single'),      # Legacy engine
            ('--oem 3 --psm 11', 'sparse_text'),       # Sparse text
        ]
        
        for prep_result in preprocessed_images:
            image = prep_result['image']
            pil_image = Image.fromarray(image)
            
            for config, config_name in configs:
                try:
                    # Get text and confidence data
                    text = pytesseract.image_to_string(pil_image, config=config)
                    data = pytesseract.image_to_data(pil_image, config=config, 
                                                    output_type=pytesseract.Output.DICT)
                    
                    # Calculate average confidence (excluding -1 values)
                    confidences = [float(conf) for conf in data['conf'] if int(conf) > 0]
                    avg_confidence = sum(confidences) / len(confidences) if confidences else 0
                    
                    # Calculate text quality score
                    quality_score = self._calculate_text_quality(text)
                    
                    results.append({
                        'text': text,
                        'method': prep_result['method'],
                        'config': config_name,
                        'avg_confidence': avg_confidence,
                        'quality_score': quality_score,
                        'combined_score': avg_confidence * quality_score,
                        'data': data
                    })
                    
                except Exception as e:
                    logger.warning(f"OCR failed for {prep_result['method']} with {config_name}: {e}")
                    continue
        
        return results
    
    def _calculate_text_quality(self, text: str) -> float:
        """Calculate quality score based on text characteristics"""
        if not text:
            return 0.0
            
        score = 1.0
        
        # Check for receipt-like patterns
        patterns = {
            'currency': r'\$\d+\.\d{2}',
            'date': r'\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}',
            'receipt_keywords': r'(?i)(total|subtotal|tax|receipt|invoice|price|amount)',
            'store_indicators': r'(?i)(store|shop|restaurant|market|pharmacy)',
        }
        
        for pattern_name, pattern in patterns.items():
            if re.search(pattern, text):
                score *= 1.2
        
        # Penalize for too many special characters or numbers only
        alnum_ratio = sum(c.isalnum() for c in text) / len(text) if text else 0
        if alnum_ratio < 0.3:
            score *= 0.5
        
        # Reward for reasonable line count
        lines = [line for line in text.split('\n') if line.strip()]
        if 5 <= len(lines) <= 100:
            score *= 1.1
        
        return min(score, 2.0)  # Cap at 2.0
    
    def select_best_ocr_result(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Select the best OCR result based on combined scoring"""
        if not results:
            return {'text': '', 'method': 'none', 'config': 'none'}
        
        # Sort by combined score
        sorted_results = sorted(results, key=lambda x: x['combined_score'], reverse=True)
        
        # Log top 3 results for debugging
        for i, result in enumerate(sorted_results[:3]):
            logger.info(f"OCR Result {i+1}: method={result['method']}, "
                       f"config={result['config']}, score={result['combined_score']:.2f}")
        
        return sorted_results[0]
    
    def extract_structured_data(self, text: str) -> Dict[str, Any]:
        """Extract structured information from OCR text with improved parsing"""
        return {
            'store_name': self._extract_store_name(text),
            'total_amount': self._extract_total_amount(text),
            'purchase_date': self._extract_purchase_date(text),
            'items': self._extract_items_improved(text),
            'tax_amount': self._extract_tax_amount_improved(text),
            'subtotal': self._extract_subtotal(text)
        }
    
    def _extract_store_name(self, text: str) -> Optional[str]:
        """Extract store name with improved heuristics"""
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        
        if not lines:
            return None
        
        # Check first 5 lines for store name
        for i, line in enumerate(lines[:5]):
            # Skip common receipt headers
            skip_patterns = [
                r'^\d+$',  # Just numbers
                r'^\W+$',  # Just special characters
                r'(?i)^(receipt|invoice|bill|order)$',
                r'\d{1,2}[:/\-]\d{1,2}',  # Time patterns
                r'\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}',  # Date patterns
                r'(?i)(phone|tel|address|street|ave|rd)',  # Contact info
            ]
            
            if any(re.search(pattern, line) for pattern in skip_patterns):
                continue
            
            # Positive indicators for store names
            if len(line) > 3 and len(line) < 50:
                # Clean up the line
                cleaned = re.sub(r'[^\w\s\-&\']', ' ', line).strip()
                if cleaned and len(cleaned.split()) <= 5:  # Reasonable word count
                    return cleaned
        
        return None
    
    def _extract_tax_amount_improved(self, text: str) -> Optional[float]:
        """Improved tax amount extraction with multiple patterns"""
        # More comprehensive tax patterns
        tax_patterns = [
            # Standard tax patterns
            (r'(?i)(?:tax|hst|gst|vat|sales\s*tax)[\s:]*\$?\s*([\d,]+\.?\d{0,2})', 1.0),
            (r'(?i)(?:tax\s*total|total\s*tax)[\s:]*\$?\s*([\d,]+\.?\d{0,2})', 1.0),
            (r'(?i)(?:provincial\s*tax|federal\s*tax)[\s:]*\$?\s*([\d,]+\.?\d{0,2})', 0.9),
            
            # Line-by-line tax detection
            (r'(?i)^.*tax.*\$?\s*([\d,]+\.\d{2})\s*$', 0.8),
            
            # Tax abbreviations
            (r'(?i)(?:tx|st|ft)[\s:]*\$?\s*([\d,]+\.?\d{0,2})', 0.7),
        ]
        
        candidates = []
        
        for pattern, confidence in tax_patterns:
            matches = re.finditer(pattern, text, re.MULTILINE)
            for match in matches:
                try:
                    amount = float(match.group(1).replace(',', ''))
                    # Tax amounts are typically reasonable (not too large or small)
                    if 0.01 <= amount <= 1000.0:
                        candidates.append((amount, confidence))
                except (ValueError, IndexError):
                    continue
        
        if candidates:
            # Sort by confidence, then by reasonable tax amount
            candidates.sort(key=lambda x: x[1], reverse=True)
            return candidates[0][0]
        
        return None
    
    def _extract_items_improved(self, text: str) -> List[Dict[str, Any]]:
        """Improved item extraction with better parsing"""
        lines = text.split('\n')
        items = []
        
        # Define what lines to skip (headers, footers, totals, etc.)
        skip_line_if_contains = [
            'total', 'subtotal', 'tax', 'balance', 'change', 'cash', 'credit', 'debit',
            'payment', 'thank you', 'receipt', 'invoice', 'cashier', 'server',
            'visit us', 'store hours', 'customer service', 'phone', 'address',
            'street', 'avenue', 'road', 'city', 'state', 'zip', 'postal'
        ]
        
        for line_num, line in enumerate(lines):
            original_line = line.strip()
            if not original_line or len(original_line) < 3:
                continue
            
            # Skip lines that contain skip keywords
            line_lower = original_line.lower()
            if any(keyword in line_lower for keyword in skip_line_if_contains):
                continue
            
            # Skip lines that match skip patterns
            if any(re.search(pattern, original_line) for pattern in self.skip_patterns):
                continue
            
            # Try different item parsing patterns
            parsed_item = self._parse_item_line(original_line)
            if parsed_item:
                items.append(parsed_item)
        
        # Post-process items to remove duplicates and clean up
        items = self._clean_item_list(items)
        
        return items
    
    def _parse_item_line(self, line: str) -> Optional[Dict[str, Any]]:
        """Parse a single line to extract item information"""
        
        # Pattern 1: Quantity at the beginning: "2 Item Name $10.50" or "2x Item Name $10.50"
        pattern1 = r'^(\d+)\s*[xX]?\s+(.+?)\s+\$?\s*(\d+\.?\d{0,2})\s*$'
        match = re.match(pattern1, line)
        if match:
            try:
                quantity = int(match.group(1))
                name = match.group(2).strip()
                total_price = float(match.group(3))
                unit_price = total_price / quantity if quantity > 0 else total_price
                
                if self._is_valid_item_name(name) and total_price > 0:
                    return {
                        'name': name,
                        'quantity': quantity,
                        'price': round(unit_price, 2)
                    }
            except (ValueError, ZeroDivisionError):
                pass
        
        # Pattern 2: Item with @ symbol: "Item Name 2 @ $5.25"
        pattern2 = r'^(.+?)\s+(\d+)\s*@\s*\$?\s*(\d+\.?\d{0,2})\s*$'
        match = re.match(pattern2, line)
        if match:
            try:
                name = match.group(1).strip()
                quantity = int(match.group(2))
                unit_price = float(match.group(3))
                
                if self._is_valid_item_name(name) and unit_price > 0:
                    return {
                        'name': name,
                        'quantity': quantity,
                        'price': unit_price
                    }
            except ValueError:
                pass
        
        # Pattern 3: Simple item with price at end: "Item Name $12.99"
        pattern3 = r'^(.+?)\s+\$?\s*(\d+\.\d{2})\s*$'
        match = re.match(pattern3, line)
        if match:
            try:
                name = match.group(1).strip()
                price = float(match.group(2))
                
                if self._is_valid_item_name(name) and price > 0:
                    return {
                        'name': name,
                        'quantity': 1,
                        'price': price
                    }
            except ValueError:
                pass
        
        # Pattern 4: Item name followed by quantity and price: "Item Name x2 $10.00"
        pattern4 = r'^(.+?)\s*[xX]\s*(\d+)\s+\$?\s*(\d+\.?\d{0,2})\s*$'
        match = re.match(pattern4, line)
        if match:
            try:
                name = match.group(1).strip()
                quantity = int(match.group(2))
                total_price = float(match.group(3))
                unit_price = total_price / quantity if quantity > 0 else total_price
                
                if self._is_valid_item_name(name) and total_price > 0:
                    return {
                        'name': name,
                        'quantity': quantity,
                        'price': round(unit_price, 2)
                    }
            except (ValueError, ZeroDivisionError):
                pass
        
        return None
    
    def _is_valid_item_name(self, name: str) -> bool:
        """Check if a string is a valid item name"""
        if not name or len(name) < 2:
            return False
        
        # Name shouldn't be too long (likely address or other info)
        if len(name) > 100:
            return False
        
        # Name shouldn't be mostly numbers
        if sum(c.isdigit() for c in name) > len(name) * 0.7:
            return False
        
        # Name shouldn't contain too many special characters
        special_chars = sum(1 for c in name if not c.isalnum() and c not in ' -&\'.')
        if special_chars > len(name) * 0.3:
            return False
        
        # Skip common non-item patterns
        invalid_patterns = [
            r'(?i)(street|avenue|road|blvd|suite|floor|apt)',
            r'(?i)(phone|tel|fax|email|www)',
            r'(?i)(hours|monday|tuesday|wednesday|thursday|friday|saturday|sunday)',
            r'(?i)(manager|cashier|server|clerk)',
            r'^\d+$',  # Just a number
        ]
        
        if any(re.search(pattern, name) for pattern in invalid_patterns):
            return False
        
        return True
    
    def _clean_item_list(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Clean up the item list by removing duplicates and invalid entries"""
        if not items:
            return []
        
        cleaned_items = []
        seen_names = set()
        
        for item in items:
            name_lower = item['name'].lower().strip()
            
            # Skip if we've seen this item name before
            if name_lower in seen_names:
                continue
            
            # Skip items with invalid prices
            if item['price'] <= 0 or item['price'] > 10000:
                continue
            
            # Skip items with invalid quantities
            if item['quantity'] <= 0 or item['quantity'] > 100:
                continue
            
            seen_names.add(name_lower)
            cleaned_items.append(item)
        
        return cleaned_items
    
    def _extract_total_amount(self, text: str) -> Optional[float]:
        """Extract total amount with multiple pattern matching"""
        # Comprehensive patterns for total detection
        patterns = [
            (r'(?i)(?:total|tot|balance\s+due|amount\s+due)[\s:]*\$?\s*([\d,]+\.?\d{0,2})', 1.0),
            (r'(?i)(?:grand\s+total|g\.?\s*total)[\s:]*\$?\s*([\d,]+\.?\d{0,2})', 1.0),
            (r'\$\s*([\d,]+\.\d{2})(?=\s*(?:total|tot))', 0.9),
            (r'(?i)(?:pay|due)[\s:]*\$?\s*([\d,]+\.?\d{0,2})', 0.8),
            (r'(?i)(?:sale|sales)[\s:]*\$?\s*([\d,]+\.?\d{0,2})', 0.7),
        ]
        
        candidates = []
        
        for pattern, confidence in patterns:
            matches = re.finditer(pattern, text)
            for match in matches:
                try:
                    amount = float(match.group(1).replace(',', ''))
                    candidates.append((amount, confidence))
                except ValueError:
                    continue
        
        if candidates:
            # Sort by confidence and amount (larger amounts more likely to be total)
            candidates.sort(key=lambda x: (x[1], x[0]), reverse=True)
            return candidates[0][0]
        
        # Fallback: Find largest currency amount
        currency_pattern = r'\$?\s*([\d,]+\.\d{2})'
        amounts = []
        for match in re.finditer(currency_pattern, text):
            try:
                amount = float(match.group(1).replace(',', ''))
                amounts.append(amount)
            except ValueError:
                continue
        
        return max(amounts) if amounts else None
    
    def _extract_subtotal(self, text: str) -> Optional[float]:
        """Extract subtotal amount"""
        patterns = [
            r'(?i)(?:subtotal|sub\s*total|sub\s*tot)[\s:]*\$?\s*([\d,]+\.?\d{0,2})',
            r'(?i)(?:total\s+before\s+tax)[\s:]*\$?\s*([\d,]+\.?\d{0,2})',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                try:
                    return float(match.group(1).replace(',', ''))
                except ValueError:
                    continue
        
        return None
    
    def _extract_purchase_date(self, text: str) -> Optional[str]:
        """Extract and normalize purchase date"""
        # Date patterns in order of preference
        patterns = [
            (r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})', 'MDY'),  # MM/DD/YYYY
            (r'(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})', 'YMD'),  # YYYY/MM/DD
            (r'(\d{1,2})[/\-](\d{1,2})[/\-](\d{2})', 'MDY'),   # MM/DD/YY
            (r'(\d{1,2})\.(\d{1,2})\.(\d{4})', 'DMY'),         # DD.MM.YYYY
            (r'([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})', 'MDY'), # Jan 15, 2024
        ]
        
        for pattern, format_type in patterns:
            match = re.search(pattern, text)
            if match:
                try:
                    if format_type == 'MDY':
                        if len(match.group(3)) == 2:
                            year = 2000 + int(match.group(3))
                        else:
                            year = int(match.group(3))
                        month = int(match.group(1))
                        day = int(match.group(2))
                    elif format_type == 'YMD':
                        year = int(match.group(1))
                        month = int(match.group(2))
                        day = int(match.group(3))
                    elif format_type == 'DMY':
                        day = int(match.group(1))
                        month = int(match.group(2))
                        year = int(match.group(3))
                    
                    # Validate date
                    if 1 <= month <= 12 and 1 <= day <= 31:
                        date = datetime(year, month, day)
                        return date.strftime('%Y-%m-%d')
                        
                except (ValueError, AttributeError):
                    continue
        
        return None
    
    def calculate_confidence_scores(self, extracted_data: Dict[str, Any], 
                                  ocr_result: Dict[str, Any]) -> Dict[str, float]:
        """Calculate confidence scores for each extracted field"""
        scores = {}
        
        # OCR confidence
        scores['ocr_quality'] = min(ocr_result.get('avg_confidence', 0) / 100, 1.0)
        
        # Store name confidence
        if extracted_data['store_name']:
            scores['store_name'] = 0.8 if len(extracted_data['store_name']) > 2 else 0.3
        else:
            scores['store_name'] = 0.0
        
        # Total amount confidence
        if extracted_data['total_amount'] is not None:
            scores['total_amount'] = 0.9
            # Boost if subtotal + tax approximately equals total
            if extracted_data['subtotal'] and extracted_data['tax_amount']:
                calculated_total = extracted_data['subtotal'] + extracted_data['tax_amount']
                if abs(calculated_total - extracted_data['total_amount']) < 0.10:
                    scores['total_amount'] = 1.0
        else:
            scores['total_amount'] = 0.0
        
        # Date confidence
        if extracted_data['purchase_date']:
            scores['purchase_date'] = 0.85
        else:
            scores['purchase_date'] = 0.0
        
        # Items confidence
        if extracted_data['items']:
            # Check if item prices sum close to subtotal/total
            item_sum = sum(item['price'] * item['quantity'] for item in extracted_data['items'])
            
            if extracted_data['subtotal']:
                diff_ratio = abs(item_sum - extracted_data['subtotal']) / extracted_data['subtotal']
                scores['items'] = max(0, 1 - diff_ratio)
            elif extracted_data['total_amount']:
                diff_ratio = abs(item_sum - extracted_data['total_amount']) / extracted_data['total_amount']
                scores['items'] = max(0, 0.8 - diff_ratio)
            else:
                scores['items'] = 0.5 if len(extracted_data['items']) > 0 else 0.0
        else:
            scores['items'] = 0.0
        
        # Tax confidence
        if extracted_data['tax_amount'] is not None:
            scores['tax_extraction'] = 0.8
        else:
            scores['tax_extraction'] = 0.0
        
        return scores
    
    def suggest_category(self, extracted_data: Dict[str, Any]) -> Optional[str]:
        """Suggest a category based on store name and items"""
        store_name = (extracted_data.get('store_name') or '').lower()
        items_text = ' '.join([item['name'].lower() for item in extracted_data.get('items', [])])
        combined_text = f"{store_name} {items_text}"
        
        # Category keywords mapping
        category_keywords = {
            'Groceries': ['grocery', 'market', 'mart', 'foods', 'produce', 'meat', 'dairy', 'bread'],
            'Restaurants': ['restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'diner', 'grill'],
            'Gas & Fuel': ['gas', 'fuel', 'petrol', 'station', 'shell', 'exxon', 'chevron'],
            'Healthcare': ['pharmacy', 'drug', 'medical', 'clinic', 'hospital', 'cvs', 'walgreens'],
            'Shopping': ['store', 'shop', 'retail', 'mall', 'fashion', 'clothing', 'department'],
            'Entertainment': ['cinema', 'movie', 'theater', 'game', 'sport', 'ticket'],
            'Transportation': ['uber', 'lyft', 'taxi', 'bus', 'train', 'subway', 'parking']
        }
        
        # Score each category
        category_scores = {}
        for category, keywords in category_keywords.items():
            score = sum(1 for keyword in keywords if keyword in combined_text)
            if score > 0:
                category_scores[category] = score
        
        # Return highest scoring category
        if category_scores:
            return max(category_scores.items(), key=lambda x: x[1])[0]
        
        return 'Other'
    
    def get_available_categories(self) -> List[str]:
        """Return list of available categories"""
        return self.categories
    
    def _create_error_response(self, error_message: str) -> Dict[str, Any]:
        """Create a standardized error response"""
        return {
            'success': False,
            'error_message': error_message,
            'extracted_text': '',
            'store_name': None,
            'total_amount': None,
            'purchase_date': None,
            'items': [],
            'tax_amount': None,
            'subtotal': None,
            'suggested_category': None,
            'overall_confidence': 0.0,
            'confidence_breakdown': {}
        }