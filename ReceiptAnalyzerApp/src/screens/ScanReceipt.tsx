import React, { useState, useRef, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import { Camera, CameraType, CameraCapturedPicture } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type RootStackParamList = {
  PreviewReceipt: {
    uri: string;
    width: number;
    height: number;
  };
};

type ScanReceiptProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PreviewReceipt'>;
};

export default function ScanReceipt({ navigation }: ScanReceiptProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const cameraRef = useRef<Camera | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const captureReceipt = async () => {
    if (cameraRef.current && !isLoading) {
      try {
        setIsLoading(true);
        
        const photo: CameraCapturedPicture = await cameraRef.current.takePictureAsync({
          quality: 1,
          base64: false,
        });

        navigation.navigate('PreviewReceipt', { 
          uri: photo.uri,
          width: photo.width,
          height: photo.height 
        });
        
      } catch (error) {
        console.error('Error capturing receipt:', error);
        Alert.alert('Error', 'Failed to capture receipt. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>No access to camera</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        type={CameraType.back}
        ratio="16:9"
      />
      
      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[styles.captureButton, isLoading && styles.captureButtonDisabled]}
          onPress={captureReceipt}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? 'Capturing...' : 'Capture Receipt'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'black',
    },
    controlsContainer: {
      position: 'absolute',
      bottom: 32,
      left: 0,
      right: 0,
      paddingHorizontal: 24,
    },
    captureButton: {
      backgroundColor: '#3b82f6',
      padding: 16,
      borderRadius: 8,
      alignItems: 'center',
    },
    captureButtonDisabled: {
      backgroundColor: '#93c5fd',
    },
    buttonText: {
      color: 'white',
      fontSize: 18,
      fontWeight: '600',
    },
    text: {
      color: 'white',
      fontSize: 16,
      textAlign: 'center',
      marginTop: 32,
    },
  });