import React, { useState } from 'react';
import { View, Button, Text, Image, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { storageService } from '../services/storage';

export default function TestUpload() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
      setUploadedUrl(null);
      setUploadProgress(0);
    }
  };

  const uploadImage = async () => {
    if (!selectedImage) return;
    
    setIsLoading(true);
    try {
      const { url, error } = await storageService.uploadFile(
        selectedImage,
        (progress) => setUploadProgress(progress)
      );

      if (error) throw error;
      setUploadedUrl(url);
      alert('Upload successful!');
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Button title="Pick an image" onPress={pickImage} />
      
      {selectedImage && (
        <View style={styles.imagePreview}>
          <Image source={{ uri: selectedImage }} style={styles.image} />
          <Button 
            title={isLoading ? "Uploading..." : "Upload to S3"} 
            onPress={uploadImage}
            disabled={isLoading}
          />
          {uploadProgress > 0 && (
            <Text>Upload Progress: {uploadProgress.toFixed(1)}%</Text>
          )}
        </View>
      )}
      
      {uploadedUrl && (
        <Text style={styles.successText}>
          File uploaded successfully! URL: {uploadedUrl}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreview: {
    marginTop: 20,
    alignItems: 'center',
  },
  image: {
    width: 200,
    height: 200,
    marginBottom: 20,
  },
  successText: {
    marginTop: 20,
    color: 'green',
  },
});