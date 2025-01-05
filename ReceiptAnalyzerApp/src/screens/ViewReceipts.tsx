import React, { useState, useEffect } from 'react';
import { 
  View, 
  FlatList, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Image,
  RefreshControl 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// We'll use this interface to define the shape of our receipt data
interface Receipt {
  id: string;
  imageUrl: string;
  uploadDate: string;
  totalAmount?: string;
  storeName?: string;
}

export default function ViewReceipts({ navigation }) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // This function will eventually fetch receipts from your backend
  const fetchReceipts = async () => {
    try {
      setIsLoading(true);
      // For now, we'll use dummy data
      // Later, this will be replaced with actual API calls
      const dummyReceipts: Receipt[] = [
        {
          id: '1',
          imageUrl: 'https://placeholder.com/receipt1',
          uploadDate: new Date().toISOString(),
          totalAmount: '$45.99',
          storeName: 'Grocery Store'
        },
        // Add more dummy receipts as needed
      ];
      
      setReceipts(dummyReceipts);
    } catch (error) {
      console.error('Error fetching receipts:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Fetch receipts when the screen loads
  useEffect(() => {
    fetchReceipts();
  }, []);

  // Render each receipt item
  const renderReceiptItem = ({ item }: { item: Receipt }) => (
    <TouchableOpacity 
      style={styles.receiptCard}
      onPress={() => navigation.navigate('ReceiptDetail', { receipt: item })}
    >
      <View style={styles.receiptInfo}>
        <Text style={styles.storeName}>{item.storeName || 'Unknown Store'}</Text>
        <Text style={styles.date}>
          {new Date(item.uploadDate).toLocaleDateString()}
        </Text>
        {item.totalAmount && (
          <Text style={styles.amount}>{item.totalAmount}</Text>
        )}
      </View>
      <View style={styles.thumbnailContainer}>
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.thumbnail}
          defaultSource={require('../assets/receipt-placeholder.png')}
        />
      </View>
    </TouchableOpacity>
  );

  // Show loading state
  if (isLoading && !isRefreshing) {
    return (
      <View style={styles.centerContainer}>
        <Text>Loading receipts...</Text>
      </View>
    );
  }

  // Show empty state
  if (receipts.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>No receipts yet</Text>
        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => navigation.navigate('ScanReceipt')}
        >
          <Text style={styles.scanButtonText}>Scan a Receipt</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={receipts}
        renderItem={renderReceiptItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              fetchReceipts();
            }}
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  listContainer: {
    padding: 16,
    gap: 12,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  receiptCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  receiptInfo: {
    flex: 1,
    marginRight: 16,
  },
  storeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  date: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  amount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#059669',
  },
  thumbnailContainer: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 16,
  },
  scanButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  scanButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});