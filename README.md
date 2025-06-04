# Receipt Tracker

A simple web app to digitize and organize your receipts. Upload photos of receipts, and the app automatically extracts key information like store name, total amount, date, and items.

## What it does

- **Upload receipts**: Take a photo or upload an image of your receipt
- **Auto-extract data**: Uses OCR to automatically read store name, total, date, and items
- **Edit & organize**: Fix any mistakes and categorize your receipts
- **Search & view**: Find receipts easily and track your spending

## How to use

1. **Sign up** for an account
2. **Upload** a receipt image by clicking "Upload Receipt" or dragging and dropping
3. **Wait** for the app to process and extract the information
4. **Review** the extracted data and make any corrections
5. **Organize** by adding categories like "Groceries" or "Restaurants"

## What you need

- A web browser
- Receipt images (photos from your phone work great)
- Internet connection

## Tech used

- **Frontend**: React app for the user interface
- **Backend**: Node.js API to handle uploads and data
- **Database**: Supabase for storing receipt data
- **Storage**: AWS S3 for receipt images
- **OCR**: Custom service to read text from images

## Quick setup for developers

1. Clone this repository
2. Set up environment variables for Supabase and AWS
3. Run `npm install` in both frontend and backend folders
4. Start with `npm start` (frontend) and `npm run dev` (backend)