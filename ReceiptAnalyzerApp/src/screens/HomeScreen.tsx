import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.contentContainer}>
        <Text style={styles.title}>
          Receipt Analyzer
        </Text>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={styles.blueButton}
            onPress={() => navigation.navigate('ScanReceipt')}
          >
            <Text style={styles.buttonText}>
              Scan New Receipt
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.greenButton}
            onPress={() => navigation.navigate('ViewReceipts')}
          >
            <Text style={styles.buttonText}>
              View All Receipts
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.purpleButton}
            onPress={() => navigation.navigate('Analysis')}
          >
            <Text style={styles.buttonText}>
              Spending Analysis
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.pinkButton}
            onPress={() => navigation.navigate('TestUpload')}
          >
            <Text style={styles.buttonText}>Test Upload</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  contentContainer: {
    padding: 24,
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#374151',
    marginVertical: 32,
  },
  buttonContainer: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  buttonBase: {
    padding: 16,
    borderRadius: 8,
    width: 256,
  },

  blueButton: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 8,
    width: 256,
  },
  greenButton: {
    backgroundColor: '#22c55e',
    padding: 16,
    borderRadius: 8,
    width: 256,
  },
  pinkButton: {
    backgroundColor: '#ec4899',
    padding: 16,
    borderRadius: 8,
    width: 256,
  },
  purpleButton: {
    backgroundColor: '#a855f7',
    padding: 16,
    borderRadius: 8,
    width: 256,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
});