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
    Dimensions
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

interface OrderData {
    orderId: string;
    customerName: string;
    items: any[];
    subtotal: number;
    total: number;
    timestamp: string;
    status: 'unpaid' | 'paid' | 'cancelled';
    firebaseId?: string;
    orderType?: 'dine-in' | 'take-out'; // ADDED ORDER TYPE
    cupsUsed?: number;
}

const { width } = Dimensions.get('window');
const CARD_MARGIN = 3.7;
const CARD_WIDTH = (width - (CARD_MARGIN * 20)) / 4; // 4 columns with margins

export default function OrderStatusScreen() {
    const [orders, setOrders] = useState<OrderData[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOnlineMode, setIsOnlineMode] = useState<boolean>(false);
    const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null);
    const [showActionModal, setShowActionModal] = useState(false);
    const [selectedOrderType, setSelectedOrderType] = useState<'all' | 'dine-in' | 'take-out'>('all'); // ADDED ORDER TYPE FILTER

    // Initialize Firebase
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
                // Load from local storage only - FILTER OUT PAID AND CANCELLED ORDERS
                console.log('📱 Loading orders from local storage...');
                const localOrders = await syncService.getPendingReceipts();
                // Only show unpaid orders (remove both paid and cancelled)
                allOrders = localOrders.filter(order => order.status === 'unpaid');
                console.log('📱 Local orders loaded:', allOrders.length);
            } else {
                // Load from Firebase Firestore
                try {
                    console.log('🔥 Loading orders from Firebase...');

                    // Query orders collection where status is 'unpaid'
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
                            orderType: data.order_type || data.orderType || 'dine-in', // ADD ORDER TYPE
                            cupsUsed: data.cups_used || data.cupsUsed || 0
                        };
                    });

                    allOrders = firebaseOrders;
                    console.log('🔥 Firebase orders loaded:', allOrders.length, 'unpaid orders');

                } catch (firebaseError) {

                    console.log('⚠️ Failed to load from Firebase, falling back to local storage');

                    // Fallback to local storage - FILTER OUT PAID AND CANCELLED ORDERS
                    const localOrders = await syncService.getPendingReceipts();
                    allOrders = localOrders.filter(order => order.status === 'unpaid');
                    console.log('📱 Fallback to local orders:', allOrders.length);
                }
            }

            setOrders(allOrders);
            console.log('✅ Final loaded orders:', allOrders.length);

        } catch (error) {
            console.error('❌ Error loading orders:', error);
            // Final fallback - try to get from local storage and filter out paid and cancelled orders
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

    // Filter orders based on selected order type
    const filteredOrders = orders.filter(order => {
        if (selectedOrderType === 'all') return true;
        return order.orderType === selectedOrderType;
    });

    const updateOrderStatus = async (orderId: string, newStatus: 'paid' | 'cancelled') => {
        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            // UPDATE BOTH FIREBASE AND LOCAL STORAGE REGARDLESS OF MODE
            console.log('🔄 Updating order status:', orderId, newStatus);

            // 1. Always update local storage
            console.log('📱 Updating local storage...');
            const pendingReceipts = await syncService.getItem('pendingReceipts');
            const localOrders: OrderData[] = pendingReceipts ? JSON.parse(pendingReceipts) : [];
            const updatedLocalOrders = localOrders.map(order =>
                order.orderId === orderId ? { ...order, status: newStatus } : order
            );
            await syncService.setItem('pendingReceipts', JSON.stringify(updatedLocalOrders));
            console.log('✅ Local storage updated');

            // 2. Update Firebase if online
            if (connectionMode === 'online') {
                console.log('🔥 Updating Firebase...');

                // Find the order to get its Firebase ID
                const orderToUpdate = orders.find(order => order.orderId === orderId);

                if (orderToUpdate && orderToUpdate.firebaseId) {
                    const orderDoc = doc(db, 'orders', orderToUpdate.firebaseId);

                    await updateDoc(orderDoc, {
                        status: newStatus,
                        updated_at: new Date().toISOString()
                    });

                    console.log('✅ Firebase updated');
                } else {
                    console.log('⚠️ Order not found in Firebase, local storage updated only');
                }
            }

            // 3. Remove the order from local state
            setOrders(prev => prev.filter(order => order.orderId !== orderId));

            Alert.alert('Success', `Order marked as ${newStatus}`);
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
        return items.length > 0 ? items[0].name : 'No items';
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
                                    <ThemedText style={[
                                        styles.orderTypeFilterText,
                                        selectedOrderType === 'all' && styles.orderTypeFilterTextActive
                                    ]}>
                                        ALL
                                    </ThemedText>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.orderTypeFilterButton,
                                        selectedOrderType === 'dine-in' && styles.orderTypeFilterButtonActive
                                    ]}
                                    onPress={() => setSelectedOrderType('dine-in')}
                                >
                                    <Feather name="coffee" size={14} color={selectedOrderType === 'dine-in' ? '#FFFEEA' : '#874E3B'} />
                                    <ThemedText style={[
                                        styles.orderTypeFilterText,
                                        selectedOrderType === 'dine-in' && styles.orderTypeFilterTextActive
                                    ]}>
                                        DINE IN
                                    </ThemedText>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[
                                        styles.orderTypeFilterButton,
                                        selectedOrderType === 'take-out' && styles.orderTypeFilterButtonActive
                                    ]}
                                    onPress={() => setSelectedOrderType('take-out')}
                                >
                                    <Feather name="shopping-bag" size={14} color={selectedOrderType === 'take-out' ? '#FFFEEA' : '#874E3B'} />
                                    <ThemedText style={[
                                        styles.orderTypeFilterText,
                                        selectedOrderType === 'take-out' && styles.orderTypeFilterTextActive
                                    ]}>
                                        TAKE OUT
                                    </ThemedText>
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
                                filteredOrders.map((order) => (
                                    <TouchableOpacity
                                        key={order.orderId}
                                        style={styles.orderCard}
                                        onPress={() => openActionModal(order)}
                                    >
                                        {/* Order Header */}
                                        <ThemedView style={styles.orderHeader}>
                                            <ThemedText style={styles.orderId}>
                                                #{order.orderId.slice(-4)}
                                            </ThemedText>
                                            <ThemedView style={[styles.statusBadge, { backgroundColor: 'green' }]}>
                                                <ThemedText style={styles.statusText}>
                                                    PAID
                                                </ThemedText>
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

                                        {/* Customer Name */}
                                        <ThemedText style={styles.customerName} numberOfLines={1}>
                                            {order.customerName}
                                        </ThemedText>

                                        {/* Order Time */}
                                        <ThemedText style={styles.orderTime}>
                                            {formatTime(order.timestamp)}
                                        </ThemedText>

                                        {/* Main Item Display */}
                                        <ThemedView style={styles.itemDisplay}>
                                            <ThemedText style={styles.mainItem} numberOfLines={2}>
                                                {getFirstItemName(order.items)}
                                            </ThemedText>
                                            {order.items.length > 1 && (
                                                <ThemedText style={styles.additionalItems}>
                                                    +{order.items.length - 1} more
                                                </ThemedText>
                                            )}
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
                                            Order #{selectedOrder?.orderId}
                                        </ThemedText>
                                        {selectedOrder?.orderType && (
                                            <ThemedView style={[
                                                styles.modalOrderTypeBadge,
                                                { backgroundColor: getOrderTypeColor(selectedOrder.orderType) }
                                            ]}>
                                                <Feather
                                                    name={getOrderTypeIcon(selectedOrder.orderType)}
                                                    size={12}
                                                    color="#FFFEEA"
                                                />
                                                <ThemedText style={styles.modalOrderTypeText}>
                                                    {selectedOrder.orderType === 'take-out' ? 'TAKE OUT' : 'DINE IN'}
                                                </ThemedText>
                                            </ThemedView>
                                        )}
                                    </ThemedView>
                                    <TouchableOpacity onPress={closeActionModal}>
                                        <Feather name="x" size={24} color="#874E3B" />
                                    </TouchableOpacity>
                                </ThemedView>

                                <ThemedView style={styles.modalContent}>
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

                                    {/* Cups Used Section for Take Out Orders */}
                                    {selectedOrder?.orderType === 'take-out' && selectedOrder.cupsUsed && selectedOrder.cupsUsed > 0 && (
                                        <ThemedView style={styles.cupsSection}>
                                            <ThemedText style={styles.cupsLabel}>Cups Used:</ThemedText>
                                            <ThemedText style={styles.cupsInfo}>
                                                {selectedOrder.cupsUsed}
                                            </ThemedText>
                                        </ThemedView>
                                    )}

                                    <ThemedView style={styles.itemsSection}>
                                        <ThemedText style={styles.itemsLabel}>Items:</ThemedText>
                                        {selectedOrder?.items.map((item, index) => (
                                            <ThemedView key={index} style={styles.itemRow}>
                                                <ThemedText style={styles.itemName}>
                                                    {item.name}
                                                </ThemedText>
                                                <ThemedText style={styles.itemQuantity}>
                                                    x{item.quantity}
                                                </ThemedText>
                                            </ThemedView>
                                        ))}
                                    </ThemedView>

                                    <ThemedView style={styles.totalSectionModal}>
                                        <ThemedText style={styles.totalLabelModal}>Total Amount:</ThemedText>
                                        <ThemedText style={styles.totalAmount}>
                                            ₱{selectedOrder?.total.toFixed(2)}
                                        </ThemedText>
                                    </ThemedView>

                                    <ThemedView style={styles.actionButtons}>
                                        <TouchableOpacity
                                            style={[styles.actionButtonModal, styles.paidButton]}
                                            onPress={() => selectedOrder && updateOrderStatus(selectedOrder.orderId, 'paid')}
                                        >
                                            <Feather name="check-circle" size={20} color="#FFFEEA" />
                                            <ThemedText style={styles.actionButtonTextModal}>DONE</ThemedText>
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
    customerName: {
        fontSize: 20,
        fontWeight: '600',
        color: '#5A3921',
        marginBottom: 2,
    },
    orderTime: {
        fontSize: 15,
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
        marginBottom: 16,
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
    itemsLabel: {
        fontSize: 14,
        color: '#8B7355',
        marginBottom: 8,
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
    },
    itemQuantity: {
        fontSize: 14,
        fontWeight: '600',
        color: '#874E3B',
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
});