import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from '../screens/HomeScreen';
import ScanReceipt from '../screens/ScanReceipt';
import PreviewReceipt from '../screens/PreviewReceipt';
import TestUpload from '../screens/TestUpload';

const Stack = createNativeStackNavigator();

export function AppNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="Home" 
        component={HomeScreen} 
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="TestUpload" 
        component={TestUpload}
        options={{ title: 'Test Upload' }}
      />
      <Stack.Screen 
        name="ScanReceipt" 
        component={ScanReceipt}
        options={{ title: 'Scan Receipt' }}
      />
      <Stack.Screen 
        name="PreviewReceipt" 
        component={PreviewReceipt}
        options={{ title: 'Preview Receipt' }}
      />
    </Stack.Navigator>
  );
}