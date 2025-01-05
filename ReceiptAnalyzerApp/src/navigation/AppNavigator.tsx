import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from '../screens/HomeScreen';
import ScanReceipt from '../screens/ScanReceipt';
import PreviewReceipt from '../screens/PreviewReceipt';
//import ViewReceipts from '../screens/ViewReceipts';
//import Analysis from '../screens/Analysis';

const Stack = createNativeStackNavigator();

export function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#f9fafb',
        },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen 
        name="Home" 
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="ScanReceipt" 
        component={ScanReceipt}
        options={{ 
          title: 'Scan Receipt',
          headerStyle: {
            backgroundColor: 'black',
          },
          headerTintColor: 'white',
        }}
      />
      <Stack.Screen 
        name="PreviewReceipt" 
        component={PreviewReceipt}
        options={{ title: 'Preview Receipt' }}
      />
      </Stack.Navigator>
  );
}