// app/(tabs)/log.tsx
import { useState, useEffect } from 'react';
import {
    StyleSheet,
    ScrollView,
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
    query,
    where,
    orderBy,
    deleteDoc,
    doc
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
    const [filter, setFilter] = useState<'all' | 'paid'>('all'); // Remove 'cancelled' from filter

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
                // Load from local storage - PAID ORDERS ONLY
                console.log('📱 Loading paid orders from local storage...');
                const localOrders = await syncService.getPendingReceipts();
                allOrders = localOrders.filter(order => order.status === 'paid'); // Paid only
                console.log('📱 Local paid orders loaded:', allOrders.length);
            } else {
                // Load from Firebase Firestore - PAID ORDERS ONLY
                try {
                    console.log('🔥 Loading paid orders from Firebase...');

                    // Query orders collection where status is 'paid' ONLY
                    const ordersCollection = collection(db, 'orders');
                    const ordersQuery = query(
                        ordersCollection,
                        where('status', '==', 'paid'), // Paid only
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
                    console.log('🔥 Firebase paid orders loaded:', allOrders.length);

                } catch (firebaseError) {
                    console.log('⚠️ Failed to load from Firebase, falling back to local storage:', firebaseError);

                    // Fallback to local storage - PAID ORDERS ONLY
                    const localOrders = await syncService.getPendingReceipts();
                    allOrders = localOrders.filter(order => order.status === 'paid'); // Paid only
                    console.log('📱 Fallback to local paid orders:', allOrders.length);
                }
            }

            // Sort by timestamp (newest first)
            allOrders.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setOrders(allOrders);
            console.log('✅ Final loaded paid orders:', allOrders.length);

        } catch (error) {
            console.error('❌ Error loading orders:', error);
            // Final fallback - try to get from local storage - PAID ORDERS ONLY
            try {
                const syncService = OfflineSyncService.getInstance();
                const localOrders = await syncService.getPendingReceipts();
                const filteredOrders = localOrders.filter(order => order.status === 'paid'); // Paid only
                filteredOrders.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                setOrders(filteredOrders);
                console.log('📱 Emergency fallback to local paid orders:', filteredOrders.length);
            } catch (fallbackError) {
                console.error('❌ Emergency fallback failed:', fallbackError);
                setOrders([]); // Set empty array as final fallback
            }
        } finally {
            setLoading(false);
        }
    };

    // Add delete function for both Firebase and Local
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
                                    const ordersSnapshot = await getDocs(ordersCollection);

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
            default: return '#D97706';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'paid': return 'check-circle';
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
        return items.length > 0 ? items[0].name : 'No items';
    };

    const getTotalItems = (items: any[]) => {
        return items.reduce((total, item) => total + (item.quantity || 1), 0);
    };

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

                            {/* Filter Buttons - PAID ONLY */}

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
                                            ? 'No paid orders yet'
                                            : 'No paid orders found'}
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
                                                #{order.orderId.slice(-4)}
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
                                            {order.items.length > 1 && (
                                                <ThemedText style={styles.additionalItems}>
                                                    +{order.items.length - 1} more items
                                                </ThemedText>
                                            )}
                                            <ThemedText style={styles.totalItems}>
                                                {getTotalItems(order.items)} total items
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
                                    <ThemedView>
                                        <ThemedText style={styles.modalTitle}>
                                            Order #{selectedOrder?.orderId}
                                        </ThemedText>
                                        <ThemedView style={[styles.modalStatusBadge, { backgroundColor: getStatusColor(selectedOrder?.status || '') }]}>
                                            <Feather name={getStatusIcon(selectedOrder?.status || '')} size={14} color="#FFFEEA" />
                                            <ThemedText style={styles.modalStatusText}>
                                                {selectedOrder?.status.toUpperCase()}
                                            </ThemedText>
                                        </ThemedView>
                                    </ThemedView>
                                    <TouchableOpacity onPress={closeOrderModal}>
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
                                        <ThemedText style={styles.timeLabel}>Date & Time:</ThemedText>
                                        <ThemedText style={styles.timeInfo}>
                                            {selectedOrder ? formatDateTime(selectedOrder.timestamp) : ''}
                                        </ThemedText>
                                    </ThemedView>

                                    <ThemedView style={styles.itemsSection}>
                                        <ThemedText style={styles.itemsLabel}>Order Items:</ThemedText>
                                        {selectedOrder?.items.map((item, index) => (
                                            <ThemedView key={index} style={styles.itemRow}>
                                                <ThemedView style={styles.itemInfo}>
                                                    <ThemedText style={styles.itemName}>
                                                        {item.name}
                                                    </ThemedText>
                                                    <ThemedText style={styles.itemPrice}>
                                                        ₱{item.price ? item.price.toFixed(2) : '0.00'}
                                                    </ThemedText>
                                                </ThemedView>
                                                <ThemedView style={styles.quantitySection}>
                                                    <ThemedText style={styles.itemQuantity}>
                                                        x{item.quantity}
                                                    </ThemedText>
                                                    <ThemedText style={styles.itemTotal}>
                                                        ₱{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                                                    </ThemedText>
                                                </ThemedView>
                                            </ThemedView>
                                        ))}
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
                </ThemedView>
            </ImageBackground>
        </ThemedView>
    );
}

// Updated styles to include new buttons
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
        padding: 20,
    },
    orderModal: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#FFFEEA',
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#D4A574',
        overflow: 'hidden',
        maxHeight: '80%',
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
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#874E3B',
        fontFamily: 'LobsterTwoRegular',
        marginBottom: 4,
    },
    modalStatusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        alignSelf: 'flex-start',
    },
    modalStatusText: {
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
    totalAmount: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#874E3B',
    },
});