import { Storage } from 'aws-amplify';
import { Amplify } from 'aws-amplify';
import {
  AWS_BUCKET_NAME,
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY
} from '@env';

// Configure AWS Amplify to use our credentials
Amplify.configure({
  Storage: {
    AWSS3: {
      bucket: AWS_BUCKET_NAME,
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
      }
    }
  }
});

// Create a service to handle all S3-related operations
export const storageService = {
  // Upload a file to S3
  uploadFile: async (
    uri: string,
    progressCallback?: (progress: number) => void
  ) => {
    try {
      console.log('Starting file upload...');
      
      // Convert the file URI to a blob
      const response = await fetch(uri);
      const blob = await response.blob();
      
      // Create a unique filename using timestamp
      const filename = `receipts/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      
      // Upload to S3
      const result = await Storage.put(filename, blob, {
        contentType: 'image/jpeg',
        progressCallback: (progress) => {
          const percentage = (progress.loaded / progress.total) * 100;
          progressCallback?.(percentage);
          console.log(`Upload progress: ${percentage}%`);
        }
      });
      
      // Get the public URL of the uploaded file
      const fileUrl = await Storage.get(filename);
      
      console.log('File uploaded successfully:', fileUrl);
      return { url: fileUrl, key: filename, error: null };
      
    } catch (error) {
      console.error('Error uploading file:', error);
      return { url: null, key: null, error };
    }
  },

  // Delete a file from S3
  deleteFile: async (key: string) => {
    try {
      await Storage.remove(key);
      console.log('File deleted successfully:', key);
      return { error: null };
    } catch (error) {
      console.error('Error deleting file:', error);
      return { error };
    }
  }
};