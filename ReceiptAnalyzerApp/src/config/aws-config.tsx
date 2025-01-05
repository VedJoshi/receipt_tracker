import { Amplify } from 'aws-amplify';

Amplify.configure({
  Storage: {
    AWSS3: {
      bucket: 'receipt-analyzer-images-v1.0',
      region: 'us-east-1',
      identityPoolId: 'your-identity-pool-id' 
    }
  }
});