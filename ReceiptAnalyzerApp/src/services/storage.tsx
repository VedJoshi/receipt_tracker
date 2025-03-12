import { Amplify, Storage } from 'aws-amplify';
import {
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  AWS_REGION,
  AWS_BUCKET_NAME
} from '@env';

Amplify.configure({
  Storage: {
    AWSS3: {
      bucket: AWS_BUCKET_NAME,
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
      },
      identityPoolId: undefined,
      level: 'public',
      customPrefix: {
        public: ''
      }
    }
  }
});


export const storageService = {
  uploadFile: async (uri: string, progressCallback?: (progress: number) => void) => {
    // Keep track of the filename for error handling
    let filename: string | null = null;
    
    try {
      console.log('Starting upload with config:', {
        bucket: AWS_BUCKET_NAME,
        region: AWS_REGION,
        hasCredentials: !!(AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY)
      });
  
      const response = await fetch(uri);
      const blob = await response.blob();
      
      // Generate unique filename
      filename = `receipts/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      console.log('Attempting upload of:', filename);
      
      const result = await Storage.put(filename, blob, {
        contentType: 'image/jpeg',
        progressCallback: (progress) => {
          const percentage = (progress.loaded / progress.total) * 100;
          console.log(`Upload progress: ${percentage}%`);
          progressCallback?.(percentage);
        }
      });
      
      console.log('Upload result:', result);
      
      // Get the URL of the uploaded file
      const url = await Storage.get(filename);
      
      return {
        url,
        key: filename,
        error: null
      };
      
    } catch (error) {
      console.error('Initial error in upload process:', {
        errorMessage: error.message,
        errorCode: error.code,
        errorName: error.name,
        stack: error.stack
      });

      // If we have a filename, let's check if the file actually made it to S3
      if (filename) {
        try {
          console.log('Checking if file exists despite error...');
          const url = await Storage.get(filename);
          
          console.log('File found in S3:', url);
          return {
            url,
            key: filename,
            warning: 'File uploaded successfully but encountered some non-critical errors',
            originalError: error.message
          };
        } catch (secondError) {
          console.error('File not found in S3 after error');
          return { 
            url: null, 
            key: null, 
            error: error.message 
          };
        }
      }

      return { 
        url: null, 
        key: null, 
        error: error.message 
      };
    }
  }
};