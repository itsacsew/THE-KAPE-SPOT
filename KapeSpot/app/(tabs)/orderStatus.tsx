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
    updateDoc,
    doc,
    query,
    where,
    orderBy
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
}

const { width } = Dimensions.get('window');
const CARD_MARGIN = 3.7;
const CARD_WIDTH = (width - (CARD_MARGIN * 20)) / 4;
// orderStatus.tsx - Add this helper function
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
            } else {
                try {
                    console.log('🔥 Loading orders from Firebase...');

                    const ordersCollection = collection(db, 'orders');
                    const ordersQuery = query(
                        ordersCollection,
                        where('status', '==', 'unpaid'),
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
                            firebaseId: doc.id,
                            orderType: data.order_type || data.orderType || 'dine-in',
                            cupsUsed: data.cups_used || data.cupsUsed || 0,
                            allItemsReady: data.allItemsReady || false
                        };
                    });

                    allOrders = firebaseOrders;
                    console.log('🔥 Firebase orders loaded:', allOrders.length, 'unpaid orders');

                } catch (firebaseError) {
                    console.log('⚠️ Failed to load from Firebase, falling back to local storage');
                    const localOrders = await syncService.getPendingReceipts();
                    allOrders = localOrders.filter(order => order.status === 'unpaid');
                    console.log('📱 Fallback to local orders:', allOrders.length);
                }
            }

            setOrders(allOrders);
            console.log('✅ Final loaded orders:', allOrders.length);

        } catch (error) {
            console.error('❌ Error loading orders:', error);
            const syncService = OfflineSyncService.getInstance();
            const localOrders = await syncService.getPendingReceipts();
            const filteredOrders = localOrders.filter(order => order.status === 'unpaid');
            setOrders(filteredOrders);
            console.log('📱 Emergency fallback to local orders:', filteredOrders.length);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        React.useCallback(() => {
            loadOrders();
        }, [])
    );

    const filteredOrders = orders.filter(order => {
        if (selectedOrderType === 'all') return true;
        return order.orderType === selectedOrderType;
    });

    const getOrderNumberIndicator = (index: number) => {
        return (index + 1).toString().padStart(2, '0');
    };

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

            // Calculate new totals
            setOrders(prevOrders => {
                return prevOrders.map(order => {
                    if (order.orderId === orderId) {
                        const updatedItems = [...order.items];
                        const isCurrentlyCancelled = updatedItems[itemIndex].cancelled;

                        // Toggle cancelled status
                        updatedItems[itemIndex] = {
                            ...updatedItems[itemIndex],
                            cancelled: !isCurrentlyCancelled
                        };

                        // Calculate new subtotal and total
                        const activeItems = updatedItems.filter(item => !item.cancelled);
                        const newSubtotal = activeItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                        const newTotal = newSubtotal; // Assuming no taxes/discounts for now

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
                        // Only send non-cancelled items to Firebase
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
                            ready: !item.cancelled // Only mark non-cancelled items as ready
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
                        ready: !item.cancelled // Only mark non-cancelled items as ready
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
                        // Only send non-cancelled items to Firebase
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
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            console.log('🔄 Updating order status:', orderId, newStatus);

            // Check if all items are cancelled
            const order = orders.find(order => order.orderId === orderId);
            const allItemsCancelled = order && order.items.every(item => item.cancelled);

            // If all items are cancelled, automatically mark as 'cancelled' instead of 'paid'
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
            case 'dine-in': return '#874E3B';
            case 'take-out': return '#D4A574';
            default: return '#8B7355';
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

    // ADDED: Check if all active items are ready
    // ADDED: Check if all active items are ready (cancelled items are considered as "completed")
    const areAllItemsReady = (order: OrderData | null) => {
        if (!order) return false;

        // Get only active (non-cancelled) items
        const activeItems = order.items.filter(item => !item.cancelled);

        // If there are no active items (all cancelled), order is ready to complete
        if (activeItems.length === 0) {
            return true;
        }

        // Check if all active items are marked as ready
        return activeItems.every(item => item.ready);
    };

    return (
        <ThemedView style={styles.container}>
            <Navbar activeNav="order-status" />

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
                                <ThemedText style={styles.mainTitle}>Order Status</ThemedText>
                                <TouchableOpacity
                                    style={styles.reloadButton}
                                    onPress={loadOrders}
                                >
                                    <Feather name="refresh-cw" size={18} color="#874E3B" />
                                </TouchableOpacity>
                            </ThemedView>
                            <ThemedText style={styles.modeInfo}>
                                {isOnlineMode ? '🔥 Connected to Firebase - Showing online data' : '📱 Using local storage - Showing local data'}
                            </ThemedText>

                            {/* ORDER TYPE FILTERS */}
                            <ThemedView style={styles.orderTypeFilters}>
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
                                <ThemedView style={styles.orderCountContainer}>
                                    <ThemedText style={styles.orderCountText}>
                                        Total Orders: <Text style={styles.orderCountNumber}>{filteredOrders.length}</Text>
                                    </ThemedText>
                                </ThemedView>
                            </ThemedView>

                        </ThemedView>
                    </ThemedView>

                    {/* Orders Grid Container */}
                    <ThemedView style={styles.ordersContainer}>
                        <ScrollView
                            style={styles.scrollView}
                            contentContainerStyle={styles.ordersGrid}
                            showsVerticalScrollIndicator={true}
                        >
                            {loading ? (
                                <ThemedView style={styles.loadingContainer}>
                                    <ThemedText>Loading orders...</ThemedText>
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
                                                {getOrderNumberIndicator(index)}
                                            </ThemedText>
                                        </ThemedView>

                                        {/* Order Header */}
                                        <ThemedView style={styles.orderHeader}>
                                            <ThemedText style={styles.orderId}>
                                                #{getOrderNumberIndicator(index)}
                                            </ThemedText>
                                            <ThemedView style={[styles.statusBadge, { backgroundColor: 'green' }]}>
                                                <Text style={styles.statusText}>
                                                    PAID
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
                    >
                        <ThemedView style={styles.modalOverlay}>
                            <ThemedView style={styles.actionModal}>
                                <ThemedView style={styles.modalHeader}>
                                    <ThemedView style={styles.modalTitleContainer}>
                                        <ThemedText style={styles.modalTitle}>
                                            Order #{getOrderNumberIndicator(filteredOrders.findIndex(order => order.orderId === selectedOrder?.orderId))}
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
                                        {/* ADDED: Disabled state for DONE button when not all items are ready */}
                                        <TouchableOpacity
                                            style={[
                                                styles.actionButtonModal,
                                                styles.paidButton,
                                                !areAllItemsReady(selectedOrder) && styles.disabledButton
                                            ]}
                                            onPress={() => selectedOrder && areAllItemsReady(selectedOrder) && updateOrderStatus(selectedOrder.orderId, 'paid')}
                                            disabled={!areAllItemsReady(selectedOrder)}
                                        >
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
    },
    headerSection: {
        backgroundColor: "#fffecaF2",
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#fffecaF2'
    },
    mainTitle: {
        fontSize: 30,
        color: '#874E3B',
        fontFamily: 'LobsterTwoItalic',
    },
    modeInfo: {
        fontSize: 12,
        color: '#874E3B',
        fontStyle: 'italic',
    },
    ordersContainer: {
        flex: 1,
        backgroundColor: "rgba(255, 254, 234, 0.85)",
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
        marginLeft: 15,
        marginBottom: 6,
        backgroundColor: "#FFFEEA",
    },
    orderId: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#874E3B',
        fontFamily: 'LobsterTwoRegular',
        flex: 1,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 2,
        borderRadius: 6,
        marginLeft: 4,
    },
    statusText: {
        color: '#FFFEEA',
        fontSize: 10,
        fontWeight: 'bold',
    },
    // UPDATED: Customer and Time side by side
    customerTimeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
        backgroundColor: '#fffecaF2',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    customerName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#5A3921',
        flex: 1,
        marginLeft: 10,
    },
    orderTime: {
        fontSize: 15,
        color: '#8B7355',
        fontStyle: 'italic',
        marginLeft: 8,
    },
    itemDisplay: {
        flex: 1,
        justifyContent: 'center',
        marginBottom: 6,
        backgroundColor: "#fffecaF2",
        borderWidth: 1,
        borderColor: '#D4A574',
        borderRadius: 12,
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
        fontSize: 15,
        color: '#5A3921',
        fontWeight: '600',
    },
    orderTotal: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    actionButton: {
        backgroundColor: '#D4A574',
        paddingVertical: 4,
        borderRadius: 6,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#B08C5F',
    },
    actionButtonText: {
        color: '#FFFEEA',
        fontSize: 8,
        fontWeight: 'bold',
    },
    loadingContainer: {
        padding: 20,
        alignItems: 'center',
        width: '100%',
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
        borderColor: '#D4A574',
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#F5E6D3',
        borderBottomWidth: 1,
        borderBottomColor: '#D4A574',
    },
    modalTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#874E3B',
        fontFamily: 'LobsterTwoRegular',
        marginRight: 12,
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
    },
    // UPDATED: Customer and Time side by side in modal
    customerTimeRowModal: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
        gap: 16,
    },
    customerSection: {
        flex: 1,
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
    },
    itemsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
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
    },
    itemName: {
        fontSize: 14,
        color: '#5A3921',
        flex: 1,
        marginLeft: 8,
    },
    itemsScrollView: {
        maxHeight: 200, // Adjust this value as needed
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
        borderTopColor: '#D4A574',
        marginBottom: 20,
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

    // ORDER TYPE FILTER STYLES
    orderTypeFilters: {
        flexDirection: 'row',
        gap: 8,
        justifyContent: 'center',
        backgroundColor: '#fffecaF2'
    },
    orderTypeFilterButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 100,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#D4A574',
        backgroundColor: '#F5E6D3',
        gap: 6,
    },
    orderTypeFilterButtonActive: {
        backgroundColor: '#874E3B',
        borderColor: '#874E3B',
    },
    orderTypeFilterText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    orderTypeFilterTextActive: {
        color: '#FFFEEA',
    },

    // ORDER TYPE INDICATOR STYLES IN CARD
    orderTypeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
        gap: 4,
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
    },

    // CUPS USED STYLES
    cupsUsedContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
        gap: 4,
    },
    cupsUsedText: {
        fontSize: 9,
        color: '#874E3B',
        fontWeight: '500',
    },

    // ADDED: Order Number Indicator Styles
    orderNumberContainer: {
        position: 'absolute',
        top: -5,
        left: -5,
        backgroundColor: '#874E3B',
        width: 30,
        height: 30,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#FFFEEA',
        zIndex: 1,
    },
    orderNumberText: {
        color: '#FFFEEA',
        fontSize: 10,
        fontWeight: 'bold',
    },

    // ADDED: Order Count Indicator Styles
    orderCountContainer: {
        alignSelf: 'flex-end',
        marginVertical: 4,
        paddingHorizontal: 12,
        paddingVertical: 4,
        backgroundColor: '#F5E6D3',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#D4A574',
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

    // ADDED: Checkbox Styles
    checkboxContainer: {
        padding: 4,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: '#D4A574',
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxChecked: {
        backgroundColor: '#16A34A',
        borderColor: '#16A34A',
    },

    // ADDED: Mark All Button Styles
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

    // ADDED: Ready Progress Styles
    readyProgressContainer: {
        marginBottom: 4,
        backgroundColor: "#fffecaF2",
        borderWidth: 1,
        borderColor: '#D4A574',
        borderRadius: 12,
    },
    readyProgressText: {
        fontSize: 20,
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
        borderColor: '#D4A574',
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

    // ADDED: Cancel Item Button Styles
    cancelItemButton: {
        padding: 4,
        marginLeft: 8,
    },
    quantityActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    // ADDED: Disabled Button Styles
    disabledButton: {
        backgroundColor: '#9CA3AF',
        borderColor: '#6B7280',
    },
    disabledButtonText: {
        color: '#E5E7EB',
    },
});