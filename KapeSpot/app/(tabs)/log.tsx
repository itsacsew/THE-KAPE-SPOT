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
    doc,
    onSnapshot
} from 'firebase/firestore';
import { app } from '@/lib/firebase-config';
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
    allItemsReady?: boolean;
    created_at?: string;
    cups_used?: number;
    order_type?: string;
    updated_at?: string;
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
    const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid' | 'cancelled'>('all');
    const [showItemsModal, setShowItemsModal] = useState(false);
    const [allItems, setAllItems] = useState<any[]>([]);
    const [isBluetoothConnected, setIsBluetoothConnected] = useState<boolean>(false);
    const [bluetoothDeviceName, setBluetoothDeviceName] = useState<string>('');
    const [bluetoothConnection, setBluetoothConnection] = useState<BluetoothConnection | null>(null);
    const [isPrinting, setIsPrinting] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<string>('');
    const [hasFirebaseData, setHasFirebaseData] = useState<boolean>(false);
    const [checkingFirebase, setCheckingFirebase] = useState<boolean>(false);

    // Initialize Firebase
    const db = getFirestore(app);

    // IMPROVED: Real-time Firebase listener for ALL orders (unpaid, paid, cancelled)
    // Sa real-time listener
    useEffect(() => {
        const setupRealTimeListener = async () => {
            try {
                const connectionMode = await getConnectionMode();

                if (connectionMode === 'online') {
                    console.log('👂 Setting up real-time Firebase listener for ALL orders...');

                    const ordersCollection = collection(db, 'orders');
                    const ordersQuery = query(
                        ordersCollection,
                        orderBy('updated_at', 'desc')
                    );

                    console.log('📡 Real-time listener query created');

                    // Real-time listener
                    const unsubscribe = onSnapshot(ordersQuery,
                        (snapshot) => {
                            console.log('🔄 Real-time update received from Firebase');
                            console.log('📊 Number of orders in snapshot:', snapshot.size);

                            const firebaseOrders: OrderData[] = [];

                            snapshot.forEach((doc) => {
                                const docData = doc.data();
                                console.log(`📋 Processing order: ${docData.orderId}`, {
                                    status: docData.status,
                                    customerName: docData.customerName
                                });

                                const order: OrderData = {
                                    orderId: docData.orderId || doc.id,
                                    customerName: docData.customerName || 'Unknown Customer',
                                    items: docData.items || [],
                                    subtotal: Number(docData.subtotal) || 0,
                                    total: Number(docData.total) || 0,
                                    timestamp: docData.timestamp || docData.created_at || new Date().toISOString(),
                                    status: docData.status || 'unpaid',
                                    firebaseId: doc.id,
                                    allItemsReady: docData.allItemsReady || false,
                                    created_at: docData.created_at,
                                    cups_used: docData.cups_used,
                                    order_type: docData.order_type,
                                    updated_at: docData.updated_at
                                };

                                firebaseOrders.push(order);
                            });

                            console.log('✅ Processed orders count:', firebaseOrders.length);

                            // FIXED: Sort by timestamp with proper undefined handling
                            firebaseOrders.sort((a, b) => {
                                const timeA = a.updated_at || a.timestamp || a.created_at || new Date().toISOString();
                                const timeB = b.updated_at || b.timestamp || b.created_at || new Date().toISOString();
                                return new Date(timeB).getTime() - new Date(timeA).getTime();
                            });

                            // Check if there's data in Firebase
                            const hasData = firebaseOrders.length > 0;
                            setHasFirebaseData(hasData);
                            console.log('📦 Firebase has data:', hasData);

                            // Update state with new data
                            setOrders(firebaseOrders);
                            setLastUpdate(new Date().toLocaleTimeString());
                            console.log('🎯 Orders state updated with:', firebaseOrders.length, 'orders');
                        },
                        (error) => {
                            console.error('💥 Real-time listener error:', error);
                            // Fallback to manual load if real-time fails
                            loadOrders();
                        }
                    );

                    console.log('✅ Real-time listener setup complete');

                    // Cleanup listener on unmount
                    return () => {
                        console.log('🧹 Cleaning up real-time listener');
                        unsubscribe();
                    };
                }
            } catch (error) {
                console.log('💥 Real-time listener setup error:', error);
                // Fallback to manual load
                loadOrders();
            }
        };

        setupRealTimeListener();
    }, []);


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

    // IMPROVED: Load orders with better error handling - NOW INCLUDES ALL STATUSES
    const loadOrders = async () => {
        console.log('🚀 Starting loadOrders...');
        setLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();
            console.log('📡 Connection mode:', connectionMode);

            let allOrders: OrderData[] = [];

            if (connectionMode === 'offline') {
                // Load from local storage - ALL ORDERS (unpaid, paid, cancelled)
                console.log('📱 Loading ALL orders from local storage...');
                const localOrders = await syncService.getPendingReceipts();
                allOrders = localOrders; // Include all statuses
                console.log('📱 Local orders loaded:', allOrders.length);

                // FIXED: Sort by timestamp using only common fields
                allOrders.sort((a, b) => {
                    const timeA = a.timestamp || new Date().toISOString();
                    const timeB = b.timestamp || new Date().toISOString();
                    return new Date(timeB).getTime() - new Date(timeA).getTime();
                });
                setOrders(allOrders);
                setLastUpdate(new Date().toLocaleTimeString());

            } else {
                // Online mode - manual refresh as backup to real-time listener
                console.log('🔥 Online mode - Manual refresh as backup...');

                try {
                    const ordersCollection = collection(db, 'orders');
                    const ordersQuery = query(
                        ordersCollection,
                        orderBy('updated_at', 'desc')
                    );
                    console.log('📡 Executing manual Firebase query...');
                    const ordersSnapshot = await getDocs(ordersQuery);
                    console.log('✅ Manual query completed, documents:', ordersSnapshot.size);

                    const firebaseOrders: OrderData[] = ordersSnapshot.docs.map(doc => {
                        const data = doc.data();
                        console.log('📋 Loading order:', data.orderId);

                        return {
                            orderId: data.orderId || doc.id,
                            customerName: data.customerName || 'Unknown Customer',
                            items: data.items || [],
                            subtotal: Number(data.subtotal) || 0,
                            total: Number(data.total) || 0,
                            timestamp: data.timestamp || data.created_at || new Date().toISOString(),
                            status: data.status || 'unpaid',
                            firebaseId: doc.id,
                            allItemsReady: data.allItemsReady || false,
                            created_at: data.created_at,
                            cups_used: data.cups_used,
                            order_type: data.order_type,
                            updated_at: data.updated_at
                        };
                    });

                    allOrders = firebaseOrders;

                    // Check if there's data in Firebase
                    setHasFirebaseData(firebaseOrders.length > 0);

                    // FIXED: Sort by timestamp using only common fields
                    allOrders.sort((a, b) => {
                        const timeA = a.timestamp || new Date().toISOString();
                        const timeB = b.timestamp || new Date().toISOString();
                        return new Date(timeB).getTime() - new Date(timeA).getTime();
                    });

                    setOrders(allOrders);
                    setLastUpdate(new Date().toLocaleTimeString());
                    console.log('🔥 Manual refresh completed:', allOrders.length);

                } catch (firebaseError) {
                    console.log('⚠️ Manual refresh failed, falling back to local storage:', firebaseError);

                    // Fallback to local storage
                    const localOrders = await syncService.getPendingReceipts();
                    allOrders = localOrders; // Include all statuses

                    // FIXED: Sort by timestamp using only common fields
                    allOrders.sort((a, b) => {
                        const timeA = a.timestamp || new Date().toISOString();
                        const timeB = b.timestamp || new Date().toISOString();
                        return new Date(timeB).getTime() - new Date(timeA).getTime();
                    });

                    setOrders(allOrders);
                    setLastUpdate(new Date().toLocaleTimeString());
                    console.log('📱 Fallback to local orders:', allOrders.length);
                }
            }

        } catch (error) {
            console.error('❌ Error loading orders:', error);
            // Final fallback - try to get from local storage - ALL ORDERS
            try {
                const syncService = OfflineSyncService.getInstance();
                const localOrders = await syncService.getPendingReceipts();
                const filteredOrders = localOrders; // Include all statuses

                // FIXED: Sort by timestamp using only common fields
                filteredOrders.sort((a, b) => {
                    const timeA = a.timestamp || new Date().toISOString();
                    const timeB = b.timestamp || new Date().toISOString();
                    return new Date(timeB).getTime() - new Date(timeA).getTime();
                });

                setOrders(filteredOrders);
                setLastUpdate(new Date().toLocaleTimeString());
                console.log('📱 Emergency fallback to local orders:', filteredOrders.length);
            } catch (fallbackError) {
                console.error('❌ Emergency fallback failed:', fallbackError);
                setOrders([]); // Set empty array as final fallback
            }
        } finally {
            setLoading(false);
        }
    };
    // Check if Firebase has data on component mount
    // Check if Firebase has data on component mount
    const checkFirebaseData = async () => {
        try {
            const connectionMode = await getConnectionMode();

            if (connectionMode === 'online') {
                console.log('🔍 Starting Firebase data check...');
                setCheckingFirebase(true);

                const ordersCollection = collection(db, 'orders');
                console.log('📡 Querying Firebase orders collection...');

                const snapshot = await getDocs(ordersCollection);
                const hasData = !snapshot.empty;

                console.log('✅ Firebase query completed');
                console.log('📊 Snapshot size:', snapshot.size);
                console.log('📦 Has data:', hasData);

                setHasFirebaseData(hasData);

                if (hasData) {
                    console.log('🎉 Firebase has orders! Listing all orders:');
                    snapshot.forEach((doc) => {
                        const data = doc.data();
                        console.log('📋 Order found:', {
                            id: doc.id,
                            orderId: data.orderId,
                            status: data.status,
                            customerName: data.customerName,
                            total: data.total,
                            timestamp: data.timestamp
                        });
                    });
                } else {
                    console.log('❌ No orders found in Firebase');
                }
            } else {
                console.log('📱 Offline mode - skipping Firebase check');
            }
        } catch (error) {
            console.log('💥 Error checking Firebase data:', error);
            setHasFirebaseData(false);
        } finally {
            console.log('🏁 Finished Firebase data check');
            setCheckingFirebase(false);
        }
    };

    useFocusEffect(
        React.useCallback(() => {
            loadOrders();
            checkFirebaseData();
        }, [])
    );
    // Rest of the functions remain the same but updated to handle all statuses
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
                                    const ordersSnapshot = await getDocs(ordersCollection);

                                    const deletePromises = ordersSnapshot.docs.map(async (document) => {
                                        await deleteDoc(doc(db, 'orders', document.id));
                                        firebaseDeletedCount++;
                                    });

                                    await Promise.all(deletePromises);
                                    console.log(`✅ Successfully deleted ${firebaseDeletedCount} orders from Firebase`);
                                    setHasFirebaseData(false);
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

    const showAllItems = () => {
        try {
            // Collect all items from all orders (including unpaid)
            const items: any[] = [];

            orders.forEach(order => {
                // Include items from all order statuses
                order.items.forEach(item => {
                    // Only include non-cancelled items
                    if (!item.cancelled) {
                        items.push({
                            ...item,
                            orderId: order.orderId,
                            customerName: order.customerName,
                            timestamp: order.timestamp,
                            status: order.status
                        });
                    }
                });
            });

            setAllItems(items);
            setShowItemsModal(true);
        } catch (error) {
            console.error('❌ Error preparing items list:', error);
            Alert.alert('Error', 'Failed to load items list');
        }
    };

    const closeItemsModal = () => {
        setShowItemsModal(false);
        setAllItems([]);
    };

    // Print functions remain the same...
    const sendToBluetoothPrinter = async (data: Uint8Array) => {
        // ... existing print implementation
    };

    const printItemsList = async () => {
        // ... existing print implementation
    };

    useFocusEffect(
        React.useCallback(() => {
            loadOrders();
            checkFirebaseData();
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
            case 'unpaid': return '#D97706';
            default: return '#D97706';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'paid': return 'check-circle';
            case 'cancelled': return 'x-circle';
            case 'unpaid': return 'clock';
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

    const getFirstItemName = (items: any[]) => {
        const activeItem = items.find(item => !item.cancelled);
        return activeItem ? activeItem.name : 'All items cancelled';
    };

    const getActiveItemsCount = (items: any[]) => {
        return items.filter(item => !item.cancelled).length;
    };

    // Render UI with updated filter buttons
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
                                {isOnlineMode ? '🔥 Connected to Firebase - Real-time updates active' : '📱 Using local storage - Showing local data'}      {lastUpdate && (
                                    <ThemedText style={styles.lastUpdateText}>
                                        Last update: {lastUpdate}
                                    </ThemedText>
                                )}
                            </ThemedText>


                            {/* Last Update Time */}


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

                            {/* Filter Buttons - ALL STATUSES */}
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
                                        filter === 'unpaid' && styles.filterButtonActive
                                    ]}
                                    onPress={() => setFilter('unpaid')}
                                >
                                    <Feather name="clock" size={14} color={filter === 'unpaid' ? '#FFFEEA' : '#874E3B'} />
                                    <Text style={[
                                        styles.filterButtonText,
                                        filter === 'unpaid' && styles.filterButtonTextActive
                                    ]}>
                                        UNPAID
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
                                            ? 'No orders yet'
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
                                            {getActiveItemsCount(order.items) > 1 && (
                                                <ThemedText style={styles.additionalItems}>
                                                    +{getActiveItemsCount(order.items) - 1} more items
                                                </ThemedText>
                                            )}
                                            {getActiveItemsCount(order.items) === 0 && (
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

                    {/* All Items List Modal */}
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
                                        <TouchableOpacity onPress={closeItemsModal} style={styles.closeButton}>
                                            <Feather name="x" size={24} color="#874E3B" />
                                        </TouchableOpacity>
                                    </ThemedView>
                                </ThemedView>

                                <ScrollView style={styles.itemsList}>
                                    {allItems.map((item, index) => (
                                        <ThemedView key={index} style={styles.itemRowModal}>
                                            <ThemedView style={styles.itemNameSection}>
                                                <ThemedText style={styles.itemNameModal} numberOfLines={2}>
                                                    {item.name}
                                                </ThemedText>
                                                <ThemedText style={styles.itemOrderInfo}>
                                                    Order #{item.orderId?.slice(-4)} • {item.customerName} • {item.status?.toUpperCase()}
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
// Styles remain the same...
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
        backgroundColor: '#fffecaF2'
    },
    headerSection: {
        backgroundColor: "#fffecaF2",
        borderRadius: 12,
        padding: 5,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    firebaseDataStatus: {
        fontSize: 12,
        color: '#16A34A',
        fontWeight: '600',
        marginTop: 4,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#fffecaF2'
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
    modeInfo: {
        fontSize: 12,
        color: '#874E3B',
        fontStyle: 'italic',
        marginTop: 4,
    },
    lastUpdateText: {
        fontSize: 11,
        color: '#8B7355',
        fontStyle: 'italic',
        marginTop: 2,
        fontWeight: 'bold'
    },
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
    filterContainer: {
        flexDirection: 'row',
        marginTop: 12,
        gap: 8,
        backgroundColor: '#fffecaF2'
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
        height: CARD_WIDTH,
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
    // Sa styles, idugang niini:
    checkingFirebaseContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEF3C7',
        padding: 8,
        borderRadius: 6,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#D97706',
    },
    checkingFirebaseText: {
        fontSize: 12,
        color: '#92400E',
        marginLeft: 8,
        fontWeight: '500',
    },
    firebaseDataExists: {
        fontSize: 12,
        color: '#16A34A',
        fontWeight: '600',
        marginTop: 4,
    },
    firebaseDataEmpty: {
        fontSize: 12,
        color: '#DC2626',
        fontWeight: '600',
        marginTop: 4,
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