import React, { useState, useEffect } from 'react';
import { View, Button, Text, Image, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { storageService } from '../services/storage';
import { Alert } from 'react-native';

// Define the possible states of our upload process
type UploadState = 'idle' | 'uploading' | 'success' | 'warning' | 'error';

export default function TestUpload() {
  // State management with more specific types
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // Request permissions when component mounts
  useEffect(() => {
    (async () => {
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          setErrorMessage('We need camera roll permissions to upload images');
        }
      } catch (err) {
        console.error('Error requesting permissions:', err);
        setErrorMessage('Failed to request permissions');
      }
    })();
  }, []);

  // Handle image selection
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled) {
        // Reset states when new image is selected
        setSelectedImage(result.assets[0].uri);
        setUploadedUrl(null);
        setUploadProgress(0);
        setUploadState('idle');
        setErrorMessage(null);
        setWarningMessage(null);
      }
    } catch (err) {
      console.error('Error picking image:', err);
      setErrorMessage('Failed to select image');
      setUploadState('error');
    }
  };

  // Handle image upload
  const uploadImage = async () => {
    if (!selectedImage) return;
    
    setUploadState('uploading');
    setErrorMessage(null);
    setWarningMessage(null);
    
    try {
      const result = await storageService.uploadFile(
        selectedImage,
        (progress) => setUploadProgress(progress)
      );

      // Handle different response scenarios
      if (result.error) {
        throw new Error(result.error);
      } else if (result.warning) {
        setWarningMessage(result.warning);
        setUploadState('warning');
        setUploadedUrl(result.url);
        
        Alert.alert(
          'Upload Complete',
          'File uploaded successfully, but with some minor issues.',
          [
            {
              text: 'View File',
              onPress: () => {
                // You could open the URL in a browser here
                console.log('File URL:', result.url);
              }
            },
            { text: 'OK' }
          ]
        );
      } else {
        setUploadState('success');
        setUploadedUrl(result.url);
        Alert.alert('Success', 'File uploaded successfully!');
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setErrorMessage(err.message || 'Failed to upload image');
      setUploadState('error');
    }
  };

  // Render upload status message
  const renderStatusMessage = () => {
    switch (uploadState) {
      case 'uploading':
        return <Text style={styles.progressText}>Uploading... {uploadProgress.toFixed(1)}%</Text>;
      case 'success':
        return <Text style={styles.successText}>Upload successful!</Text>;
      case 'warning':
        return (
          <View>
            <Text style={styles.warningText}>{warningMessage}</Text>
            <Text style={styles.successText}>File available at: {uploadedUrl}</Text>
          </View>
        );
      case 'error':
        return <Text style={styles.errorText}>{errorMessage}</Text>;
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.debugText}>Test Upload Screen</Text>
      
      {errorMessage && (
        <Text style={styles.errorText}>{errorMessage}</Text>
      )}

      <Button 
        title="Pick an image" 
        onPress={pickImage}
        disabled={uploadState === 'uploading'}
      />
      
      {selectedImage && (
        <View style={styles.imagePreview}>
          <Image 
            source={{ uri: selectedImage }} 
            style={styles.image}
            onError={(e) => {
              console.error('Image loading error:', e.nativeEvent.error);
              setErrorMessage('Failed to load image preview');
            }}
          />
          <Button 
            title={uploadState === 'uploading' ? "Uploading..." : "Upload to S3"} 
            onPress={uploadImage}
            disabled={uploadState === 'uploading'}
          />
        </View>
      )}
      
      {renderStatusMessage()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff', // Add background color
  },
  debugText: {
    marginBottom: 20,
    fontSize: 18,
    color: '#333',
  },
  errorText: {
    color: 'red',
    marginBottom: 10,
  },
  imagePreview: {
    marginTop: 20,
    alignItems: 'center',
  },
  image: {
    width: 200,
    height: 200,
    marginBottom: 20,
    backgroundColor: '#f0f0f0', // Add background color to show image bounds
  },
  successText: {
    marginTop: 20,
    color: 'green',
  },
  warningText: {
    color: '#f59e0b', // Amber color for warnings
    marginTop: 10,
  },
  progressText: {
    color: '#3b82f6', // Blue color for progress
    marginTop: 10,
  }
});