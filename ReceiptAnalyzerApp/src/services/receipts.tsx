import { Storage } from 'aws-amplify';
import { supabase } from '../lib/supabase';

interface ReceiptMetadata {
  id?: string;
  store_name: string;
  total_amount: number;
  purchase_date: string;
  image_url: string;
}

export const receiptService = {
  // Upload a receipt image to S3 and store metadata in Supabase
  uploadReceipt: async (
    imageUri: string,
    metadata: Omit<ReceiptMetadata, 'image_url'>,
    progressCallback?: (progress: number) => void
  ) => {
    try {
      const filename = `receipts/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      const response = await fetch(imageUri);
      const blob = await response.blob();
      
      // Upload to S3 with progress tracking
      const uploadResult = await Storage.put(filename, blob, {
        contentType: 'image/jpeg',
        progressCallback: (progress) => {
          const calculated = (progress.loaded / progress.total) * 100;
          progressCallback?.(calculated);
        },
      });

      // Get the S3 URL for the uploaded image
      const imageUrl = await Storage.get(filename);

      // Store receipt metadata in Supabase
      const { data, error } = await supabase
        .from('receipts')
        .insert([
          {
            ...metadata,
            image_url: imageUrl,
          }
        ])
        .select()
        .single();

      if (error) throw error;
      
      return { receipt: data, error: null };
    } catch (error) {
      console.error('Error uploading receipt:', error);
      return { receipt: null, error };
    }
  },

  // Get all receipts from the database
  getReceipts: async () => {
    try {
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      return { receipts: data, error: null };
    } catch (error) {
      console.error('Error fetching receipts:', error);
      return { receipts: null, error };
    }
  },

  // Delete a receipt (from both S3 and database)
  deleteReceipt: async (receiptId: string, imageUrl: string) => {
    try {
      // Extract the filename from the S3 URL
      const filename = imageUrl.split('/').pop();
      
      // Delete from S3
      await Storage.remove(filename);

      // Delete from Supabase
      const { error } = await supabase
        .from('receipts')
        .delete()
        .match({ id: receiptId });

      if (error) throw error;
      
      return { error: null };
    } catch (error) {
      console.error('Error deleting receipt:', error);
      return { error };
    }
  },
};