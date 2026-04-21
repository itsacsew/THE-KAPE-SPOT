// app/(tabs)/orderStatus.tsx
import { useState, useEffect } from 'react';
import {
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ImageBackground,
    Alert,
    Modal,
    Dimensions,
    Text,
    ActivityIndicator,
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
    updateDoc,
    doc,
    query,
    where,
    orderBy,
    onSnapshot
} from 'firebase/firestore';
import { app } from '@/lib/firebase-config';

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
    orderType?: 'dine-in' | 'take-out';
    cupsUsed?: number;
    allItemsReady?: boolean;
    notes?: string; // ADDED: notes/comment field
}

const { width } = Dimensions.get('window');
// Calculate card width for 2 columns with consistent spacing
const CARD_MARGIN = 12;
const CARD_WIDTH = (width - (CARD_MARGIN * 3)) / 2; // 2 columns: (screenWidth - (margin*3)) / 2

export const getOrderNumberIndicator = (orders: OrderData[], orderId: string) => {
    const index = orders.findIndex(order => order.orderId === orderId);
    return (index + 1).toString().padStart(2, '0');
};

export default function OrderStatusScreen() {
    const [orders, setOrders] = useState<OrderData[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOnlineMode, setIsOnlineMode] = useState<boolean>(false);
    const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null);
    const [showActionModal, setShowActionModal] = useState(false);
    const [selectedOrderType, setSelectedOrderType] = useState<'all' | 'dine-in' | 'take-out'>('all');
    const [isProcessing, setIsProcessing] = useState(false);
    const [unsubscribe, setUnsubscribe] = useState<(() => void) | null>(null);
    const [hasFirebaseData, setHasFirebaseData] = useState<boolean>(false);
    const [checkingFirebase, setCheckingFirebase] = useState<boolean>(false);
    const [lastUpdate, setLastUpdate] = useState<string>('');

    const db = getFirestore(app);

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

    // Setup realtime listener for Firebase
    const setupRealtimeListener = () => {
        try {
            console.log('🔥 Setting up realtime listener for ALL orders from Firebase...');

            const ordersCollection = collection(db, 'orders');
            const ordersQuery = query(
                ordersCollection,
                orderBy('timestamp', 'desc')
            );

            const unsubscribeListener = onSnapshot(ordersQuery,
                (snapshot) => {
                    console.log('🔄 Realtime update received from Firebase');

                    const firebaseOrders: OrderData[] = [];

                    snapshot.forEach((doc) => {
                        const data = doc.data();
                        console.log(`📊 Processing order:`, {
                            orderId: data.orderId,
                            status: data.status,
                            customerName: data.customerName
                        });

                        const order: OrderData = {
                            orderId: data.orderId || doc.id,
                            customerName: data.customerName || 'Unknown Customer',
                            items: data.items || [],
                            subtotal: Number(data.subtotal) || 0,
                            total: Number(data.total) || 0,
                            timestamp: data.timestamp || data.created_at || new Date().toISOString(),
                            status: data.status || 'unpaid',
                            firebaseId: doc.id,
                            orderType: data.order_type || data.orderType || 'dine-in',
                            cupsUsed: data.cups_used || data.cupsUsed || 0,
                            allItemsReady: data.allItemsReady || false,
                            notes: data.notes || '' // ADDED: get notes from Firebase
                        };

                        firebaseOrders.push(order);
                    });

                    const hasData = firebaseOrders.length > 0;
                    setHasFirebaseData(hasData);

                    const unpaidOrders = firebaseOrders.filter(order => order.status === 'unpaid');

                    setOrders(unpaidOrders);
                    setLastUpdate(new Date().toLocaleTimeString());
                    console.log('✅ Realtime orders updated:', {
                        totalOrders: firebaseOrders.length,
                        unpaidOrders: unpaidOrders.length,
                        hasFirebaseData: hasData
                    });
                },
                (error) => {
                    console.error('❌ Error in realtime listener:', error);
                    loadOrders();
                }
            );

            setUnsubscribe(() => unsubscribeListener);
            console.log('✅ Realtime listener setup complete');

        } catch (error) {
            console.error('❌ Error setting up realtime listener:', error);
            loadOrders();
        }
    };

    const cleanupRealtimeListener = () => {
        if (unsubscribe) {
            console.log('🧹 Cleaning up realtime listener...');
            unsubscribe();
            setUnsubscribe(null);
        }
    };

    const loadOrders = async () => {
        setLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            let allOrders: OrderData[] = [];

            if (connectionMode === 'offline') {
                console.log('📱 Loading orders from local storage...');
                const localOrders = await syncService.getPendingReceipts();
                allOrders = localOrders.filter(order => order.status === 'unpaid');
                console.log('📱 Local orders loaded:', allOrders.length);
                setHasFirebaseData(false);
            } else {
                console.log('🔥 Online mode - Manual refresh as backup...');

                try {
                    const ordersCollection = collection(db, 'orders');
                    const ordersQuery = query(
                        ordersCollection,
                        orderBy('timestamp', 'desc')
                    );

                    const ordersSnapshot = await getDocs(ordersQuery);

                    const firebaseOrders: OrderData[] = ordersSnapshot.docs.map(doc => {
                        const data = doc.data();
                        console.log('🔥 Loading order from Firebase:', {
                            orderId: data.orderId,
                            status: data.status,
                            customerName: data.customerName
                        });

                        return {
                            orderId: data.orderId || doc.id,
                            customerName: data.customerName || 'Unknown Customer',
                            items: data.items || [],
                            subtotal: Number(data.subtotal) || 0,
                            total: Number(data.total) || 0,
                            timestamp: data.timestamp || data.created_at || new Date().toISOString(),
                            status: data.status || 'unpaid',
                            firebaseId: doc.id,
                            orderType: data.order_type || data.orderType || 'dine-in',
                            cupsUsed: data.cups_used || data.cupsUsed || 0,
                            allItemsReady: data.allItemsReady || false,
                            notes: data.notes || '' // ADDED: get notes from Firebase
                        };
                    });

                    setHasFirebaseData(firebaseOrders.length > 0);
                    allOrders = firebaseOrders.filter(order => order.status === 'unpaid');

                    console.log('🔥 Firebase orders loaded:', {
                        totalOrders: firebaseOrders.length,
                        unpaidOrders: allOrders.length,
                        hasFirebaseData: firebaseOrders.length > 0
                    });

                    setupRealtimeListener();

                } catch (firebaseError) {
                    console.log('⚠️ Failed to load from Firebase, falling back to local storage:', firebaseError);
                    const localOrders = await syncService.getPendingReceipts();
                    allOrders = localOrders.filter(order => order.status === 'unpaid');
                    setHasFirebaseData(false);
                    console.log('📱 Fallback to local orders:', allOrders.length);
                }
            }

            setOrders(allOrders);
            setLastUpdate(new Date().toLocaleTimeString());
            console.log('✅ Final loaded orders:', allOrders.length);

        } catch (error) {
            console.error('❌ Error loading orders:', error);
            try {
                const syncService = OfflineSyncService.getInstance();
                const localOrders = await syncService.getPendingReceipts();
                const filteredOrders = localOrders.filter(order => order.status === 'unpaid');
                setOrders(filteredOrders);
                setHasFirebaseData(false);
                setLastUpdate(new Date().toLocaleTimeString());
                console.log('📱 Emergency fallback to local orders:', filteredOrders.length);
            } catch (fallbackError) {
                console.error('❌ Emergency fallback failed:', fallbackError);
                setOrders([]);
                setHasFirebaseData(false);
            }
        } finally {
            setLoading(false);
        }
    };

    const checkFirebaseData = async () => {
        try {
            const connectionMode = await getConnectionMode();

            if (connectionMode === 'online') {
                setCheckingFirebase(true);
                const ordersCollection = collection(db, 'orders');
                const snapshot = await getDocs(ordersCollection);
                const hasData = !snapshot.empty;
                setHasFirebaseData(hasData);
                console.log('🔥 Firebase data check:', hasData ? 'Data exists' : 'No data');

                if (hasData) {
                    snapshot.forEach((doc) => {
                        const data = doc.data();
                        console.log('📊 Firebase order found:', {
                            orderId: data.orderId,
                            status: data.status,
                            customerName: data.customerName
                        });
                    });
                }
            }
        } catch (error) {
            console.log('❌ Error checking Firebase data:', error);
            setHasFirebaseData(false);
        } finally {
            setCheckingFirebase(false);
        }
    };

    useFocusEffect(
        React.useCallback(() => {
            loadOrders();
            checkFirebaseData();

            return () => {
                cleanupRealtimeListener();
            };
        }, [])
    );

    const filteredOrders = orders.filter(order => {
        if (selectedOrderType === 'all') return true;
        return order.orderType === selectedOrderType;
    });

    const toggleItemReady = async (orderId: string, itemIndex: number) => {
        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            console.log('🔄 Toggling item ready status:', orderId, itemIndex);

            setOrders(prevOrders => {
                return prevOrders.map(order => {
                    if (order.orderId === orderId) {
                        const updatedItems = [...order.items];
                        updatedItems[itemIndex] = {
                            ...updatedItems[itemIndex],
                            ready: !updatedItems[itemIndex].ready
                        };

                        const allItemsReady = updatedItems.every(item => item.ready || item.cancelled);

                        return {
                            ...order,
                            items: updatedItems,
                            allItemsReady
                        };
                    }
                    return order;
                });
            });

            if (selectedOrder && selectedOrder.orderId === orderId) {
                setSelectedOrder(prev => {
                    if (!prev) return null;
                    const updatedItems = [...prev.items];
                    updatedItems[itemIndex] = {
                        ...updatedItems[itemIndex],
                        ready: !updatedItems[itemIndex].ready
                    };

                    const allItemsReady = updatedItems.every(item => item.ready || item.cancelled);

                    return {
                        ...prev,
                        items: updatedItems,
                        allItemsReady
                    };
                });
            }

            console.log('📱 Updating local storage...');
            const pendingReceipts = await syncService.getItem('pendingReceipts');
            const localOrders: OrderData[] = pendingReceipts ? JSON.parse(pendingReceipts) : [];

            const updatedLocalOrders = localOrders.map(order => {
                if (order.orderId === orderId) {
                    const updatedItems = [...order.items];
                    updatedItems[itemIndex] = {
                        ...updatedItems[itemIndex],
                        ready: !updatedItems[itemIndex].ready
                    };

                    const allItemsReady = updatedItems.every(item => item.ready || item.cancelled);

                    return {
                        ...order,
                        items: updatedItems,
                        allItemsReady
                    };
                }
                return order;
            });

            await syncService.setItem('pendingReceipts', JSON.stringify(updatedLocalOrders));
            console.log('✅ Local storage updated');

            if (connectionMode === 'online') {
                console.log('🔥 Updating Firebase...');

                const orderToUpdate = orders.find(order => order.orderId === orderId);

                if (orderToUpdate && orderToUpdate.firebaseId) {
                    const orderDoc = doc(db, 'orders', orderToUpdate.firebaseId);

                    const currentOrder = updatedLocalOrders.find(order => order.orderId === orderId);
                    if (currentOrder) {
                        await updateDoc(orderDoc, {
                            items: currentOrder.items,
                            allItemsReady: currentOrder.allItemsReady,
                            updated_at: new Date().toISOString()
                        });
                        console.log('✅ Firebase updated');
                    }
                } else {
                    console.log('⚠️ Order not found in Firebase, local storage updated only');
                }
            }

        } catch (error) {
            console.error('❌ Error updating item ready status:', error);
            Alert.alert('Error', 'Failed to update item status');
        }
    };

    const cancelItem = async (orderId: string, itemIndex: number) => {
        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            console.log('🔄 Cancelling item:', orderId, itemIndex);

            setOrders(prevOrders => {
                return prevOrders.map(order => {
                    if (order.orderId === orderId) {
                        const updatedItems = [...order.items];
                        const isCurrentlyCancelled = updatedItems[itemIndex].cancelled;

                        updatedItems[itemIndex] = {
                            ...updatedItems[itemIndex],
                            cancelled: !isCurrentlyCancelled
                        };

                        const activeItems = updatedItems.filter(item => !item.cancelled);
                        const newSubtotal = activeItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                        const newTotal = newSubtotal;

                        const allItemsReady = updatedItems.every(item => item.ready || item.cancelled);

                        return {
                            ...order,
                            items: updatedItems,
                            subtotal: newSubtotal,
                            total: newTotal,
                            allItemsReady
                        };
                    }
                    return order;
                });
            });

            if (selectedOrder && selectedOrder.orderId === orderId) {
                setSelectedOrder(prev => {
                    if (!prev) return null;
                    const updatedItems = [...prev.items];
                    const isCurrentlyCancelled = updatedItems[itemIndex].cancelled;

                    updatedItems[itemIndex] = {
                        ...updatedItems[itemIndex],
                        cancelled: !isCurrentlyCancelled
                    };

                    const activeItems = updatedItems.filter(item => !item.cancelled);
                    const newSubtotal = activeItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                    const newTotal = newSubtotal;

                    const allItemsReady = updatedItems.every(item => item.ready || item.cancelled);

                    return {
                        ...prev,
                        items: updatedItems,
                        subtotal: newSubtotal,
                        total: newTotal,
                        allItemsReady
                    };
                });
            }

            console.log('📱 Updating local storage...');
            const pendingReceipts = await syncService.getItem('pendingReceipts');
            const localOrders: OrderData[] = pendingReceipts ? JSON.parse(pendingReceipts) : [];

            const updatedLocalOrders = localOrders.map(order => {
                if (order.orderId === orderId) {
                    const updatedItems = [...order.items];
                    const isCurrentlyCancelled = updatedItems[itemIndex].cancelled;

                    updatedItems[itemIndex] = {
                        ...updatedItems[itemIndex],
                        cancelled: !isCurrentlyCancelled
                    };

                    const activeItems = updatedItems.filter(item => !item.cancelled);
                    const newSubtotal = activeItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                    const newTotal = newSubtotal;

                    const allItemsReady = updatedItems.every(item => item.ready || item.cancelled);

                    return {
                        ...order,
                        items: updatedItems,
                        subtotal: newSubtotal,
                        total: newTotal,
                        allItemsReady
                    };
                }
                return order;
            });

            await syncService.setItem('pendingReceipts', JSON.stringify(updatedLocalOrders));
            console.log('✅ Local storage updated');

            if (connectionMode === 'online') {
                console.log('🔥 Updating Firebase...');

                const orderToUpdate = orders.find(order => order.orderId === orderId);

                if (orderToUpdate && orderToUpdate.firebaseId) {
                    const orderDoc = doc(db, 'orders', orderToUpdate.firebaseId);

                    const currentOrder = updatedLocalOrders.find(order => order.orderId === orderId);
                    if (currentOrder) {
                        const itemsForFirebase = currentOrder.items.filter(item => !item.cancelled);

                        await updateDoc(orderDoc, {
                            items: itemsForFirebase,
                            subtotal: currentOrder.subtotal,
                            total: currentOrder.total,
                            allItemsReady: currentOrder.allItemsReady,
                            updated_at: new Date().toISOString()
                        });
                        console.log('✅ Firebase updated - cancelled items removed');
                    }
                } else {
                    console.log('⚠️ Order not found in Firebase, local storage updated only');
                }
            }

        } catch (error) {
            console.error('❌ Error cancelling item:', error);
            Alert.alert('Error', 'Failed to cancel item');
        }
    };

    const markAllItemsReady = async (orderId: string) => {
        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            console.log('🔄 Marking all items as ready:', orderId);

            setOrders(prevOrders => {
                return prevOrders.map(order => {
                    if (order.orderId === orderId) {
                        const updatedItems = order.items.map(item => ({
                            ...item,
                            ready: !item.cancelled
                        }));
                        return {
                            ...order,
                            items: updatedItems,
                            allItemsReady: true
                        };
                    }
                    return order;
                });
            });

            if (selectedOrder && selectedOrder.orderId === orderId) {
                setSelectedOrder(prev => {
                    if (!prev) return null;
                    const updatedItems = prev.items.map(item => ({
                        ...item,
                        ready: !item.cancelled
                    }));
                    return {
                        ...prev,
                        items: updatedItems,
                        allItemsReady: true
                    };
                });
            }

            const pendingReceipts = await syncService.getItem('pendingReceipts');
            const localOrders: OrderData[] = pendingReceipts ? JSON.parse(pendingReceipts) : [];

            const updatedLocalOrders = localOrders.map(order => {
                if (order.orderId === orderId) {
                    const updatedItems = order.items.map(item => ({
                        ...item,
                        ready: !item.cancelled
                    }));
                    return {
                        ...order,
                        items: updatedItems,
                        allItemsReady: true
                    };
                }
                return order;
            });

            await syncService.setItem('pendingReceipts', JSON.stringify(updatedLocalOrders));
            console.log('✅ Local storage updated - all items marked ready');

            if (connectionMode === 'online') {
                console.log('🔥 Updating Firebase...');

                const orderToUpdate = orders.find(order => order.orderId === orderId);

                if (orderToUpdate && orderToUpdate.firebaseId) {
                    const orderDoc = doc(db, 'orders', orderToUpdate.firebaseId);

                    const currentOrder = updatedLocalOrders.find(order => order.orderId === orderId);
                    if (currentOrder) {
                        const itemsForFirebase = currentOrder.items.filter(item => !item.cancelled);

                        await updateDoc(orderDoc, {
                            items: itemsForFirebase,
                            subtotal: currentOrder.subtotal,
                            total: currentOrder.total,
                            allItemsReady: true,
                            updated_at: new Date().toISOString()
                        });
                        console.log('✅ Firebase updated - all items marked ready');
                    }
                }
            }

            Alert.alert('Success', 'All active items marked as ready!');

        } catch (error) {
            console.error('❌ Error marking all items as ready:', error);
            Alert.alert('Error', 'Failed to mark all items as ready');
        }
    };

    const updateOrderStatus = async (orderId: string, newStatus: 'paid' | 'cancelled') => {
        try {
            setIsProcessing(true);

            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            console.log('🔄 Updating order status:', orderId, newStatus);

            const order = orders.find(order => order.orderId === orderId);
            const allItemsCancelled = order && order.items.every(item => item.cancelled);
            const finalStatus = allItemsCancelled ? 'cancelled' : newStatus;

            console.log('📱 Updating local storage...');
            const pendingReceipts = await syncService.getItem('pendingReceipts');
            const localOrders: OrderData[] = pendingReceipts ? JSON.parse(pendingReceipts) : [];
            const updatedLocalOrders = localOrders.map(order =>
                order.orderId === orderId ? { ...order, status: finalStatus } : order
            );
            await syncService.setItem('pendingReceipts', JSON.stringify(updatedLocalOrders));
            console.log('✅ Local storage updated');

            if (connectionMode === 'online') {
                console.log('🔥 Updating Firebase...');

                const orderToUpdate = orders.find(order => order.orderId === orderId);

                if (orderToUpdate && orderToUpdate.firebaseId) {
                    const orderDoc = doc(db, 'orders', orderToUpdate.firebaseId);

                    const currentOrder = updatedLocalOrders.find(order => order.orderId === orderId);
                    if (currentOrder) {
                        const itemsForFirebase = currentOrder.items.filter(item => !item.cancelled);

                        await updateDoc(orderDoc, {
                            status: finalStatus,
                            items: itemsForFirebase,
                            subtotal: currentOrder.subtotal,
                            total: currentOrder.total,
                            updated_at: new Date().toISOString()
                        });

                        console.log('✅ Firebase updated - only active items stored');
                    }
                } else {
                    console.log('⚠️ Order not found in Firebase, local storage updated only');
                }
            }

            setOrders(prev => prev.filter(order => order.orderId !== orderId));

            Alert.alert('Success', `Order marked as ${finalStatus}`);
            setShowActionModal(false);
            setSelectedOrder(null);

        } catch (error) {
            console.error('❌ Error updating order:', error);
            Alert.alert('Error', 'Failed to update order status');
        } finally {
            setIsProcessing(false);
        }
    };

    const openActionModal = (order: OrderData) => {
        setSelectedOrder(order);
        setShowActionModal(true);
    };

    const closeActionModal = () => {
        setShowActionModal(false);
        setSelectedOrder(null);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'paid': return '#16A34A';
            case 'cancelled': return '#DC2626';
            default: return '#D97706';
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
        return activeItem ? activeItem.name : 'No active items';
    };

    const getOrderTypeIcon = (orderType?: string) => {
        switch (orderType) {
            case 'dine-in': return 'coffee';
            case 'take-out': return 'shopping-bag';
            default: return 'package';
        }
    };

    const getOrderTypeColor = (orderType?: string) => {
        switch (orderType) {
            case 'dine-in': return '#854442';
            case 'take-out': return '#854442';
            default: return '#854442';
        }
    };

    const getReadyItemsCount = (items: OrderItem[]) => {
        return items.filter(item => item.ready && !item.cancelled).length;
    };

    const getActiveItemsCount = (items: OrderItem[]) => {
        return items.filter(item => !item.cancelled).length;
    };

    const getActiveItems = (items: OrderItem[]) => {
        return items.filter(item => !item.cancelled);
    };

    const areAllItemsReady = (order: OrderData | null) => {
        if (!order) return false;
        const activeItems = order.items.filter(item => !item.cancelled);
        if (activeItems.length === 0) return true;
        return activeItems.every(item => item.ready);
    };

    return (
        <ThemedView style={styles.container}>
            <ImageBackground
                source={require('@/assets/images/kape1.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <Navbar activeNav="order-status" />
                <ThemedView style={styles.content}>
                    {/* Header Container */}
                    <ThemedView style={styles.headerContainer}>
                        <ThemedView style={styles.headerSection}>
                            <ThemedView style={styles.headerTop}>
                                <ThemedText style={styles.mainTitle}>Order Status</ThemedText>
                                <TouchableOpacity
                                    style={styles.reloadButton}
                                    onPress={loadOrders}
                                >
                                    <Feather name="refresh-cw" size={18} color="#874E3B" />
                                </TouchableOpacity>
                            </ThemedView>

                            {/* ORDER TYPE FILTERS AND TOTAL ORDERS - SINGLE ROW */}
                            <ThemedView style={styles.filtersRow}>
                                <TouchableOpacity
                                    style={[
                                        styles.orderTypeFilterButton,
                                        selectedOrderType === 'all' && styles.orderTypeFilterButtonActive
                                    ]}
                                    onPress={() => setSelectedOrderType('all')}
                                >
                                    <Text style={[
                                        styles.orderTypeFilterText,
                                        selectedOrderType === 'all' && styles.orderTypeFilterTextActive
                                    ]}>
                                        ALL
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.orderTypeFilterButton,
                                        selectedOrderType === 'dine-in' && styles.orderTypeFilterButtonActive
                                    ]}
                                    onPress={() => setSelectedOrderType('dine-in')}
                                >
                                    <Feather name="coffee" size={14} color={selectedOrderType === 'dine-in' ? '#FFFEEA' : '#874E3B'} />
                                    <Text style={[
                                        styles.orderTypeFilterText,
                                        selectedOrderType === 'dine-in' && styles.orderTypeFilterTextActive
                                    ]}>
                                        DINE IN
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.orderTypeFilterButton,
                                        selectedOrderType === 'take-out' && styles.orderTypeFilterButtonActive
                                    ]}
                                    onPress={() => setSelectedOrderType('take-out')}
                                >
                                    <Feather name="shopping-bag" size={14} color={selectedOrderType === 'take-out' ? '#FFFEEA' : '#874E3B'} />
                                    <Text style={[
                                        styles.orderTypeFilterText,
                                        selectedOrderType === 'take-out' && styles.orderTypeFilterTextActive
                                    ]}>
                                        TAKE OUT
                                    </Text>
                                </TouchableOpacity>

                                <ThemedView style={styles.orderCountBadge}>
                                    <ThemedText style={styles.orderCountBadgeText}>
                                        TOTAL: {filteredOrders.length}
                                    </ThemedText>
                                </ThemedView>
                            </ThemedView>
                        </ThemedView>
                    </ThemedView>

                    {/* Orders Grid Container - 2 COLUMNS LAYOUT */}
                    <ThemedView style={styles.ordersContainer}>
                        <ScrollView
                            style={styles.scrollView}
                            contentContainerStyle={styles.ordersGrid}
                            showsVerticalScrollIndicator={true}
                        >
                            {loading ? (
                                <ThemedView style={styles.loadingContainer}>
                                    <ActivityIndicator size="large" color="#874E3B" />
                                    <ThemedText style={styles.loadingContainer1}>Loading orders...</ThemedText>
                                </ThemedView>
                            ) : filteredOrders.length === 0 ? (
                                <ThemedView style={styles.emptyContainer}>
                                    <Feather name="package" size={48} color="#D4A574" />
                                    <ThemedText style={styles.emptyText}>No orders found</ThemedText>
                                    <ThemedText style={styles.emptySubtext}>
                                        {selectedOrderType === 'all'
                                            ? 'All orders are paid or no pending orders'
                                            : `No ${selectedOrderType.replace('-', ' ')} orders found`
                                        }
                                    </ThemedText>
                                </ThemedView>
                            ) : (
                                filteredOrders.map((order, index) => (
                                    <TouchableOpacity
                                        key={order.orderId}
                                        style={styles.orderCard}
                                        onPress={() => openActionModal(order)}
                                    >
                                        {/* ORDER NUMBER INDICATOR */}
                                        <ThemedView style={styles.orderNumberContainer}>
                                            <ThemedText style={styles.orderNumberText}>
                                                {(index + 1).toString().padStart(2, '0')}
                                            </ThemedText>
                                        </ThemedView>

                                        {/* Order Header */}
                                        <ThemedView style={styles.orderHeader}>
                                            <ThemedText style={styles.orderId}>
                                                #{order.orderId}
                                            </ThemedText>
                                            <ThemedView style={[styles.statusBadge, { backgroundColor: '#DC2626' }]}>
                                                <Text style={styles.statusText}>
                                                    UNPAID
                                                </Text>
                                            </ThemedView>
                                        </ThemedView>

                                        {/* Order Type Indicator */}
                                        <ThemedView style={styles.orderTypeContainer}>
                                            <ThemedView style={[
                                                styles.orderTypeIconContainer,
                                                { backgroundColor: getOrderTypeColor(order.orderType) }
                                            ]}>
                                                <Feather
                                                    name={getOrderTypeIcon(order.orderType)}
                                                    size={12}
                                                    color="#FFFEEA"
                                                />
                                            </ThemedView>
                                            <ThemedText style={styles.orderTypeText}>
                                                {order.orderType === 'take-out' ? 'TAKE OUT' : 'DINE IN'}
                                            </ThemedText>
                                        </ThemedView>

                                        {/* ADDED: Notes Section - Below Order Type */}
                                        {order.notes && order.notes.trim() !== '' && (
                                            <ThemedView style={styles.notesContainer}>
                                                <Feather name="message-square" size={10} color="#874E3B" />
                                                <ThemedText style={styles.notesText} numberOfLines={2}>
                                                    {order.notes}
                                                </ThemedText>
                                            </ThemedView>
                                        )}

                                        {/* Customer Name and Time - SIDE BY SIDE */}
                                        <ThemedView style={styles.customerTimeRow}>
                                            <ThemedText style={styles.customerName} numberOfLines={1}>
                                                {order.customerName}
                                            </ThemedText>
                                            <ThemedText style={styles.orderTime}>
                                                {formatTime(order.timestamp)}
                                            </ThemedText>
                                        </ThemedView>

                                        {/* Main Item Display */}
                                        <ThemedView style={styles.itemDisplay}>
                                            <ThemedText style={styles.mainItem} numberOfLines={2}>
                                                {getFirstItemName(order.items)}
                                            </ThemedText>
                                            {getActiveItems(order.items).length > 1 && (
                                                <ThemedText style={styles.additionalItems}>
                                                    +{getActiveItems(order.items).length - 1} more
                                                </ThemedText>
                                            )}
                                        </ThemedView>

                                        {/* Ready Items Progress */}
                                        <ThemedView style={styles.readyProgressContainer}>
                                            <ThemedText style={styles.readyProgressText}>
                                                Ready: {getReadyItemsCount(order.items)}/{getActiveItemsCount(order.items)}
                                            </ThemedText>
                                        </ThemedView>

                                        {/* Cups Used (for take-out orders) */}
                                        {order.orderType === 'take-out' && order.cupsUsed && order.cupsUsed > 0 && (
                                            <ThemedView style={styles.cupsUsedContainer}>
                                                <Feather name="coffee" size={10} color="#874E3B" />
                                                <ThemedText style={styles.cupsUsedText}>
                                                    {order.cupsUsed} cups
                                                </ThemedText>
                                            </ThemedView>
                                        )}

                                        {/* Order Total */}
                                        <ThemedView style={styles.totalSection}>
                                            <ThemedText style={styles.totalLabel}>Total:</ThemedText>
                                            <ThemedText style={styles.orderTotal}>
                                                ₱{order.total.toFixed(2)}
                                            </ThemedText>
                                        </ThemedView>

                                        {/* Action Button */}
                                        <TouchableOpacity
                                            style={styles.actionButton}
                                            onPress={() => openActionModal(order)}
                                        >
                                            <ThemedText style={styles.actionButtonText}>
                                                VIEW
                                            </ThemedText>
                                        </TouchableOpacity>
                                    </TouchableOpacity>
                                ))
                            )}
                        </ScrollView>
                    </ThemedView>

                    {/* Action Modal */}
                    <Modal
                        visible={showActionModal}
                        animationType="slide"
                        transparent={true}
                        onRequestClose={closeActionModal}
                        statusBarTranslucent={true}
                    >
                        <ThemedView style={styles.modalOverlay}>
                            <ThemedView style={styles.actionModal}>
                                <ThemedView style={styles.modalHeader}>
                                    <ThemedView style={styles.modalTitleContainer}>
                                        <ThemedText style={styles.modalTitle}>
                                            Order #{selectedOrder?.orderId}
                                        </ThemedText>
                                        {selectedOrder?.orderType && (
                                            <ThemedView style={[styles.modalOrderTypeBadge, { backgroundColor: getOrderTypeColor(selectedOrder.orderType) }]}>
                                                <Feather name={getOrderTypeIcon(selectedOrder.orderType)} size={12} color="#FFFEEA" />
                                                <Text style={styles.modalOrderTypeText}>
                                                    {selectedOrder.orderType === 'take-out' ? 'TAKE OUT' : 'DINE IN'}
                                                </Text>
                                            </ThemedView>
                                        )}
                                    </ThemedView>
                                    <TouchableOpacity onPress={closeActionModal}>
                                        <Feather name="x" size={24} color="#874E3B" />
                                    </TouchableOpacity>
                                </ThemedView>

                                <ThemedView style={styles.modalContent}>
                                    {/* Customer and Time - SIDE BY SIDE IN MODAL */}
                                    <ThemedView style={styles.customerTimeRowModal}>
                                        <ThemedView style={styles.customerSection}>
                                            <ThemedText style={styles.customerLabel}>Customer:</ThemedText>
                                            <ThemedText style={styles.customerInfo}>
                                                {selectedOrder?.customerName}
                                            </ThemedText>
                                        </ThemedView>

                                        <ThemedView style={styles.timeSection}>
                                            <ThemedText style={styles.timeLabel}>Time:</ThemedText>
                                            <ThemedText style={styles.timeInfo}>
                                                {selectedOrder ? formatTime(selectedOrder.timestamp) : ''}
                                            </ThemedText>
                                        </ThemedView>
                                    </ThemedView>

                                    {/* ADDED: Notes Section in Modal */}
                                    {selectedOrder?.notes && selectedOrder.notes.trim() !== '' && (
                                        <ThemedView style={styles.modalNotesSection}>
                                            <ThemedView style={styles.modalNotesHeader}>
                                                <Feather name="message-square" size={14} color="#874E3B" />
                                                <ThemedText style={styles.modalNotesLabel}>Notes / Comment:</ThemedText>
                                            </ThemedView>
                                            <ThemedView style={styles.modalNotesContent}>
                                                <ThemedText style={styles.modalNotesText}>
                                                    {selectedOrder.notes}
                                                </ThemedText>
                                            </ThemedView>
                                        </ThemedView>
                                    )}

                                    {/* Cups Used Section for Take Out Orders */}
                                    {selectedOrder?.orderType === 'take-out' && selectedOrder.cupsUsed && selectedOrder.cupsUsed > 0 && (
                                        <ThemedView style={styles.cupsSection}>
                                            <ThemedText style={styles.cupsLabel}>Cups Used:</ThemedText>
                                            <ThemedText style={styles.cupsInfo}>
                                                {selectedOrder.cupsUsed}
                                            </ThemedText>
                                        </ThemedView>
                                    )}

                                    {/* Ready Progress in Modal */}
                                    {selectedOrder && (
                                        <ThemedView style={styles.readyProgressModal}>
                                            <ThemedText style={styles.readyProgressLabel}>
                                                Preparation Progress:
                                            </ThemedText>
                                            <ThemedView style={styles.progressBarContainer}>
                                                <ThemedView
                                                    style={[
                                                        styles.progressBar,
                                                        {
                                                            width: `${(getReadyItemsCount(selectedOrder.items) / getActiveItemsCount(selectedOrder.items)) * 100}%`
                                                        }
                                                    ]}
                                                />
                                            </ThemedView>
                                            <ThemedText style={styles.readyProgressCount}>
                                                {getReadyItemsCount(selectedOrder.items)}/{getActiveItemsCount(selectedOrder.items)} items ready
                                            </ThemedText>
                                        </ThemedView>
                                    )}

                                    {/* Items Section with Scroll */}
                                    <ThemedView style={styles.itemsSection}>
                                        <ThemedView style={styles.itemsHeader}>
                                            <ThemedText style={styles.itemsLabel}>Items:</ThemedText>
                                            {selectedOrder && !selectedOrder.allItemsReady && (
                                                <TouchableOpacity
                                                    style={styles.markAllButton}
                                                    onPress={() => selectedOrder && markAllItemsReady(selectedOrder.orderId)}
                                                >
                                                    <Feather name="check-square" size={14} color="#FFFEEA" />
                                                    <Text style={styles.markAllButtonText}>Mark All Ready</Text>
                                                </TouchableOpacity>
                                            )}
                                        </ThemedView>
                                        <ScrollView
                                            style={styles.itemsScrollView}
                                            showsVerticalScrollIndicator={true}
                                        >
                                            {selectedOrder?.items.map((item, index) => (
                                                <ThemedView key={index} style={styles.itemRow}>
                                                    <TouchableOpacity
                                                        style={styles.checkboxContainer}
                                                        onPress={() => selectedOrder && toggleItemReady(selectedOrder.orderId, index)}
                                                    >
                                                        <ThemedView style={[
                                                            styles.checkbox,
                                                            item.ready && styles.checkboxChecked
                                                        ]}>
                                                            {item.ready && (
                                                                <Feather name="check" size={12} color="#FFFEEA" />
                                                            )}
                                                        </ThemedView>
                                                    </TouchableOpacity>
                                                    <ThemedText style={[
                                                        styles.itemName,
                                                        item.ready && styles.itemNameReady,
                                                        item.cancelled && styles.itemNameCancelled
                                                    ]}>
                                                        {item.name}
                                                    </ThemedText>
                                                    <ThemedView style={styles.quantityActions}>
                                                        <ThemedText style={[
                                                            styles.itemQuantity,
                                                            item.ready && styles.itemQuantityReady,
                                                            item.cancelled && styles.itemQuantityCancelled
                                                        ]}>
                                                            x{item.quantity}
                                                        </ThemedText>
                                                        <TouchableOpacity
                                                            style={styles.cancelItemButton}
                                                            onPress={() => selectedOrder && cancelItem(selectedOrder.orderId, index)}
                                                        >
                                                            <Feather
                                                                name={item.cancelled ? "refresh-cw" : "x"}
                                                                size={12}
                                                                color={item.cancelled ? "#16A34A" : "#DC2626"}
                                                            />
                                                        </TouchableOpacity>
                                                    </ThemedView>
                                                </ThemedView>
                                            ))}
                                        </ScrollView>
                                    </ThemedView>

                                    <ThemedView style={styles.totalSectionModal}>
                                        <ThemedText style={styles.totalLabelModal}>Total Amount:</ThemedText>
                                        <ThemedText style={styles.totalAmount}>
                                            ₱{selectedOrder?.total.toFixed(2)}
                                        </ThemedText>
                                    </ThemedView>

                                    <ThemedView style={styles.actionButtons}>
                                        <TouchableOpacity
                                            style={[
                                                styles.actionButtonModal,
                                                styles.paidButton,
                                                (!areAllItemsReady(selectedOrder) || isProcessing) && styles.disabledButton
                                            ]}
                                            onPress={() => selectedOrder && areAllItemsReady(selectedOrder) && !isProcessing && updateOrderStatus(selectedOrder.orderId, 'paid')}
                                            disabled={!areAllItemsReady(selectedOrder) || isProcessing}
                                        >
                                            {isProcessing ? (
                                                <ActivityIndicator size="small" color="#FFFEEA" />
                                            ) : (
                                                <>
                                                    <Feather
                                                        name="check-circle"
                                                        size={20}
                                                        color={areAllItemsReady(selectedOrder) ? "#FFFEEA" : "#9CA3AF"}
                                                    />
                                                    <ThemedText style={[
                                                        styles.actionButtonTextModal,
                                                        !areAllItemsReady(selectedOrder) && styles.disabledButtonText
                                                    ]}>
                                                        {areAllItemsReady(selectedOrder) ? 'DONE' : 'COMPLETE PREPARATION'}
                                                    </ThemedText>
                                                </>
                                            )}
                                        </TouchableOpacity>
                                    </ThemedView>
                                </ThemedView>
                            </ThemedView>
                        </ThemedView>
                    </Modal>
                </ThemedView>
            </ImageBackground>
        </ThemedView>
    );
}

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
        backgroundColor: 'transparent'
    },
    headerSection: {
        backgroundColor: 'rgba(223, 204, 175, 0.7)',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#854442',
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'transparent',
        marginBottom: 12,
    },
    mainTitle: {
        fontSize: 30,
        color: '#874E3B',
        fontFamily: 'LobsterTwoItalic',
    },
    filtersRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        flexWrap: 'wrap',
        backgroundColor: 'transparent'
    },
    orderTypeFilters: {
        flexDirection: 'row',
        gap: 8,
        justifyContent: 'center',
        backgroundColor: '#fffecaF2',
        marginBottom: 12,
    },
    orderTypeFilterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#854442',
        backgroundColor: '#F5E6D3',
        gap: 6,
    },
    orderTypeFilterButtonActive: {
        backgroundColor: '#854442',
        borderColor: '#854442',
    },
    orderTypeFilterText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#854442',
    },
    orderTypeFilterTextActive: {
        color: '#FFFEEA',
    },
    orderCountBadge: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#854442',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#854442',
    },
    orderCountBadgeText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#FFFEEA',
    },
    orderTypeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
        gap: 4,
        backgroundColor: 'transparent'
    },
    orderTypeIconContainer: {
        width: 16,
        height: 16,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        
    },
    orderTypeText: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#874E3B',
        backgroundColor: 'transparent'
    },
    // ADDED: Notes container styles
    notesContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF3E0',
        borderRadius: 8,
        paddingHorizontal: 6,
        paddingVertical: 4,
        marginBottom: 6,
        gap: 4,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    notesText: {
        fontSize: 9,
        color: '#874E3B',
        flex: 1,
        fontStyle: 'italic',
    },
    // ADDED: Modal notes section styles
    modalNotesSection: {
        marginBottom: 12,
        backgroundColor: '#FFF3E0',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#D4A574',
        overflow: 'hidden',
    },
    modalNotesHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#F5E6D3',
        gap: 6,
    },
    modalNotesLabel: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    modalNotesContent: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: 'transparent'
    },
    modalNotesText: {
        fontSize: 12,
        color: '#5A3921',
        fontStyle: 'italic',
        lineHeight: 16,
    },
    cupsUsedContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
        gap: 4,
        backgroundColor: 'transparent'
    },
    cupsUsedText: {
        fontSize: 9,
        color: '#874E3B',
        fontWeight: '500',
    },
    orderNumberContainer: {
        position: 'absolute',
        top: -5,
        left: -5,
        backgroundColor: '#874E3B',
        width: 28,
        height: 28,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#FFFEEA',
        zIndex: 1,
    },
    orderNumberText: {
        color: '#FFFEEA',
        fontSize: 12,
        fontWeight: 'bold',
    },
    orderCountContainer: {
        alignSelf: 'flex-end',
        marginTop: 8,
        paddingHorizontal: 12,
        paddingVertical: 4,
        backgroundColor: '#F5E6D3',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#854442',
    },
    orderCountText: {
        fontSize: 12,
        color: '#874E3B',
        fontWeight: '600',
    },
    orderCountNumber: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#5A3921',
    },
    checkboxContainer: {
        padding: 4,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: '#854442',
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxChecked: {
        backgroundColor: '#16A34A',
        borderColor: '#16A34A',
    },
    markAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#874E3B',
        borderRadius: 8,
        gap: 4,
    },
    markAllButtonText: {
        color: '#FFFEEA',
        fontSize: 12,
        fontWeight: 'bold',
    },
    readyProgressContainer: {
        marginBottom: 4,
        backgroundColor: "#fffecaF2",
        borderWidth: 1,
        borderColor: '#854442',
        borderRadius: 12,
        padding: 4,
    },
    readyProgressText: {
        fontSize: 10,
        color: '#874E3B',
        fontWeight: '500',
        textAlign: 'center',
    },
    readyProgressModal: {
        marginBottom: 16,
        padding: 12,
        backgroundColor: '#F5E6D3',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#854442',
    },
    readyProgressLabel: {
        fontSize: 14,
        color: '#874E3B',
        fontWeight: '600',
        marginBottom: 8,
    },
    progressBarContainer: {
        height: 8,
        backgroundColor: '#E8D8C8',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#16A34A',
        borderRadius: 4,
    },
    readyProgressCount: {
        fontSize: 12,
        color: '#5A3921',
        textAlign: 'center',
    },
    cancelItemButton: {
        padding: 4,
        marginLeft: 8,
    },
    quantityActions: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'transparent'
    },
    disabledButton: {
        backgroundColor: '#9CA3AF',
        borderColor: '#6B7280',
    },
    disabledButtonText: {
        color: '#E5E7EB',
    },
    modeInfo: {
        fontSize: 12,
        color: '#874E3B',
        fontStyle: 'italic',
        marginBottom: 8,
    },
    lastUpdateText: {
        fontSize: 11,
        color: '#8B7355',
        fontStyle: 'italic',
        fontWeight: 'bold',
    },
    ordersContainer: {
        flex: 1,
        backgroundColor: "rgba(255, 254, 234, 0.85)",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#854442',
        padding: 12,
    },
    scrollView: {
        flex: 1,
    },
    ordersGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    orderCard: {
        width: CARD_WIDTH,
        marginBottom: CARD_MARGIN,
        backgroundColor: "#FFFEEA",
        borderRadius: 12,
        padding: 12,
        borderWidth: 2,
        borderColor: '#854442',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },
    orderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginLeft: 25,
        marginBottom: 6,
        backgroundColor: "#FFFEEA",
    },
    orderId: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#874E3B',
        fontFamily: 'LobsterTwoRegular',
        flex: 1,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        marginLeft: 4,
    },
    statusText: {
        color: '#FFFEEA',
        fontSize: 8,
        fontWeight: 'bold',
    },
    customerTimeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
        backgroundColor: '#fffecaF2',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#854442',
        paddingHorizontal: 6,
        paddingVertical: 4,
    },
    customerName: {
        fontSize: 12,
        fontWeight: '600',
        color: '#5A3921',
        flex: 1,
    },
    orderTime: {
        fontSize: 10,
        color: '#8B7355',
        fontStyle: 'italic',
        marginLeft: 8,
    },
    itemDisplay: {
        justifyContent: 'center',
        marginBottom: 6,
        backgroundColor: "#fffecaF2",
        borderWidth: 1,
        borderColor: '#854442',
        borderRadius: 12,
        padding: 6,
        minHeight: 45,
    },
    mainItem: {
        fontSize: 10,
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
    },
    totalSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
        paddingTop: 4,
        borderTopWidth: 1,
        borderTopColor: '#E8D8C8',
        backgroundColor: 'transparent'
    },
    totalLabel: {
        fontSize: 12,
        color: '#5A3921',
        fontWeight: '600',
    },
    orderTotal: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    actionButton: {
        backgroundColor: '#D4A574',
        paddingVertical: 6,
        borderRadius: 6,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#B08C5F',
    },
    actionButtonText: {
        color: '#FFFEEA',
        fontSize: 10,
        fontWeight: 'bold',
    },
    loadingContainer: {
        padding: 20,
        alignItems: 'center',
        width: '100%',
        backgroundColor: 'transparent'
    },
    loadingContainer1:{
        color:'#874E3B',
        marginTop: 10
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
        width: '100%',
        backgroundColor: '#F5E6D3',
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#854442',
    },
    emptyText: {
        fontSize: 16,
        color: '#874E3B',
        marginTop: 12,
        textAlign: 'center',
    },
    emptySubtext: {
        fontSize: 12,
        color: '#8B7355',
        marginTop: 4,
        textAlign: 'center',
    },
    reloadButton: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#854442',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    actionModal: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#FFFEEA',
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#854442',
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#F5E6D3',
        borderBottomWidth: 1,
        borderBottomColor: '#854442',
    },
    modalTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        flexWrap: 'wrap',
        gap: 8,
        backgroundColor: 'transparent'
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
        fontFamily: 'LobsterTwoRegular',
    },
    modalOrderTypeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    modalOrderTypeText: {
        color: '#FFFEEA',
        fontSize: 10,
        fontWeight: 'bold',
    },
    modalContent: {
        padding: 20,
        backgroundColor: 'transparent'
    },
    customerTimeRowModal: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
        gap: 16,
        backgroundColor: 'transparent'
    },
    customerSection: {
        flex: 1,
        backgroundColor: 'transparent'
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
        flex: 1,
        backgroundColor: 'transparent'
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
    cupsSection: {
        marginBottom: 16,
        backgroundColor: 'transparent'
    },
    cupsLabel: {
        fontSize: 14,
        color: '#8B7355',
        marginBottom: 4,
    },
    cupsInfo: {
        fontSize: 16,
        fontWeight: '600',
        color: '#5A3921',
    },
    itemsSection: {
        marginBottom: 20,
        backgroundColor: 'transparent'
    },
    itemsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        backgroundColor: 'transparent'
    },
    itemsLabel: {
        fontSize: 14,
        color: '#8B7355',
    },
    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#E8D8C8',
        backgroundColor: 'transparent'
    },
    itemName: {
        fontSize: 14,
        color: '#5A3921',
        flex: 1,
        marginLeft: 8,
    },
    itemsScrollView: {
        maxHeight: 200,
        backgroundColor: 'transparent'
    },
    itemNameReady: {
        textDecorationLine: 'line-through',
        color: '#8B7355',
    },
    itemNameCancelled: {
        textDecorationLine: 'line-through',
        color: '#DC2626',
        fontStyle: 'italic',
    },
    itemQuantity: {
        fontSize: 14,
        fontWeight: '600',
        color: '#874E3B',
    },
    itemQuantityReady: {
        textDecorationLine: 'line-through',
        color: '#8B7355',
    },
    itemQuantityCancelled: {
        textDecorationLine: 'line-through',
        color: '#DC2626',
        fontStyle: 'italic',
    },
    totalSectionModal: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
        borderTopWidth: 2,
        borderTopColor: '#854442',
        marginBottom: 20,
        backgroundColor: 'transparent'
    },
    totalLabelModal: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#5A3921',
    },
    totalAmount: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    actionButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        backgroundColor: 'transparent'
    },
    actionButtonModal: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    paidButton: {
        backgroundColor: '#16A34A',
    },
    cancelButton: {
        backgroundColor: '#DC2626',
    },
    actionButtonTextModal: {
        color: '#FFFEEA',
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'center',
    },
});