import React, { useState } from 'react';
import { View, Image, TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { storageService } from '../services/storage';

export default function PreviewReceipt({ route, navigation }) {
  const { uri } = route.params;
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleUpload = async () => {
    setIsUploading(true);
    try {
      const result = await storageService.uploadFile(uri, (progress) => {
        setUploadProgress(progress);
      });

      if (result.error) {
        throw result.error;
      }

      Alert.alert(
        'Success',
        'Receipt uploaded successfully!',
        [
          {
            text: 'View Receipts',
            onPress: () => navigation.navigate('ViewReceipts')
          }
        ]
      );
    } catch (error) {
      console.error('Upload failed:', error);
      Alert.alert('Error', 'Failed to upload receipt. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.imageContainer}>
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode="contain"
        />
        
        {/* Add progress indicator */}
        {isUploading && (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
            <Text style={styles.progressText}>{Math.round(uploadProgress)}%</Text>
          </View>
        )}
      </View>

      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={[styles.button, styles.retakeButton]}
          onPress={() => navigation.goBack()}
          disabled={isUploading}
        >
          <Text style={styles.buttonText}>Retake</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button, 
            styles.uploadButton,
            isUploading && styles.uploadButtonDisabled
          ]}
          onPress={handleUpload}
          disabled={isUploading}
        >
          <Text style={styles.buttonText}>
            {isUploading ? 'Uploading...' : 'Upload Receipt'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  imageContainer: {
    flex: 1,
    margin: 16,
  },
  image: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#22c55e',
  },
  progressText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 24,
    gap: 16,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  retakeButton: {
    backgroundColor: '#ef4444',
  },
  uploadButton: {
    backgroundColor: '#22c55e',
  },
  uploadButtonDisabled: {
    backgroundColor: '#86efac',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});