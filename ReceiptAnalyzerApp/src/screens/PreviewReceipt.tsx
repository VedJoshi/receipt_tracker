import React, { useState } from 'react';
import { View, Image, TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { receiptService } from '../services/receipts';

export default function PreviewReceipt({ route, navigation }) {
  const { uri, width, height } = route.params;
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleUpload = async () => {
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      // use placeholder metadata
      // Later, add a form to collect this information
      const metadata = {
        store_name: 'Unknown Store',
        total_amount: 0,
        purchase_date: new Date().toISOString(),
      };

      const { receipt, error } = await receiptService.uploadReceipt(
        uri,
        metadata,
        (progress) => setUploadProgress(progress)
      );

      if (error) throw error;

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
      console.error('Error uploading receipt:', error);
      Alert.alert('Error', 'Failed to upload receipt. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: `file://${path}` }}
          style={styles.image}
          resizeMode="contain"
        />
      </View>

      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={[styles.button, styles.retakeButton]}
          onPress={() => navigation.goBack()}
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