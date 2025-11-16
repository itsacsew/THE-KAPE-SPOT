// app/(tabs)/log.tsx
import { useState, useEffect } from 'react';
import {
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ImageBackground,
    Alert,
    Modal,
    Dimensions,
    Text
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather } from "@expo/vector-icons";
import Navbar from '@/components/Navbar';
import { NetworkScanner } from '@/lib/network-scanner';
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';
import { OfflineSyncService } from '@/lib/offline-sync';
import {
    getFirestore,
    collection,
    getDocs,
    query,
    where,
    orderBy,
    deleteDoc,
    doc
} from 'firebase/firestore';
import { app } from '@/lib/firebase-config';
import { getOrderNumberIndicator } from './orderStatus';
import BleManager from 'react-native-ble-manager';

interface OrderItem {
    name: string;
    quantity: number;
    price: number;
    ready?: boolean;
    cancelled?: boolean;
}

interface OrderData {
    orderId: string;
    customerName: string;
    items: OrderItem[];
    subtotal: number;
    total: number;
    timestamp: string;
    status: 'unpaid' | 'paid' | 'cancelled';
    firebaseId?: string;
}

interface BluetoothConnection {
    connected: boolean;
    deviceName: string;
    peripheralId: string;
    serviceId: string;
    connectedAt: string | null;
}

const { width } = Dimensions.get('window');
const CARD_MARGIN = 3.7;
const CARD_WIDTH = (width - (CARD_MARGIN * 20)) / 4; // 4 columns with margins

export default function LogScreen() {
    const [orders, setOrders] = useState<OrderData[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOnlineMode, setIsOnlineMode] = useState<boolean>(false);
    const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null);
    const [showOrderModal, setShowOrderModal] = useState(false);
    const [filter, setFilter] = useState<'all' | 'paid' | 'cancelled'>('all');
    const [showItemsModal, setShowItemsModal] = useState(false);
    const [allItems, setAllItems] = useState<any[]>([]);
    const [isBluetoothConnected, setIsBluetoothConnected] = useState<boolean>(false);
    const [bluetoothDeviceName, setBluetoothDeviceName] = useState<string>('');
    const [bluetoothConnection, setBluetoothConnection] = useState<BluetoothConnection | null>(null);

    // Initialize Firebase
    const db = getFirestore(app);

    // Check Bluetooth connection status
    useEffect(() => {
        const checkBluetoothConnection = async () => {
            try {
                const syncService = OfflineSyncService.getInstance();
                const bluetoothInfo = await syncService.getItem('bluetoothConnection');

                if (bluetoothInfo) {
                    const connectionData: BluetoothConnection = JSON.parse(bluetoothInfo);
                    setIsBluetoothConnected(connectionData.connected || false);
                    setBluetoothDeviceName(connectionData.deviceName || 'Bluetooth Device');
                    setBluetoothConnection(connectionData);
                } else {
                    setIsBluetoothConnected(false);
                    setBluetoothDeviceName('');
                    setBluetoothConnection(null);
                }
            } catch (error) {
                console.error('Error checking Bluetooth connection:', error);
                setIsBluetoothConnected(false);
                setBluetoothDeviceName('');
                setBluetoothConnection(null);
            }
        };

        checkBluetoothConnection();

        const intervalId = setInterval(checkBluetoothConnection, 3000);

        return () => {
            clearInterval(intervalId);
        };
    }, []);

    const getConnectionMode = async (): Promise<'online' | 'offline'> => {
        try {
            const mode = await NetworkScanner.getApiBaseUrl();
            const isOnline = mode === 'online';
            setIsOnlineMode(isOnline);
            return mode;
        } catch (error) {
            console.log('❌ Error checking connection mode:', error);
            setIsOnlineMode(false);
            return 'offline';
        }
    };

    const getOrderNumberIndicator = (orders: OrderData[], orderId: string) => {
        const index = orders.findIndex(order => order.orderId === orderId);
        return (index + 1).toString().padStart(2, '0');
    };

    const loadOrders = async () => {
        setLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            let allOrders: OrderData[] = [];

            if (connectionMode === 'offline') {
                // Load from local storage - PAID AND CANCELLED ORDERS
                console.log('📱 Loading orders from local storage...');
                const localOrders = await syncService.getPendingReceipts();
                allOrders = localOrders.filter(order => order.status === 'paid' || order.status === 'cancelled');
                console.log('📱 Local orders loaded:', allOrders.length);
            } else {
                // Load from Firebase Firestore - PAID AND CANCELLED ORDERS
                try {
                    console.log('🔥 Loading orders from Firebase...');

                    // Query orders collection where status is 'paid' OR 'cancelled'
                    const ordersCollection = collection(db, 'orders');
                    const ordersQuery = query(
                        ordersCollection,
                        where('status', 'in', ['paid', 'cancelled']), // Both paid and cancelled
                        orderBy('timestamp', 'desc')
                    );

                    const ordersSnapshot = await getDocs(ordersQuery);

                    const firebaseOrders: OrderData[] = ordersSnapshot.docs.map(doc => {
                        const data = doc.data();
                        return {
                            orderId: data.orderId || doc.id,
                            customerName: data.customerName || 'Unknown Customer',
                            items: data.items || [],
                            subtotal: Number(data.subtotal) || 0,
                            total: Number(data.total) || 0,
                            timestamp: data.timestamp || data.created_at || new Date().toISOString(),
                            status: data.status || 'unpaid',
                            firebaseId: doc.id
                        };
                    });

                    allOrders = firebaseOrders;
                    console.log('🔥 Firebase orders loaded:', allOrders.length);

                } catch (firebaseError) {
                    console.log('⚠️ Failed to load from Firebase, falling back to local storage:', firebaseError);

                    // Fallback to local storage - PAID AND CANCELLED ORDERS
                    const localOrders = await syncService.getPendingReceipts();
                    allOrders = localOrders.filter(order => order.status === 'paid' || order.status === 'cancelled');
                    console.log('📱 Fallback to local orders:', allOrders.length);
                }
            }

            // Sort by timestamp (newest first)
            allOrders.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setOrders(allOrders);
            console.log('✅ Final loaded orders:', allOrders.length);

        } catch (error) {
            console.error('❌ Error loading orders:', error);
            // Final fallback - try to get from local storage - PAID AND CANCELLED ORDERS
            try {
                const syncService = OfflineSyncService.getInstance();
                const localOrders = await syncService.getPendingReceipts();
                const filteredOrders = localOrders.filter(order => order.status === 'paid' || order.status === 'cancelled');
                filteredOrders.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                setOrders(filteredOrders);
                console.log('📱 Emergency fallback to local orders:', filteredOrders.length);
            } catch (fallbackError) {
                console.error('❌ Emergency fallback failed:', fallbackError);
                setOrders([]); // Set empty array as final fallback
            }
        } finally {
            setLoading(false);
        }
    };

    // Add delete function for both Firebase and Local - UPDATED
    const deleteAllOrders = async () => {
        Alert.alert(
            'Delete All Orders',
            'Are you sure you want to delete ALL orders from both Firebase and Local Storage? This action cannot be undone.',
            [
                {
                    text: 'Cancel',
                    style: 'cancel'
                },
                {
                    text: 'Delete All',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            const syncService = OfflineSyncService.getInstance();
                            const connectionMode = await getConnectionMode();

                            let firebaseDeletedCount = 0;
                            let localDeletedCount = 0;

                            console.log('🗑️ Starting to delete all orders...');

                            // STEP 1: DELETE FROM FIREBASE IF ONLINE
                            if (connectionMode === 'online') {
                                try {
                                    console.log('🔥 Deleting orders from Firebase...');
                                    const ordersCollection = collection(db, 'orders');
                                    const ordersSnapshot = await getDocs(ordersQuery);

                                    const deletePromises = ordersSnapshot.docs.map(async (document) => {
                                        await deleteDoc(doc(db, 'orders', document.id));
                                        firebaseDeletedCount++;
                                    });

                                    await Promise.all(deletePromises);
                                    console.log(`✅ Successfully deleted ${firebaseDeletedCount} orders from Firebase`);
                                } catch (firebaseError) {
                                    console.error('❌ Error deleting from Firebase:', firebaseError);
                                }
                            }

                            // STEP 2: DELETE FROM LOCAL STORAGE
                            try {
                                console.log('📱 Deleting orders from Local Storage...');

                                // Get current local orders to count them
                                const localOrders = await syncService.getPendingReceipts();
                                localDeletedCount = localOrders.length;

                                // Clear local orders by saving empty array
                                await syncService.setItem('pendingReceipts', JSON.stringify([]));

                                console.log(`✅ Successfully deleted ${localDeletedCount} orders from Local Storage`);
                            } catch (localError) {
                                console.error('❌ Error deleting from Local Storage:', localError);
                            }

                            // STEP 3: SHOW SUCCESS MESSAGE AND RELOAD
                            let successMessage = '';
                            if (connectionMode === 'online') {
                                successMessage = `Deleted ${firebaseDeletedCount} orders from Firebase and ${localDeletedCount} orders from Local Storage.`;
                            } else {
                                successMessage = `Deleted ${localDeletedCount} orders from Local Storage.`;
                            }

                            Alert.alert('Success', successMessage);

                            // Reload the orders list
                            await loadOrders();

                        } catch (error) {
                            console.error('❌ Error deleting orders:', error);
                            Alert.alert('Error', 'Failed to delete orders. Please try again.');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    // Add function to show all items (EXCLUDING CANCELLED ITEMS)
    const showAllItems = () => {
        try {
            // Collect all NON-CANCELLED items from all orders
            const items: any[] = [];

            orders.forEach(order => {
                // Only include items from paid orders and exclude cancelled items
                if (order.status === 'paid') {
                    order.items.forEach(item => {
                        // Only include non-cancelled items
                        if (!item.cancelled) {
                            items.push({
                                ...item,
                                orderId: order.orderId,
                                customerName: order.customerName,
                                timestamp: order.timestamp
                            });
                        }
                    });
                }
            });

            setAllItems(items);
            setShowItemsModal(true);
        } catch (error) {
            console.error('❌ Error preparing items list:', error);
            Alert.alert('Error', 'Failed to load items list');
        }
    };

    // Add function to close items modal
    const closeItemsModal = () => {
        setShowItemsModal(false);
        setAllItems([]);
    };

    // Function to send data to Bluetooth printer (Same as sales-expense.tsx)
    const sendToBluetoothPrinter = async (data: string) => {
        try {
            // Double check Bluetooth connection
            if (!isBluetoothConnected || !bluetoothConnection) {
                throw new Error('Bluetooth is not connected. Please connect to printer first.');
            }

            const syncService = OfflineSyncService.getInstance();
            const bluetoothService = await syncService.getItem('bluetoothService');

            if (!bluetoothService) {
                throw new Error('Bluetooth service not found');
            }

            const serviceData = JSON.parse(bluetoothService);
            const { peripheralId, serviceId, transfer } = serviceData;

            console.log('📡 Printer details:', {
                peripheralId,
                serviceId,
                transfer,
                deviceName: bluetoothDeviceName,
                isConnected: isBluetoothConnected
            });

            // Ensure BleManager is ready
            try {
                await BleManager.checkState();
            } catch {
                await BleManager.start({ showAlert: false });
            }

            // Thermal printer commands
            const initializePrinter = [0x1B, 0x40];
            const textNormal = [0x1B, 0x21, 0x00];
            const centerAlign = [0x1B, 0x61, 0x01];
            const lineFeed = [0x0A];
            const paperCut = [0x1D, 0x56, 0x41, 0x10];

            const textBytes = Array.from(new TextEncoder().encode(data));
            const printData = [
                ...initializePrinter,
                ...centerAlign,
                ...textBytes,
                ...lineFeed, ...lineFeed,
                ...paperCut
            ];

            console.log('🖨️ Sending items data to printer');
            console.log('🔵 Bluetooth Status:', {
                connected: isBluetoothConnected,
                device: bluetoothDeviceName,
                peripheralId: peripheralId
            });

            // Send to printer
            await BleManager.write(
                peripheralId,
                serviceId,
                transfer,
                printData,
                printData.length
            );

            console.log('✅ Items list printed successfully');
            Alert.alert('Print Success', 'Items list printed successfully!');

        } catch (error) {
            console.error('❌ Print error:', error);

            let errorMessage = 'Print failed. ';

            // Proper error type checking
            if (error instanceof Error) {
                errorMessage += error.message;
            } else {
                errorMessage += 'Unknown error occurred.';
            }

            // Additional Bluetooth connection check in error
            if (!isBluetoothConnected) {
                errorMessage += ' Bluetooth connection lost.';
            }

            throw new Error(errorMessage);
        }
    };

    // NEW: Function to print items list using Direct Bluetooth Printing (Same as sales-expense)
    const printItemsList = async () => {
        console.log('🖨️ Starting items list print process...');

        if (!isBluetoothConnected || !bluetoothConnection) {
            Alert.alert('Bluetooth Not Connected', 'Please connect to a Bluetooth printer first in Settings.');
            return;
        }

        try {
            const currentDate = new Date().toLocaleDateString();
            const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const totalAmount = allItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0);
            const totalOrders = new Set(allItems.map(item => item.orderId)).size;

            // Create receipt content
            const receiptContent = `
KAPE SPOT
------------
ALL ORDER ITEMS REPORT
------------
DATE: ${currentDate}
TIME: ${currentTime}
------------
ITEMS LIST:
${allItems.map((item, index) =>
                `${index + 1}. ${item.name}
     Order #${item.orderId?.slice(-4)} • ${item.customerName}
     Qty: ${item.quantity || 1} × ₱${(item.price || 0).toFixed(2)} = ₱${((item.price || 0) * (item.quantity || 1)).toFixed(2)}`
            ).join('\n\n')}
------------
SUMMARY:
Total Items: ${allItems.length}
Total Orders: ${totalOrders}
Grand Total: ₱${totalAmount.toFixed(2)}
------------
Thank you!
        `.trim();

            console.log('🖨️ Preparing to print items list to:', bluetoothDeviceName);
            console.log('📄 Items list content:', receiptContent);

            // Send to Bluetooth printer (same function as sales-expense)
            await sendToBluetoothPrinter(receiptContent);

        } catch (error) {
            console.error('❌ Error printing items list:', error);
            Alert.alert('Print Error', 'Failed to print items list. Please check printer connection.');
        }
    };

    useFocusEffect(
        React.useCallback(() => {
            loadOrders();
        }, [])
    );

    const getFilteredOrders = () => {
        if (filter === 'all') {
            return orders;
        }
        return orders.filter(order => order.status === filter);
    };

    const openOrderModal = (order: OrderData) => {
        setSelectedOrder(order);
        setShowOrderModal(true);
    };

    const closeOrderModal = () => {
        setShowOrderModal(false);
        setSelectedOrder(null);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'paid': return '#16A34A';
            case 'cancelled': return '#DC2626';
            default: return '#D97706';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'paid': return 'check-circle';
            case 'cancelled': return 'x-circle';
            default: return 'clock';
        }
    };

    const formatDateTime = (timestamp: string) => {
        try {
            const date = new Date(timestamp);
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        } catch (error) {
            return timestamp;
        }
    };

    const formatTime = (timestamp: string) => {
        try {
            const date = new Date(timestamp);
            return date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        } catch (error) {
            return timestamp;
        }
    };

    const getFirstItemName = (items: any[]) => {
        const activeItem = items.find(item => !item.cancelled);
        return activeItem ? activeItem.name : 'All items cancelled';
    };

    const getTotalItems = (items: any[]) => {
        return items.reduce((total, item) => total + (item.quantity || 1), 0);
    };

    const getActiveItemsCount = (items: any[]) => {
        return items.filter(item => !item.cancelled).length;
    };

    // Add query for delete function
    const ordersQuery = query(
        collection(db, 'orders'),
        where('status', 'in', ['paid', 'cancelled'])
    );

    return (
        <ThemedView style={styles.container}>
            <Navbar activeNav="log" />

            <ImageBackground
                source={require('@/assets/images/kape1.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <ThemedView style={styles.content}>
                    {/* Header Container */}
                    <ThemedView style={styles.headerContainer}>
                        <ThemedView style={styles.headerSection}>
                            <ThemedView style={styles.headerTop}>
                                <ThemedText style={styles.mainTitle}>Order Log</ThemedText>
                                <ThemedView style={styles.headerButtons}>
                                    <TouchableOpacity
                                        style={styles.reloadButton}
                                        onPress={loadOrders}
                                    >
                                        <Feather name="refresh-cw" size={18} color="#874E3B" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.itemsButton}
                                        onPress={showAllItems}
                                        disabled={loading || orders.length === 0}
                                    >
                                        <Feather name="list" size={18} color="#2563EB" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.deleteButton}
                                        onPress={deleteAllOrders}
                                        disabled={loading}
                                    >
                                        <Feather name="trash-2" size={18} color="#DC2626" />
                                    </TouchableOpacity>
                                </ThemedView>
                            </ThemedView>

                            <ThemedText style={styles.modeInfo}>
                                {isOnlineMode ? '🔥 Connected to Firebase - Showing online data' : '📱 Using local storage - Showing local data'}
                            </ThemedText>

                            {/* Bluetooth Connection Status */}
                            {isBluetoothConnected ? (
                                <ThemedView style={styles.bluetoothStatus}>
                                    <Feather name="bluetooth" size={14} color="#007AFF" />
                                    <ThemedText style={styles.bluetoothStatusText}>
                                        Connected to {bluetoothDeviceName}
                                    </ThemedText>
                                </ThemedView>
                            ) : (
                                <ThemedView style={styles.bluetoothStatusOffline}>
                                    <Feather name="bluetooth" size={14} color="#DC2626" />
                                    <ThemedText style={styles.bluetoothStatusTextOffline}>
                                        Bluetooth printer not connected
                                    </ThemedText>
                                </ThemedView>
                            )}

                            {/* Filter Buttons - PAID AND CANCELLED */}
                            <ThemedView style={styles.filterContainer}>
                                <TouchableOpacity
                                    style={[
                                        styles.filterButton,
                                        filter === 'all' && styles.filterButtonActive
                                    ]}
                                    onPress={() => setFilter('all')}
                                >
                                    <Feather name="layers" size={14} color={filter === 'all' ? '#FFFEEA' : '#874E3B'} />
                                    <Text style={[
                                        styles.filterButtonText,
                                        filter === 'all' && styles.filterButtonTextActive
                                    ]}>
                                        ALL
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.filterButton,
                                        filter === 'paid' && styles.filterButtonActive
                                    ]}
                                    onPress={() => setFilter('paid')}
                                >
                                    <Feather name="check-circle" size={14} color={filter === 'paid' ? '#FFFEEA' : '#874E3B'} />
                                    <Text style={[
                                        styles.filterButtonText,
                                        filter === 'paid' && styles.filterButtonTextActive
                                    ]}>
                                        PAID
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.filterButton,
                                        filter === 'cancelled' && styles.filterButtonActive
                                    ]}
                                    onPress={() => setFilter('cancelled')}
                                >
                                    <Feather name="x-circle" size={14} color={filter === 'cancelled' ? '#FFFEEA' : '#874E3B'} />
                                    <Text style={[
                                        styles.filterButtonText,
                                        filter === 'cancelled' && styles.filterButtonTextActive
                                    ]}>
                                        CANCELLED
                                    </Text>
                                </TouchableOpacity>
                            </ThemedView>

                        </ThemedView>
                    </ThemedView>

                    {/* Orders Grid Container */}
                    <ThemedView style={styles.ordersContainer}>
                        <ScrollView
                            style={styles.scrollView}
                            contentContainerStyle={styles.ordersGrid}
                            showsVerticalScrollIndicator={false}
                        >
                            {loading ? (
                                <ThemedView style={styles.loadingContainer}>
                                    <ThemedText>Loading orders...</ThemedText>
                                </ThemedView>
                            ) : getFilteredOrders().length === 0 ? (
                                <ThemedView style={styles.emptyContainer}>
                                    <Feather name="archive" size={48} color="#D4A574" />
                                    <ThemedText style={styles.emptyText}>No orders found</ThemedText>
                                    <ThemedText style={styles.emptySubtext}>
                                        {filter === 'all'
                                            ? 'No paid or cancelled orders yet'
                                            : `No ${filter} orders found`}
                                    </ThemedText>
                                </ThemedView>
                            ) : (
                                getFilteredOrders().map((order) => (
                                    <TouchableOpacity
                                        key={order.orderId}
                                        style={styles.orderCard}
                                        onPress={() => openOrderModal(order)}
                                    >
                                        {/* Order Header */}
                                        <ThemedView style={styles.orderHeader}>
                                            <ThemedText style={styles.orderId}>
                                                #{getOrderNumberIndicator(getFilteredOrders(), order.orderId)}
                                            </ThemedText>
                                            <ThemedView style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) }]}>
                                                <Feather name={getStatusIcon(order.status)} size={10} color="#FFFEEA" />
                                                <ThemedText style={styles.statusText}>
                                                    {order.status.toUpperCase()}
                                                </ThemedText>
                                            </ThemedView>
                                        </ThemedView>

                                        {/* Customer Name */}
                                        <ThemedText style={styles.customerName} numberOfLines={1}>
                                            {order.customerName}
                                        </ThemedText>

                                        {/* Order Date & Time */}
                                        <ThemedText style={styles.orderDate}>
                                            {formatDateTime(order.timestamp)}
                                        </ThemedText>

                                        {/* Items Summary */}
                                        <ThemedView style={styles.itemDisplay}>
                                            <ThemedText style={styles.mainItem} numberOfLines={2}>
                                                {getFirstItemName(order.items)}
                                            </ThemedText>
                                            {order.status === 'paid' && getActiveItemsCount(order.items) > 1 && (
                                                <ThemedText style={styles.additionalItems}>
                                                    +{getActiveItemsCount(order.items) - 1} more items
                                                </ThemedText>
                                            )}
                                            {order.status === 'cancelled' && (
                                                <ThemedText style={styles.cancelledText}>
                                                    All items cancelled
                                                </ThemedText>
                                            )}
                                            <ThemedText style={styles.totalItems}>
                                                {getActiveItemsCount(order.items)} active items
                                            </ThemedText>
                                        </ThemedView>

                                        {/* Order Total */}
                                        <ThemedView style={styles.totalSection}>
                                            <ThemedText style={styles.totalLabel}>Total:</ThemedText>
                                            <ThemedText style={styles.orderTotal}>
                                                ₱{order.total.toFixed(2)}
                                            </ThemedText>
                                        </ThemedView>

                                        {/* View Button */}
                                        <TouchableOpacity
                                            style={styles.viewButton}
                                            onPress={() => openOrderModal(order)}
                                        >
                                            <ThemedText style={styles.viewButtonText}>
                                                VIEW DETAILS
                                            </ThemedText>
                                        </TouchableOpacity>
                                    </TouchableOpacity>
                                ))
                            )}
                        </ScrollView>
                    </ThemedView>

                    {/* Order Details Modal */}
                    <Modal
                        visible={showOrderModal}
                        animationType="slide"
                        transparent={true}
                        onRequestClose={closeOrderModal}
                    >
                        <ThemedView style={styles.modalOverlay}>
                            <ThemedView style={styles.orderModal}>
                                <ThemedView style={styles.modalHeader}>
                                    <ThemedView style={styles.modalTitleContainer}>
                                        <ThemedText style={styles.modalTitle}>
                                            Order #{selectedOrder?.orderId.slice(-4)}
                                        </ThemedText>
                                        <ThemedText style={styles.modalSubtitle}>
                                            ID: {selectedOrder?.orderId}
                                        </ThemedText>
                                    </ThemedView>
                                    <ThemedView style={styles.modalHeaderRight}>
                                        <ThemedView style={[styles.modalStatusBadge, { backgroundColor: getStatusColor(selectedOrder?.status || '') }]}>
                                            <Feather name={getStatusIcon(selectedOrder?.status || '')} size={14} color="#FFFEEA" />
                                            <ThemedText style={styles.modalStatusText}>
                                                {selectedOrder?.status.toUpperCase()}
                                            </ThemedText>
                                        </ThemedView>
                                        <TouchableOpacity onPress={closeOrderModal}>
                                            <Feather name="x" size={24} color="#874E3B" />
                                        </TouchableOpacity>
                                    </ThemedView>
                                </ThemedView>

                                <ThemedView style={styles.modalContent}>
                                    <ThemedView style={styles.customerSection}>
                                        <ThemedText style={styles.customerLabel}>Customer:</ThemedText>
                                        <ThemedText style={styles.customerInfo}>
                                            {selectedOrder?.customerName}
                                        </ThemedText>
                                    </ThemedView>

                                    <ThemedView style={styles.timeSection}>
                                        <ThemedText style={styles.timeLabel}>Date & Time:</ThemedText>
                                        <ThemedText style={styles.timeInfo}>
                                            {selectedOrder ? formatDateTime(selectedOrder.timestamp) : ''}
                                        </ThemedText>
                                    </ThemedView>

                                    <ThemedView style={styles.itemsSection}>
                                        <ThemedText style={styles.itemsLabel}>Order Items:</ThemedText>
                                        <ScrollView
                                            style={styles.itemsScrollView}
                                            showsVerticalScrollIndicator={true}
                                        >
                                            {selectedOrder?.items.map((item, index) => (
                                                <ThemedView key={index} style={styles.itemRow}>
                                                    <ThemedView style={styles.itemInfo}>
                                                        <ThemedText style={[
                                                            styles.itemName,
                                                            item.cancelled && styles.itemCancelled
                                                        ]}>
                                                            {item.name}
                                                        </ThemedText>
                                                        <ThemedText style={[
                                                            styles.itemPrice,
                                                            item.cancelled && styles.itemCancelled
                                                        ]}>
                                                            ₱{item.price ? item.price.toFixed(2) : '0.00'}
                                                            {item.cancelled && ' (Cancelled)'}
                                                        </ThemedText>
                                                    </ThemedView>
                                                    <ThemedView style={styles.quantitySection}>
                                                        <ThemedText style={[
                                                            styles.itemQuantity,
                                                            item.cancelled && styles.itemCancelled
                                                        ]}>
                                                            x{item.quantity}
                                                        </ThemedText>
                                                        <ThemedText style={[
                                                            styles.itemTotal,
                                                            item.cancelled && styles.itemCancelled
                                                        ]}>
                                                            ₱{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                                                        </ThemedText>
                                                    </ThemedView>
                                                </ThemedView>
                                            ))}
                                        </ScrollView>
                                    </ThemedView>

                                    <ThemedView style={styles.totalSectionModal}>
                                        <ThemedView style={styles.subtotalSection}>
                                            <ThemedText style={styles.subtotalLabel}>Subtotal:</ThemedText>
                                            <ThemedText style={styles.subtotalAmount}>
                                                ₱{selectedOrder?.subtotal.toFixed(2)}
                                            </ThemedText>
                                        </ThemedView>
                                        <ThemedView style={styles.finalTotalSection}>
                                            <ThemedText style={styles.totalLabelModal}>Total Amount:</ThemedText>
                                            <ThemedText style={styles.totalAmount}>
                                                ₱{selectedOrder?.total.toFixed(2)}
                                            </ThemedText>
                                        </ThemedView>
                                    </ThemedView>
                                </ThemedView>
                            </ThemedView>
                        </ThemedView>
                    </Modal>

                    {/* All Items List Modal (EXCLUDES CANCELLED ITEMS) - UPDATED WITH PRINTER VIEW */}
                    <Modal
                        visible={showItemsModal}
                        animationType="slide"
                        transparent={true}
                        onRequestClose={closeItemsModal}
                    >
                        <ThemedView style={styles.modalOverlay}>
                            <ThemedView style={styles.itemsModal}>
                                <ThemedView style={styles.modalHeader}>
                                    <ThemedView style={styles.modalHeaderLeft}>
                                        <ThemedText style={styles.modalTitle}>
                                            All Order Items
                                        </ThemedText>
                                        <ThemedText style={styles.itemsCount}>
                                            {allItems.length} active items total (cancelled items excluded)
                                        </ThemedText>
                                    </ThemedView>
                                    <ThemedView style={styles.modalHeaderRight}>
                                        {/* Printer Button - Same as sales-expense */}
                                        <TouchableOpacity
                                            style={[
                                                styles.printerButton,
                                                !isBluetoothConnected && styles.printerButtonDisabled
                                            ]}
                                            onPress={printItemsList}
                                            disabled={!isBluetoothConnected || allItems.length === 0}
                                        >
                                            <Feather
                                                name="printer"
                                                size={18}
                                                color={isBluetoothConnected && allItems.length > 0 ? "#874E3B" : "#C4A484"}
                                            />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={closeItemsModal} style={styles.closeButton}>
                                            <Feather name="x" size={24} color="#874E3B" />
                                        </TouchableOpacity>
                                    </ThemedView>
                                </ThemedView>

                                {/* Bluetooth Status in Modal */}
                                {isBluetoothConnected ? (
                                    <ThemedView style={styles.bluetoothStatusModal}>
                                        <Feather name="bluetooth" size={12} color="#007AFF" />
                                        <ThemedText style={styles.bluetoothStatusTextModal}>
                                            Connected to {bluetoothDeviceName}
                                        </ThemedText>
                                    </ThemedView>
                                ) : (
                                    <ThemedView style={styles.bluetoothStatusOfflineModal}>
                                        <Feather name="bluetooth" size={12} color="#DC2626" />
                                        <ThemedText style={styles.bluetoothStatusTextOfflineModal}>
                                            Bluetooth printer not connected
                                        </ThemedText>
                                    </ThemedView>
                                )}

                                <ScrollView style={styles.itemsList}>
                                    {allItems.map((item, index) => (
                                        <ThemedView key={index} style={styles.itemRowModal}>
                                            <ThemedView style={styles.itemNameSection}>
                                                <ThemedText style={styles.itemNameModal} numberOfLines={2}>
                                                    {item.name}
                                                </ThemedText>
                                                <ThemedText style={styles.itemOrderInfo}>
                                                    Order #{item.orderId?.slice(-4)} • {item.customerName}
                                                </ThemedText>
                                            </ThemedView>

                                            <ThemedView style={styles.itemPriceSection}>
                                                <ThemedText style={styles.itemQuantityModal}>
                                                    x{item.quantity || 1}
                                                </ThemedText>
                                                <ThemedText style={styles.itemPriceModal}>
                                                    ₱{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                                                </ThemedText>
                                            </ThemedView>
                                        </ThemedView>
                                    ))}
                                </ScrollView>

                                <ThemedView style={styles.itemsFooter}>
                                    <ThemedText style={styles.itemsTotal}>
                                        Total: ₱{allItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0).toFixed(2)}
                                    </ThemedText>
                                    <ThemedText style={styles.itemsCountFooter}>
                                        {allItems.length} items • {new Set(allItems.map(item => item.orderId)).size} orders
                                    </ThemedText>
                                </ThemedView>
                            </ThemedView>
                        </ThemedView>
                    </Modal>
                </ThemedView>
            </ImageBackground>
        </ThemedView>
    );
}

// Updated styles to include new buttons and modals
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFEEA',
    },
    backgroundImage: {
        flex: 1,
    },
    content: {
        flex: 1,
        padding: 16,
        backgroundColor: 'transparent',
    },
    headerContainer: {
        marginBottom: 16,
        backgroundColor: 'fffecaF2'
    },
    headerSection: {
        backgroundColor: "#fffecaF2",
        borderRadius: 12,
        padding: 5,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'fffecaF2'
    },
    headerButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    mainTitle: {
        fontSize: 28,
        color: '#874E3B',
        fontFamily: 'LobsterTwoItalic',
        lineHeight: 50
    },
    subtitle: {
        fontSize: 12,
        color: '#874E3B',
        marginTop: 4,
        fontStyle: 'italic',
    },
    modeInfo: {
        fontSize: 12,
        color: '#874E3B',
        fontStyle: 'italic',
        marginTop: 4,
    },
    // Bluetooth Status Styles
    bluetoothStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E3F2FD',
        padding: 8,
        borderRadius: 6,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#007AFF',
    },
    bluetoothStatusOffline: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF2F2',
        padding: 8,
        borderRadius: 6,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#DC2626',
    },
    bluetoothStatusText: {
        fontSize: 12,
        color: '#007AFF',
        marginLeft: 8,
        fontWeight: '500',
    },
    bluetoothStatusTextOffline: {
        fontSize: 12,
        color: '#DC2626',
        marginLeft: 8,
        fontWeight: '500',
    },
    // Modal Bluetooth Status
    bluetoothStatusModal: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E3F2FD',
        padding: 6,
        borderRadius: 4,
        marginHorizontal: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#007AFF',
    },
    bluetoothStatusOfflineModal: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF2F2',
        padding: 6,
        borderRadius: 4,
        marginHorizontal: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#DC2626',
    },
    bluetoothStatusTextModal: {
        fontSize: 10,
        color: '#007AFF',
        marginLeft: 6,
        fontWeight: '500',
    },
    bluetoothStatusTextOfflineModal: {
        fontSize: 10,
        color: '#DC2626',
        marginLeft: 6,
        fontWeight: '500',
    },
    // Printer Button Styles
    printerButton: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    printerButtonDisabled: {
        backgroundColor: '#F5E6D3',
        borderColor: '#C4A484',
    },
    filterContainer: {
        flexDirection: 'row',
        marginTop: 12,
        gap: 8,
        backgroundColor: 'fffecaF2'
    },
    filterButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: '#F5E6D3',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    filterButtonActive: {
        backgroundColor: '#874E3B',
        borderColor: '#874E3B',
    },
    filterButtonText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    filterButtonTextActive: {
        color: '#FFFEEA',
    },
    reloadButton: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    itemsButton: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: '#DBEAFE',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    deleteButton: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#FECACA',
    },
    ordersContainer: {
        flex: 1,
        backgroundColor: "#fffecaF2",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#D4A574',
        padding: 12,
    },
    scrollView: {
        flex: 1,
    },
    ordersGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
    },
    orderCard: {
        width: CARD_WIDTH,
        height: CARD_WIDTH, // Square aspect ratio
        backgroundColor: "#FFFEEA",
        borderRadius: 12,
        padding: 10,
        borderWidth: 2,
        borderColor: '#D4A574',
        margin: CARD_MARGIN / 2,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
        justifyContent: 'space-between',
    },
    orderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 6,
    },
    orderId: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#874E3B',
        fontFamily: 'LobsterTwoRegular',
        flex: 1,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        marginLeft: 4,
    },
    statusText: {
        color: '#FFFEEA',
        fontSize: 8,
        fontWeight: 'bold',
    },
    customerName: {
        fontSize: 10,
        fontWeight: '600',
        color: '#5A3921',
        marginBottom: 2,
    },
    orderDate: {
        fontSize: 8,
        color: '#8B7355',
        marginBottom: 6,
        fontStyle: 'italic',
    },
    itemDisplay: {
        flex: 1,
        justifyContent: 'center',
        marginBottom: 6,
    },
    mainItem: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#874E3B',
        marginBottom: 2,
        lineHeight: 12,
        textAlign: 'center',
    },
    additionalItems: {
        fontSize: 8,
        color: '#8B7355',
        fontStyle: 'italic',
        textAlign: 'center',
        marginBottom: 2,
    },
    cancelledText: {
        fontSize: 8,
        color: '#DC2626',
        fontStyle: 'italic',
        textAlign: 'center',
        marginBottom: 2,
    },
    totalItems: {
        fontSize: 8,
        color: '#5A3921',
        fontWeight: '600',
        textAlign: 'center',
    },
    totalSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
        paddingTop: 4,
        borderTopWidth: 1,
        borderTopColor: '#E8D8C8',
    },
    totalLabel: {
        fontSize: 8,
        color: '#5A3921',
        fontWeight: '600',
    },
    orderTotal: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    viewButton: {
        backgroundColor: '#874E3B',
        paddingVertical: 4,
        borderRadius: 6,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#6B3E2D',
    },
    viewButtonText: {
        color: '#FFFEEA',
        fontSize: 8,
        fontWeight: 'bold',
    },
    loadingContainer: {
        padding: 20,
        alignItems: 'center',
        width: '100%',
        backgroundColor: '#fffecaF2'
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
        width: '100%',
    },
    emptyText: {
        fontSize: 16,
        color: '#874E3B',
        marginTop: 12,
    },
    emptySubtext: {
        fontSize: 12,
        color: '#8B7355',
        marginTop: 4,
        textAlign: 'center',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: 20,
        backgroundColor: '#F5E6D3',
        borderBottomWidth: 1,
        borderBottomColor: '#D4A574',
    },
    modalHeaderLeft: {
        flex: 1,
    },
    modalHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    modalTitleContainer: {
        flex: 1,
    },
    modalStatusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    modalStatusText: {
        color: '#FFFEEA',
        fontSize: 10,
        fontWeight: 'bold',
    },
    orderModal: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#FFFEEA',
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#D4A574',
        overflow: 'hidden',
        maxHeight: '90%',
        height: 'auto',
    },

    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#874E3B',
        fontFamily: 'LobsterTwoRegular',
        marginBottom: 4,
    },

    modalContent: {
        padding: 20,
    },
    customerSection: {
        marginBottom: 16,
    },
    customerLabel: {
        fontSize: 14,
        color: '#8B7355',
        marginBottom: 4,
    },
    customerInfo: {
        fontSize: 16,
        fontWeight: '600',
        color: '#5A3921',
    },
    timeSection: {
        marginBottom: 20,
    },
    timeLabel: {
        fontSize: 14,
        color: '#8B7355',
        marginBottom: 4,
    },
    timeInfo: {
        fontSize: 16,
        fontWeight: '600',
        color: '#5A3921',
    },
    itemsSection: {
        marginBottom: 20,
    },
    modalSubtitle: {
        fontSize: 12,
        color: '#8B7355',
        marginTop: 2,
    },
    itemsLabel: {
        fontSize: 14,
        color: '#8B7355',
        marginBottom: 8,
    },
    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#E8D8C8',
    },
    itemInfo: {
        flex: 1,
    },
    itemName: {
        fontSize: 14,
        color: '#5A3921',
        marginBottom: 2,
    },
    itemPrice: {
        fontSize: 12,
        color: '#8B7355',
    },
    itemCancelled: {
        textDecorationLine: 'line-through',
        color: '#DC2626',
        fontStyle: 'italic',
    },
    quantitySection: {
        alignItems: 'flex-end',
    },
    itemQuantity: {
        fontSize: 14,
        fontWeight: '600',
        color: '#874E3B',
        marginBottom: 2,
    },
    itemTotal: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#5A3921',
    },
    totalSectionModal: {
        borderTopWidth: 2,
        borderTopColor: '#D4A574',
        paddingTop: 16,
    },
    subtotalSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    subtotalLabel: {
        fontSize: 14,
        color: '#5A3921',
    },
    subtotalAmount: {
        fontSize: 16,
        fontWeight: '600',
        color: '#5A3921',
    },
    finalTotalSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#E8D8C8',
    },
    totalLabelModal: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#5A3921',
    },
    itemsScrollView: {
        maxHeight: 200,
        minHeight: 100,
    },

    totalAmount: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    // Updated styles for items list modal - WITH PRINTER VIEW
    itemsModal: {
        width: '95%',
        height: '85%',
        backgroundColor: '#FFFEEA',
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#D4A574',
        overflow: 'hidden',
    },
    itemsList: {
        flex: 1,
        padding: 16,
        maxHeight: '80%',
    },
    itemRowModal: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E8D8C8',
        minHeight: 60,
    },
    itemNameSection: {
        flex: 1,
        marginRight: 12,
    },
    itemNameModal: {
        fontSize: 18,
        fontWeight: '600',
        color: '#5A3921',
        marginBottom: 4,
        flex: 1,
    },
    itemOrderInfo: {
        fontSize: 12,
        color: '#8B7355',
        fontStyle: 'italic',
    },
    itemPriceSection: {
        alignItems: 'flex-end',
        minWidth: 80,
    },
    itemQuantityModal: {
        fontSize: 16,
        color: '#874E3B',
        marginBottom: 4,
    },
    itemPriceModal: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#5A3921',
    },
    itemsFooter: {
        padding: 20,
        borderTopWidth: 2,
        borderTopColor: '#D4A574',
        backgroundColor: '#F5E6D3',
    },
    itemsTotal: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#874E3B',
        textAlign: 'center',
    },
    itemsCount: {
        fontSize: 14,
        color: '#8B7355',
        marginTop: 4,
    },
    itemsCountFooter: {
        fontSize: 14,
        color: '#8B7355',
        textAlign: 'center',
        marginTop: 4,
    },
    closeButton: {
        padding: 4,
    },
});