// app/(tabs)/pos.tsx
import { useState, useEffect } from 'react';
import {
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ImageBackground,
    Alert,
    Image,
    Animated,
    Text,
    Modal
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
    addDoc,
    updateDoc,
    doc,
    query,
    where
} from 'firebase/firestore';
import { app } from '@/lib/firebase-config';
import BleManager from 'react-native-ble-manager';

interface MenuItem {
    id: string;
    code: string;
    name: string;
    price: number;
    quantity: number;
    category: string;
    stocks: number;
    status: boolean;
    image?: string | any;
    isOffline?: boolean;
    firebaseId?: string;
    image_base64?: string;
    sales?: number;
    cupName?: string;
}

interface Category {
    id: string;
    name: string;
    icon?: string;
    items_count?: number;
    isOffline?: boolean;
    firebaseId?: string;
}

interface ReceiptData {
    orderId: string;
    customerName: string;
    items: MenuItem[];
    subtotal: number;
    total: number;
    timestamp: string;
    status: 'unpaid' | 'paid' | 'cancelled';
    firebaseId?: string;
    cupsUsed?: number;
    orderType: 'dine-in' | 'take-out';
    notes?: string; // ADDED: notes/comment field
}

interface CupItem {
    id: string;
    name: string;
    stocks: number;
    size?: string;
    status?: boolean;
    isOffline?: boolean;
    firebaseId?: string;
    syncStatus?: string;
    lastUpdated?: number;
    lastSynced?: number;
}

interface PendingItem {
    id: string;
    type: 'CREATE_ITEM' | 'UPDATE_ITEM' | 'DELETE_ITEM' | 'CREATE_CATEGORY' | 'UPDATE_CATEGORY' | 'DELETE_CATEGORY' | 'CREATE_CUP' | 'UPDATE_CUP' | 'DELETE_CUP' | 'CREATE_ORDER' | 'UPDATE_ORDER';
    data: any;
    timestamp: number;
    retryCount: number;
    serverId?: string;
}

interface BluetoothConnection {
    connected: boolean;
    deviceName: string;
    peripheralId: string;
    serviceId: string;
    connectedAt: string | null;
}

// Order Summary Modal Component - MOVED OUTSIDE to prevent re-renders
const OrderSummaryModal = ({ 
    visible, 
    onClose, 
    customerName, 
    setCustomerName, 
    cart, 
    subtotal, 
    total, 
    orderType, 
    updateQuantity, 
    clearCart, 
    placeOrder, 
    loading, 
    isProcessingOrder,
    isBluetoothConnected,
    notes,           // ADDED: notes prop
    setNotes         // ADDED: setNotes prop
}: { 
    visible: boolean;
    onClose: () => void;
    customerName: string;
    setCustomerName: (name: string) => void;
    cart: MenuItem[];
    subtotal: number;
    total: number;
    orderType: 'dine-in' | 'take-out' | null;
    updateQuantity: (id: string, quantity: number) => void;
    clearCart: () => void;
    placeOrder: () => void;
    loading: boolean;
    isProcessingOrder: boolean;
    isBluetoothConnected: boolean;
    notes: string;           // ADDED: notes type
    setNotes: (notes: string) => void;  // ADDED: setNotes type
}) => (
    <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={onClose}
        statusBarTranslucent={true}
    >
        <ThemedView style={styles.modalOverlay}>
            <ThemedView style={styles.orderSummaryModal}>
                <ThemedView style={styles.modalHeader}>
                    <ThemedView style={styles.modalTitleContainer}>
                        <ThemedText style={styles.modalTitle}>Order Summary</ThemedText>
                        {/* Bluetooth Icon next to title */}
                        {isBluetoothConnected ? (
                            <Feather name="bluetooth" size={18} color="#007AFF" style={styles.headerBluetoothIcon} />
                        ) : (
                            <Feather name="bluetooth" size={18} color="#DC2626" style={styles.headerBluetoothIcon} />
                        )}
                    </ThemedView>
                    <TouchableOpacity
                        style={styles.closeModalButton}
                        onPress={onClose}
                    >
                        <Feather name="x" size={24} color="#854442" />
                    </TouchableOpacity>
                </ThemedView>

                {/* Customer Name Input */}
                <ThemedView style={styles.customerInputContainer}>
                    <ThemedText style={styles.inputLabel}>Customer Name:</ThemedText>
                    <TextInput
                        style={styles.customerInput}
                        value={customerName}
                        onChangeText={setCustomerName}
                        placeholder="Enter customer name"
                        placeholderTextColor="#854442"
                    />
                </ThemedView>

                {/* ADDED: Notes/Comment Input */}
                <ThemedView style={styles.notesInputContainer}>
                    <ThemedText style={styles.inputLabel}>Comment:</ThemedText>
                    <TextInput
                        style={styles.notesInput}
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="Add special instructions or notes..."
                        placeholderTextColor="#854442"
                        multiline={true}
                        numberOfLines={3}
                        textAlignVertical="top"
                    />
                </ThemedView>

                {/* Order Table Header */}
                <ThemedView style={styles.tableHeader}>
                    <ThemedText style={[styles.headerText, styles.itemHeader]}>Item</ThemedText>
                    <ThemedText style={[styles.headerText, styles.priceHeader]}>Price</ThemedText>
                    <ThemedText style={[styles.headerText, styles.qtyHeader]}>Qnt.</ThemedText>
                    <ThemedText style={[styles.headerText, styles.totalHeader]}>Total (₱)</ThemedText>
                </ThemedView>

                {/* Order Items List - INCREASED HEIGHT */}
                <ScrollView style={styles.orderListExpanded}>
                    {cart.length === 0 ? (
                        <ThemedView style={styles.emptyCartExpanded}>
                            <Feather name="shopping-cart" size={48} color="#D4A574" />
                            <ThemedText style={styles.emptyCartText}>No items in cart</ThemedText>
                            <ThemedText style={styles.emptyCartSubText}>
                                {orderType ? 'Tap on menu items to add them' : 'Select order type first'}
                            </ThemedText>
                        </ThemedView>
                    ) : (
                        cart.map((item, index) => (
                            <ThemedView key={`${item.id}-${index}`} style={styles.orderRow}>
                                <ThemedText style={[styles.cellText, styles.itemCell]} numberOfLines={2}>
                                    {item.name} {item.isOffline && '📱'}
                                </ThemedText>
                                <ThemedText style={[styles.cellText, styles.priceCell]}>₱{item.price.toFixed(2)}</ThemedText>
                                <ThemedView style={styles.qtyCell}>
                                    <TouchableOpacity
                                        style={styles.qtyButton}
                                        onPress={() => updateQuantity(item.id, item.quantity - 1)}
                                    >
                                        <Feather name="minus" size={12} color="#874E3B" />
                                    </TouchableOpacity>
                                    <ThemedText style={styles.qtyText}>{item.quantity}</ThemedText>
                                    <TouchableOpacity
                                        style={styles.qtyButton}
                                        onPress={() => updateQuantity(item.id, item.quantity + 1)}
                                    >
                                        <Feather name="plus" size={12} color="#874E3B" />
                                    </TouchableOpacity>
                                </ThemedView>
                                <ThemedText style={[styles.cellText, styles.totalCell]}>
                                    ₱{(item.price * item.quantity).toFixed(2)}
                                </ThemedText>
                            </ThemedView>
                        ))
                    )}
                </ScrollView>

                {/* Totals Section */}
                <ThemedView style={styles.totalsSection}>
                    <ThemedView style={styles.totalRow}>
                        <ThemedText style={styles.totalLabel}>Sub total</ThemedText>
                        <ThemedText style={styles.totalValue}>₱{subtotal.toFixed(2)}</ThemedText>
                    </ThemedView>
                    <ThemedView style={styles.totalRow}>
                        <ThemedText style={styles.totalLabel}>Other Charge</ThemedText>
                        <ThemedText style={styles.totalValue}>₱0.00</ThemedText>
                    </ThemedView>
                    <ThemedView style={[styles.totalRow, styles.grandTotal]}>
                        <ThemedText style={styles.grandTotalLabel}>Amount to Pay</ThemedText>
                        <ThemedText style={styles.grandTotalValue}>₱{total.toFixed(2)}</ThemedText>
                    </ThemedView>
                </ThemedView>

                {/* Action Buttons */}
                <ThemedView style={styles.actionButtons}>
                    <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={() => {
                            clearCart();
                            onClose();
                        }}
                        disabled={loading || isProcessingOrder}
                    >
                        <ThemedText style={styles.cancelButtonText}>
                            {isProcessingOrder ? 'Processing...' : 'Cancel & Reset'}
                        </ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.placeOrderButton, (loading || isProcessingOrder) && styles.placeOrderButtonDisabled]}
                        onPress={placeOrder}
                        disabled={loading || isProcessingOrder || cart.length === 0 || !orderType}
                    >
                        <ThemedText style={styles.placeOrderButtonText}>
                            {isProcessingOrder ? 'Processing...' : 'Place Order'}
                        </ThemedText>
                    </TouchableOpacity>
                </ThemedView>
            </ThemedView>
        </ThemedView>
    </Modal>
);

export default function PosScreen() {
    const [searchQuery, setSearchQuery] = useState('');
    const [cart, setCart] = useState<MenuItem[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOnlineMode, setIsOnlineMode] = useState<boolean>(false);
    const [customerName, setCustomerName] = useState('');
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [currentReceipt, setCurrentReceipt] = useState<ReceiptData | null>(null);
    const [isProcessingOrder, setIsProcessingOrder] = useState(false);
    const [spinAnim] = useState(new Animated.Value(0));
    const [cupCount, setCupCount] = useState(0);
    const [orderType, setOrderType] = useState<'dine-in' | 'take-out' | null>(null);
    const [isBluetoothConnected, setIsBluetoothConnected] = useState<boolean>(false);
    const [bluetoothDeviceName, setBluetoothDeviceName] = useState<string>('');
    const [bluetoothConnection, setBluetoothConnection] = useState<BluetoothConnection | null>(null);
    const [isOrderSummaryVisible, setIsOrderSummaryVisible] = useState(false);
    const [notes, setNotes] = useState<string>(''); // ADDED: notes state

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

    // Spinning animation effect
    useEffect(() => {
        if (isProcessingOrder) {
            Animated.loop(
                Animated.timing(spinAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                })
            ).start();
        } else {
            spinAnim.setValue(0);
        }
    }, [isProcessingOrder]);

    const spin = spinAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });

    // Function to get connection mode
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

    const loadMenuItems = async () => {
        setLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            if (connectionMode === 'offline') {
                console.log('📱 POS Loading OFFLINE data (local storage)...');

                const offlineItems = await syncService.getItems();
                const allOfflineItems = [...offlineItems];

                const posItems: MenuItem[] = allOfflineItems
                    .filter(item => item.status === true || item.status === '1' || item.status === 1)
                    .map(item => ({
                        ...item,
                        quantity: 0,
                        stocks: Number(item.stocks || 0),
                        status: true,
                        isOffline: true,
                        sales: item.sales || 0,
                        cupName: item.cupName || ''
                    }));

                setMenuItems(posItems);
                console.log('✅ POS Loaded OFFLINE items:', posItems.length, 'items');
                return;
            }

            console.log('🔥 POS Fetching from FIREBASE (ONLINE MODE)...');

            // Fetch active items from Firebase
            const itemsCollection = collection(db, 'items');
            const itemsQuery = query(itemsCollection, where('status', '==', true));
            const itemsSnapshot = await getDocs(itemsQuery);

            const firebaseItems: MenuItem[] = itemsSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    code: data.code || '',
                    name: data.name || '',
                    price: Number(data.price || 0),
                    category: data.category || 'Uncategorized',
                    stocks: Number(data.stocks || 0),
                    quantity: 0,
                    status: true,
                    image_base64: data.image_base64 || null,
                    has_image: data.has_image || false,
                    isOffline: false,
                    firebaseId: doc.id,
                    sales: Number(data.sales || 0),
                    cupName: data.cupName || ''
                };
            });

            setMenuItems(firebaseItems);
            console.log('✅ POS Loaded FIREBASE items:', firebaseItems.length, 'active items');

        } catch (error) {
            console.error('❌ Error loading menu items:', error);

            // Fallback to local storage
            const syncService = OfflineSyncService.getInstance();
            const offlineItems = await syncService.getItems();
            const offlinePosItems: MenuItem[] = offlineItems
                .filter(item => item.status === true || item.status === '1' || item.status === 1)
                .map(item => ({
                    ...item,
                    quantity: 0,
                    stocks: Number(item.stocks || 0),
                    status: true,
                    isOffline: true,
                    sales: item.sales || 0,
                    cupName: item.cupName || ''
                }));

            setMenuItems(offlinePosItems);
            setIsOnlineMode(false);
        } finally {
            setLoading(false);
        }
    };

    const loadCategories = async () => {
        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            if (connectionMode === 'offline') {
                console.log('📱 POS Loading OFFLINE categories (local storage)...');

                const offlineCategories = await syncService.getLocalCategories();

                const uniqueCategories = offlineCategories.filter((category, index, self) =>
                    index === self.findIndex((c) => c.name === category.name)
                );

                const allCategories: Category[] = [
                    { id: 'all', name: 'All', icon: 'grid', items_count: 0 },
                    ...uniqueCategories.map(cat => ({
                        ...cat,
                        isOffline: true
                    }))
                ];

                setCategories(allCategories);
                console.log('✅ POS Loaded OFFLINE categories:', allCategories.length, 'categories');
                return;
            }

            console.log('🔥 POS Fetching categories from FIREBASE (ONLINE MODE)...');

            // Fetch categories from Firebase
            const categoriesCollection = collection(db, 'categories');
            const categoriesSnapshot = await getDocs(categoriesCollection);

            const firebaseCategories: Category[] = categoriesSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name || '',
                    icon: data.icon || 'folder',
                    items_count: data.items_count || 0,
                    isOffline: false,
                    firebaseId: doc.id
                };
            });

            // Also get local categories for fallback
            const offlineCategories = await syncService.getLocalCategories();

            const allCategoriesRaw = [
                ...firebaseCategories,
                ...offlineCategories.map(cat => ({
                    ...cat,
                    isOffline: true
                }))
            ];

            const uniqueCategories = allCategoriesRaw.filter((category, index, self) =>
                index === self.findIndex((c) => c.name === category.name)
            );

            const finalCategories: Category[] = [
                { id: 'all', name: 'All', icon: 'grid', items_count: 0 },
                ...uniqueCategories
            ];

            setCategories(finalCategories);
            console.log('✅ POS Loaded MERGED categories:', finalCategories.length, 'categories');

        } catch (error) {
            console.error('❌ Error loading categories:', error);

            // Fallback to local storage
            const syncService = OfflineSyncService.getInstance();
            const offlineCategories = await syncService.getLocalCategories();

            const uniqueCategories = offlineCategories.filter((category, index, self) =>
                index === self.findIndex((c) => c.name === category.name)
            );

            const allCategories: Category[] = [
                { id: 'all', name: 'All', icon: 'grid', items_count: 0 },
                ...uniqueCategories.map(cat => ({
                    ...cat,
                    isOffline: true
                }))
            ];

            setCategories(allCategories);
            setIsOnlineMode(false);
        }
    };

    // Function to reset everything
    const resetPOSState = () => {
        console.log('🔄 Resetting POS state...');
        setCart([]);
        setCustomerName('');
        setNotes(''); // ADDED: reset notes
        setCupCount(0);
        setOrderType(null);
        setSearchQuery('');
        setSelectedCategory('All');
        setShowReceiptModal(false);
        setCurrentReceipt(null);
        console.log('✅ POS state reset complete');
    };

    useFocusEffect(
        React.useCallback(() => {
            console.log('📍 POS Screen focused - loading data and resetting state');
            loadMenuItems();
            loadCategories();

            // CHECK AND RESET ORDER COUNTER IF NEW DAY
            checkAndResetOrderCounter();

            // RESET STATE WHEN SCREEN GETS FOCUS
            resetPOSState();

            // Clear cart when screen loses focus
            return () => {
                console.log('📍 POS Screen unfocused - clearing cart');
                setCart([]);
                setCustomerName('');
                setNotes(''); // ADDED: reset notes on unfocus
                setCupCount(0);
                setIsOrderSummaryVisible(false);
            };
        }, [])
    );

    const filteredItems = menuItems.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        (selectedCategory === 'All' || item.category === selectedCategory) &&
        item.status === true
    );

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal;

    const addToCart = (item: MenuItem) => {
        if (!orderType) {
            Alert.alert('Select Order Type', 'Please select Dine In or Take Out first!');
            return;
        }

        const currentStock = menuItems.find(menuItem => menuItem.id === item.id)?.stocks || 0;
        const currentInCart = cart.find(cartItem => cartItem.id === item.id)?.quantity || 0;

        if (currentInCart >= currentStock) {
            Alert.alert('Out of Stock', `No more ${item.name} available!`);
            return;
        }

        // Check if item requires cup - ONLY FOR TAKE OUT ORDERS
        const requiresCup = orderType === 'take-out' && checkItemRequiresCup(item);

        // Update stocks
        setMenuItems(prev => prev.map(menuItem =>
            menuItem.id === item.id
                ? { ...menuItem, stocks: menuItem.stocks - 1 }
                : menuItem
        ));

        // Add to cart
        setCart(prev => {
            const existing = prev.find(cartItem => cartItem.id === item.id);
            if (existing) {
                return prev.map(cartItem =>
                    cartItem.id === item.id
                        ? { ...cartItem, quantity: cartItem.quantity + 1 }
                        : cartItem
                );
            }
            return [...prev, { ...item, quantity: 1 }];
        });

        // If item requires cup AND it's take out, increment cup count
        if (requiresCup) {
            setCupCount(prev => prev + 1);
        }
    };

    const removeFromCart = (id: string) => {
        const cartItem = cart.find(item => item.id === id);
        const menuItem = menuItems.find(item => item.id === id);

        if (cartItem) {
            const requiresCup = menuItem ? (orderType === 'take-out' && checkItemRequiresCup(menuItem)) : false;

            // Update cup count if item requires cup and it's take out
            if (requiresCup) {
                setCupCount(prev => Math.max(0, prev - cartItem.quantity));
            }

            setMenuItems(prev => prev.map(menuItem =>
                menuItem.id === id
                    ? { ...menuItem, stocks: menuItem.stocks + cartItem.quantity }
                    : menuItem
            ));
        }
        setCart(prev => prev.filter(item => item.id !== id));
    };

    const updateQuantity = (id: string, newQuantity: number) => {
        const cartItem = cart.find(item => item.id === id);
        const menuItem = menuItems.find(item => item.id === id);

        if (!cartItem || !menuItem) return;

        const quantityDifference = newQuantity - cartItem.quantity;
        const requiresCup = orderType === 'take-out' && checkItemRequiresCup(menuItem);

        if (newQuantity === 0) {
            removeFromCart(id);
            return;
        }

        if (quantityDifference > 0 && menuItem.stocks < quantityDifference) {
            Alert.alert('Out of Stock', 'Not enough stock available!');
            return;
        }

        setMenuItems(prev => prev.map(item =>
            item.id === id
                ? { ...item, stocks: item.stocks - quantityDifference }
                : item
        ));

        setCart(prev => prev.map(item =>
            item.id === id ? { ...item, quantity: newQuantity } : item
        ));

        // Update cup count if item requires cup and it's take out
        if (requiresCup) {
            setCupCount(prev => prev + quantityDifference);
        }
    };

    const clearCart = () => {
        cart.forEach(cartItem => {
            setMenuItems(prev => prev.map(menuItem =>
                menuItem.id === cartItem.id
                    ? { ...menuItem, stocks: menuItem.stocks + cartItem.quantity }
                    : menuItem
            ));
        });
        setCart([]);
        setCustomerName('');
        setNotes(''); // ADDED: clear notes
        setCupCount(0);
    };

    // Function to reset everything after order completion
    const resetAfterOrder = () => {
        console.log('🔄 Resetting after order completion...');
        setCart([]);
        setCustomerName('');
        setNotes(''); // ADDED: reset notes after order
        setCupCount(0);
        setOrderType(null);
        setShowReceiptModal(false);
        setCurrentReceipt(null);
        setIsOrderSummaryVisible(false);

        // Reload menu items to reflect updated stocks
        loadMenuItems();
        console.log('✅ Reset after order complete');
    };

    // Update item stocks and sales in Firebase
    const updateItemStocksAndSales = async (itemId: string, newStocks: number, quantitySold: number) => {
        try {
            const connectionMode = await getConnectionMode();

            if (connectionMode === 'online') {
                const item = menuItems.find(item => item.id === itemId);

                if (item && item.firebaseId) {
                    const itemDoc = doc(db, 'items', item.firebaseId);
                    const currentSales = item.sales || 0;

                    await updateDoc(itemDoc, {
                        stocks: newStocks,
                        sales: currentSales + quantitySold,
                        updated_at: new Date().toISOString()
                    });

                    console.log('✅ Updated Firebase item:', item.name, {
                        newStocks: newStocks,
                        sales: currentSales + quantitySold
                    });
                }
            }
        } catch (error) {
            console.error('❌ Error updating Firebase item:', error);
        }
    };

    // Function to generate sequential order numbers that reset at 12 AM
    const generateSequentialOrderNumber = async (): Promise<string> => {
        try {
            const syncService = OfflineSyncService.getInstance();

            // Get current date for daily reset
            const now = new Date();
            const today = now.toDateString();

            // Get last order info from local storage
            const lastOrderInfo = await syncService.getItem('lastOrderInfo');

            let lastOrderNumber = 0;
            let lastOrderDate = '';

            if (lastOrderInfo) {
                const info = JSON.parse(lastOrderInfo);
                lastOrderNumber = info.number || 0;
                lastOrderDate = info.date || '';
            }

            // Reset counter if it's a new day
            if (lastOrderDate !== today) {
                lastOrderNumber = 0;
            }

            // Increment order number
            const newOrderNumber = lastOrderNumber + 1;

            // Save updated order info
            await syncService.setItem('lastOrderInfo', JSON.stringify({
                number: newOrderNumber,
                date: today
            }));

            // Format order number with leading zeros (001, 002, etc.)
            return `ORD-${newOrderNumber.toString().padStart(2, '0')}`;

        } catch (error) {
            console.error('❌ Error generating sequential order number:', error);
            // Fallback to timestamp-based ID
            return `ORD-${Date.now()}`;
        }
    };

    // Function to check if we need to reset the order counter
    const checkAndResetOrderCounter = async (): Promise<void> => {
        try {
            const syncService = OfflineSyncService.getInstance();
            const lastOrderInfo = await syncService.getItem('lastOrderInfo');

            if (lastOrderInfo) {
                const info = JSON.parse(lastOrderInfo);
                const lastDate = info.date || '';
                const today = new Date().toDateString();

                // Reset if it's a new day
                if (lastDate !== today) {
                    await syncService.setItem('lastOrderInfo', JSON.stringify({
                        number: 0,
                        date: today
                    }));
                    console.log('🔄 Order counter reset for new day:', today);
                }
            }
        } catch (error) {
            console.error('❌ Error checking order counter reset:', error);
        }
    };

    const placeOrder = async () => {
        if (!orderType) {
            Alert.alert('Select Order Type', 'Please select Dine In or Take Out first!');
            return;
        }

        if (cart.length === 0) {
            Alert.alert('Empty Cart', 'Please add items to cart first!');
            return;
        }

        if (!customerName.trim()) {
            Alert.alert('Customer Name Required', 'Please enter customer name for the receipt');
            return;
        }

        setLoading(true);
        setIsProcessingOrder(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();
            const orderNumber = await generateSequentialOrderNumber();

            const receiptData: ReceiptData = {
                orderId: orderNumber,
                customerName: customerName.trim(),
                items: [...cart],
                subtotal: subtotal,
                total: total,
                timestamp: new Date().toISOString(),
                status: 'unpaid',
                cupsUsed: orderType === 'take-out' ? cupCount : 0,
                orderType: orderType,
                notes: notes.trim() || '' // ADDED: include notes in receipt data
            };

            console.log('🔄 [FIREBASE ORDER] Starting order process...');
            console.log('🌐 Current Mode:', connectionMode === 'offline' ? 'OFFLINE' : 'ONLINE');
            console.log('🥤 Total cups used in this order:', cupCount);
            console.log('📝 Order Type:', orderType);
            console.log('📝 Order Notes:', notes); // ADDED: log notes

            // STEP 1: ALWAYS SAVE TO LOCAL STORAGE FIRST
            console.log('💾 Step 1: Saving to LOCAL storage...');
            const existingReceipts = await syncService.getItem('pendingReceipts');
            const receipts = existingReceipts ? JSON.parse(existingReceipts) : [];
            receipts.push(receiptData);
            await syncService.setItem('pendingReceipts', JSON.stringify(receipts));

            console.log('✅ Step 1 COMPLETE: Saved to LOCAL storage');

            // STEP 2: UPDATE CUP STOCKS (BOTH ONLINE AND OFFLINE) - ONLY FOR TAKE OUT
            console.log('🥤 Step 2: Updating cup stocks...');
            if (orderType === 'take-out' && cupCount > 0) {
                await updateCupStocksForOrder(cupCount, connectionMode);
            }

            // STEP 3: TRY TO SAVE TO FIREBASE IF ONLINE
            if (connectionMode === 'online') {
                console.log('🔥 Step 3: Attempting to save to FIREBASE...');

                try {
                    // Save order to Firebase with notes field
                    const orderData = {
                        orderId: receiptData.orderId,
                        customerName: receiptData.customerName,
                        items: receiptData.items.map(item => ({
                            id: item.id,
                            name: item.name,
                            price: item.price,
                            quantity: item.quantity,
                            total: item.price * item.quantity
                        })),
                        subtotal: receiptData.subtotal,
                        total: receiptData.total,
                        status: receiptData.status,
                        timestamp: receiptData.timestamp,
                        created_at: new Date().toISOString(),
                        cups_used: cupCount,
                        order_type: orderType,
                        notes: receiptData.notes || '' // ADDED: save notes to Firestore
                    };

                    const docRef = await addDoc(collection(db, 'orders'), orderData);
                    const firebaseId = docRef.id;

                    console.log('✅ Step 3 COMPLETE: Saved to FIREBASE successfully:', {
                        firebaseId: firebaseId,
                        orderId: receiptData.orderId,
                        orderType: orderType,
                        notes: receiptData.notes // ADDED: confirm notes saved
                    });

                    // Update receipt data with Firebase ID
                    receiptData.firebaseId = firebaseId;

                    // STEP 4: UPDATE ITEM STOCKS AND SALES IN FIREBASE
                    console.log('📦 Step 4: Updating item stocks and sales in Firebase...');

                    for (const cartItem of cart) {
                        const currentItem = menuItems.find(item => item.id === cartItem.id);
                        if (currentItem) {
                            const newStocks = currentItem.stocks;
                            const quantitySold = cartItem.quantity;

                            // Update Firebase
                            await updateItemStocksAndSales(cartItem.id, newStocks, quantitySold);

                            console.log('✅ Updated stocks for:', cartItem.name, {
                                newStocks: newStocks,
                                quantitySold: quantitySold
                            });
                        }
                    }

                    console.log('✅ Step 4 COMPLETE: All item stocks updated in Firebase');

                    // STEP 5: UPDATE LOCAL STORAGE WITH FIREBASE INFO
                    console.log('🔄 Step 5: Updating local record with Firebase info...');
                    const updatedReceipts = receipts.map((receipt: ReceiptData) =>
                        receipt.orderId === receiptData.orderId
                            ? { ...receipt, firebaseId: firebaseId }
                            : receipt
                    );
                    await syncService.setItem('pendingReceipts', JSON.stringify(updatedReceipts));

                    console.log('✅ Step 5 COMPLETE: Local record updated with Firebase ID');

                    console.log('🎉 [FIREBASE ORDER] ORDER PROCESS COMPLETED SUCCESSFULLY!');

                } catch (firebaseError) {
                    console.error('❌ Firebase save error:', firebaseError);
                    console.log('📱 Order saved to local storage only. Firebase sync will be retried later.');
                }
            } else {
                console.log('📱 Step 3: Offline mode - Only saved to LOCAL storage');
            }

            // Show receipt modal AFTER processing is complete
            setCurrentReceipt(receiptData);
            setShowReceiptModal(true);
            setIsOrderSummaryVisible(false);

        } catch (error) {
            console.error('❌ Error placing order:', error);
            Alert.alert(
                'Order Saved Locally',
                'Order has been saved to local storage. Some server operations may have failed.'
            );

            const receiptData: ReceiptData = {
                orderId: `ORD-${Date.now()}`,
                customerName: customerName.trim(),
                items: [...cart],
                subtotal: subtotal,
                total: total,
                timestamp: new Date().toLocaleString(),
                status: 'unpaid',
                orderType: orderType!,
                notes: notes.trim() || '' // ADDED: include notes in fallback receipt
            };
            setCurrentReceipt(receiptData);
            setShowReceiptModal(true);
            setIsOrderSummaryVisible(false);
        } finally {
            setLoading(false);
            setIsProcessingOrder(false);
        }
    };

    // Function to update cup stocks when order is placed
    const updateCupStocksForOrder = async (cupsUsed: number, connectionMode: 'online' | 'offline') => {
        try {
            const syncService = OfflineSyncService.getInstance();

            console.log(`🥤 Updating cup stocks: ${cupsUsed} cups used`);

            if (connectionMode === 'online') {
                // ONLINE MODE: Update cups in Firebase
                console.log('🔥 Updating cup stocks in Firebase...');

                // Get all cups from Firebase
                const cupsCollection = collection(db, 'cups');
                const cupsSnapshot = await getDocs(cupsCollection);
                const firebaseCups: CupItem[] = cupsSnapshot.docs.map(doc => ({
                    id: doc.id,
                    firebaseId: doc.id,
                    name: doc.data().name || 'Cup',
                    stocks: doc.data().stocks || 0,
                    size: doc.data().size || '',
                    status: doc.data().status !== false,
                    isOffline: false
                }));

                if (firebaseCups.length === 0) {
                    console.log('❌ No cups found in Firebase');
                    return;
                }

                // For simplicity, use the first available cup
                const cupToUpdate = firebaseCups[0];
                const newStocks = Math.max(0, cupToUpdate.stocks - cupsUsed);

                if (newStocks < 0) {
                    console.log('❌ Not enough cup stocks available');
                    Alert.alert('Insufficient Cups', 'Not enough cups in stock!');
                    return;
                }

                // Update Firebase
                const cupDoc = doc(db, 'cups', cupToUpdate.id);
                await updateDoc(cupDoc, {
                    stocks: newStocks,
                    updated_at: new Date().toISOString()
                });

                console.log('✅ Firebase cup stocks updated:', {
                    cup: cupToUpdate.name,
                    previousStocks: cupToUpdate.stocks,
                    newStocks: newStocks,
                    cupsUsed: cupsUsed
                });

                // Also update local storage for consistency
                const localCups = await syncService.getCups();
                if (localCups.length > 0) {
                    const updatedLocalCups = localCups.map(cup =>
                        cup.id === cupToUpdate.id || cup.firebaseId === cupToUpdate.id
                            ? { ...cup, stocks: newStocks }
                            : cup
                    );
                    await syncService.saveCups(updatedLocalCups);
                    console.log('✅ Local cup stocks updated');
                }

            } else {
                // OFFLINE MODE: Update cups in local storage only
                console.log('📱 Updating cup stocks in local storage...');

                const localCups = await syncService.getCups();
                if (localCups.length === 0) {
                    console.log('❌ No cups found in local storage');
                    return;
                }

                // Use the first available cup
                const cupToUpdate = localCups[0];
                const newStocks = Math.max(0, cupToUpdate.stocks - cupsUsed);

                if (newStocks < 0) {
                    console.log('❌ Not enough cup stocks available');
                    Alert.alert('Insufficient Cups', 'Not enough cups in stock!');
                    return;
                }

                const updatedLocalCups = localCups.map(cup =>
                    cup.id === cupToUpdate.id
                        ? { ...cup, stocks: newStocks }
                        : cup
                );

                await syncService.saveCups(updatedLocalCups);

                console.log('✅ Local cup stocks updated:', {
                    cup: cupToUpdate.name,
                    previousStocks: cupToUpdate.stocks,
                    newStocks: newStocks,
                    cupsUsed: cupsUsed
                });

                // Add to pending items for Firebase sync when online
                const pendingItem: PendingItem = {
                    id: `cup_update_${Date.now()}`,
                    type: 'UPDATE_CUP',
                    data: {
                        ...cupToUpdate,
                        stocks: newStocks
                    },
                    timestamp: Date.now(),
                    retryCount: 0
                };

                const pendingItems = await syncService.getPendingItems();
                pendingItems.push(pendingItem);
                await syncService.setItem('pendingItems', JSON.stringify(pendingItems));

                console.log('📬 Cup stock update added to pending sync');
            }

        } catch (error) {
            console.error('❌ Error updating cup stocks:', error);
            Alert.alert('Warning', 'Cup stocks may not have been updated properly.');
        }
    };

    const checkItemRequiresCup = (item: MenuItem): boolean => {
        return !!item.cupName && item.cupName.trim() !== '' && item.stocks > 0;
    };

    // Function to generate compact receipt content - UPDATED to include notes
    const generateCompactReceiptContent = (receipt: ReceiptData): string => {
        const currentDate = new Date().toLocaleDateString();
        const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Create compact receipt content
        let receiptContent = `
KAPE SPOT
------------
DATE: ${currentDate}
TIME: ${currentTime}
ORDER: ${receipt.orderId}
CUSTOMER: ${receipt.customerName}
TYPE: ${receipt.orderType === 'dine-in' ? 'DINE IN' : 'TAKE OUT'}
`;

        // ADDED: Include notes on receipt if present
        if (receipt.notes && receipt.notes.trim()) {
            receiptContent += `NOTES: ${receipt.notes.substring(0, 40)}\n`;
        }

        receiptContent += `------------
`;

        // Add items in compact format
        receipt.items.forEach(item => {
            const itemName = item.name.length > 16 ? item.name.substring(0, 16) + '...' : item.name;
            receiptContent += `${itemName} x${item.quantity} ₱${(item.price * item.quantity).toFixed(2)}\n`;
        });

        receiptContent += `------------
SUBTOTAL: ₱${receipt.subtotal.toFixed(2)}
TOTAL: ₱${receipt.total.toFixed(2)}
------------
`;

        if (receipt.orderType === 'take-out' && receipt.cupsUsed && receipt.cupsUsed > 0) {
            receiptContent += `CUPS: ${receipt.cupsUsed}\n------------\n`;
        }

        receiptContent += `Thank you!`;

        return receiptContent.trim();
    };

    // Function to print receipt using connected Bluetooth printer - UPDATED FOR LARGE RECEIPTS
    const handlePrintReceipt = async () => {
        console.log('🖨️ Starting print process...');

        if (!isBluetoothConnected || !bluetoothConnection) {
            Alert.alert('Bluetooth Not Connected', 'Please connect to a Bluetooth printer first in Settings.');
            return;
        }

        if (!currentReceipt) {
            Alert.alert('No Receipt', 'No receipt data available for printing.');
            return;
        }

        try {
            const receiptContent = generateCompactReceiptContent(currentReceipt);
            console.log('📄 Compact receipt content generated, length:', receiptContent.length);

            await sendToBluetoothPrinter(receiptContent);

        } catch (error) {
            console.error('❌ Error printing receipt:', error);

            if (error instanceof Error && error.message.includes('second copy')) {
                Alert.alert('Print Partially Complete', 'First copy printed successfully!');
                resetAfterOrder();
            } else {
                Alert.alert('Print Error', 'Failed to print receipt. Please check printer connection.');
            }
        }
    };

    // Function to send data to Bluetooth printer - UPDATED WITH CHUNKING FOR LARGE RECEIPTS
    const sendToBluetoothPrinter = async (data: string) => {
        try {
            if (!bluetoothConnection) {
                throw new Error('No Bluetooth connection available');
            }

            // Get the Bluetooth service instance from storage
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
                deviceName: bluetoothDeviceName
            });

            // IMPORTANT: Check if BleManager is ready
            try {
                await BleManager.checkState();
                console.log('✅ BleManager is ready');
            } catch (bleError) {
                console.error('❌ BleManager not ready:', bleError);
                await BleManager.start({ showAlert: false });
                console.log('✅ BleManager started');
            }

            // Thermal printer commands for ESC/POS
            const initializePrinter = [0x1B, 0x40]; // Initialize
            const textNormal = [0x1B, 0x21, 0x00]; // Normal text
            const centerAlign = [0x1B, 0x61, 0x01]; // Center alignment
            const leftAlign = [0x1B, 0x61, 0x00]; // Left alignment
            const lineFeed = [0x0A]; // Line feed
            const paperCut = [0x1D, 0x56, 0x41, 0x10]; // Paper cut

            // Split data into chunks to avoid buffer overflow
            const chunkSize = 100; // Adjust based on your printer's capacity
            const dataChunks = [];

            for (let i = 0; i < data.length; i += chunkSize) {
                dataChunks.push(data.substring(i, i + chunkSize));
            }

            console.log(`📄 Data split into ${dataChunks.length} chunks`);

            // Convert text to bytes
            const convertToBytes = (text: string): number[] => {
                return Array.from(new TextEncoder().encode(text));
            };

            // Build print data in chunks
            const printChunks = [];

            // First chunk: Initialize printer and header
            printChunks.push([
                ...initializePrinter,
                ...centerAlign,
                ...convertToBytes(dataChunks[0]),
                ...lineFeed
            ]);

            // Middle chunks: Continue with left alignment
            for (let i = 1; i < dataChunks.length - 1; i++) {
                printChunks.push([
                    ...leftAlign,
                    ...convertToBytes(dataChunks[i]),
                    ...lineFeed
                ]);
            }

            // Last chunk: Final content and paper cut
            printChunks.push([
                ...leftAlign,
                ...convertToBytes(dataChunks[dataChunks.length - 1]),
                ...lineFeed, ...lineFeed, ...lineFeed,
                ...paperCut
            ]);

            console.log(`🖨️ Sending ${printChunks.length} print chunks`);

            // Send chunks with delays between them - FIRST COPY
            for (let i = 0; i < printChunks.length; i++) {
                const chunk = printChunks[i];
                console.log(`📦 Sending chunk ${i + 1}/${printChunks.length}, size: ${chunk.length} bytes`);

                await BleManager.write(
                    peripheralId,
                    serviceId,
                    transfer,
                    chunk,
                    chunk.length
                );

                // Add delay between chunks to prevent buffer overflow
                if (i < printChunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
                }
            }

            console.log('✅ First copy printed successfully');
            Alert.alert('Print Success', 'First copy printed! Printing second copy...');

            // Wait a bit then print SECOND COPY
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Repeat for second copy
            for (let i = 0; i < printChunks.length; i++) {
                const chunk = printChunks[i];

                await BleManager.write(
                    peripheralId,
                    serviceId,
                    transfer,
                    chunk,
                    chunk.length
                );

                // Add delay between chunks
                if (i < printChunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            console.log('✅ Second copy printed successfully');
            Alert.alert('Printing Complete', 'Two copies printed successfully!');
            resetAfterOrder();

        } catch (error) {
            console.error('❌ Bluetooth print error:', error);

            let errorMessage = 'Failed to connect to printer. ';

            if (error instanceof Error) {
                const errorString = error.message;
                console.log('🔍 Error details:', errorString);

                if (errorString.includes('Device not connected')) {
                    errorMessage += 'Printer is disconnected. Please reconnect.';
                } else if (errorString.includes('Characteristic not found')) {
                    errorMessage += 'Printer service not found.';
                } else if (errorString.includes('Write not permitted')) {
                    errorMessage += 'No permission to write to printer.';
                } else if (errorString.includes('buffer') || errorString.includes('overflow')) {
                    errorMessage += 'Receipt too large. Try with fewer items or contact support.';
                } else {
                    errorMessage += `Error: ${errorString}`;
                }
            } else {
                errorMessage += 'Unknown error occurred.';
            }

            throw new Error(errorMessage);
        }
    };

    const getImageSource = (item: MenuItem) => {
        if (item.image_base64) {
            return { uri: item.image_base64 };
        }
        return null;
    };

    const renderMenuItems = () => {
        if (loading) {
            return (
                <ThemedView style={styles.loadingContainer}>
                    <ThemedText style={styles.loading1}>Loading menu items...</ThemedText>
                </ThemedView>
            );
        }

        const items = [];
        for (let i = 0; i < filteredItems.length; i += 2) {
            const rowItems = filteredItems.slice(i, i + 2);
            items.push(
                <ThemedView key={`row-${i}`} style={styles.menuRow}>
                    {rowItems.map((item, itemIndex) => {
                        const imageSource = getImageSource(item);

                        return (
                            <TouchableOpacity
                                key={`${item.id}-${i}-${itemIndex}`}
                                style={styles.menuCard}
                                onPress={() => addToCart(item)}
                                disabled={item.stocks === 0}
                            >
                                <ThemedView style={styles.imageContainer}>
                                    {imageSource ? (
                                        <Image
                                            source={imageSource}
                                            style={styles.itemImage}
                                            resizeMode="cover"
                                        />
                                    ) : (
                                        <ThemedView style={styles.imagePlaceholder}>
                                            <Feather name="image" size={24} color="#D4A574" />
                                        </ThemedView>
                                    )}
                                    <ThemedView style={styles.imageOverlay} />
                                </ThemedView>

                                <ThemedView style={styles.cardContent}>
                                    <ThemedView style={styles.cardText}>
                                        <ThemedView style={[
                                            styles.modeIndicatorContainer,
                                            item.isOffline ? styles.sentMode : styles.deliveredMode
                                        ]}>
                                            <Feather
                                                name="check"
                                                size={12}
                                                color={item.isOffline ? "#666" : "#FFF"}
                                            />
                                            {!item.isOffline && (
                                                <Feather
                                                    name="check"
                                                    size={12}
                                                    color="#FFF"
                                                    style={styles.deliveredCheck}
                                                />
                                            )}
                                        </ThemedView>

                                        <Text style={styles.itemName} numberOfLines={2}>
                                            {item.name}
                                        </Text>
                                        <Text style={styles.itemCategory}>
                                            {item.category}
                                        </Text>
                                        <Text style={styles.itemCode}>
                                            Code: {item.code}
                                        </Text>
                                        <Text style={[
                                            styles.itemStock,
                                            item.stocks === 0 ? styles.outOfStock : styles.inStock
                                        ]}>
                                            Stock: {item.stocks}
                                        </Text>

                                    </ThemedView>
                                    <ThemedView style={styles.bottomRow}>
                                        <Text style={styles.itemPrice}>
                                            ₱{item.price.toFixed(2)}
                                        </Text>
                                        {checkItemRequiresCup(item) && (
                                            <ThemedView style={styles.cupIndicator}>
                                                <Feather name="coffee" size={10} color="#FFFEEA" />
                                            </ThemedView>
                                        )}

                                        <TouchableOpacity
                                            style={[
                                                styles.addButton,
                                                item.stocks === 0 && styles.addButtonDisabled
                                            ]}
                                            onPress={(e) => {
                                                e.stopPropagation();
                                                addToCart(item);
                                            }}
                                            disabled={item.stocks === 0}
                                        >
                                            <Feather
                                                name="plus"
                                                size={14}
                                                color={item.stocks === 0 ? "#9CA3AF" : "#FFFEEA"}
                                            />
                                        </TouchableOpacity>
                                    </ThemedView>
                                </ThemedView>
                            </TouchableOpacity>
                        );
                    })}
                    {rowItems.length < 2 &&
                        Array.from({ length: 2 - rowItems.length }).map((_, index) => (
                            <ThemedView key={`empty-${i}-${index}`} style={styles.emptyCard} />
                        ))
                    }
                </ThemedView>
            );
        }

        if (items.length === 0 && !loading) {
            return (
                <ThemedView style={styles.emptyMenuContainer}>
                    <Feather name="package" size={48} color="#D4A574" />
                    <ThemedText style={styles.emptyMenuText}>No items found</ThemedText>
                    <ThemedText style={styles.emptyMenuSubText}>
                        {isOnlineMode
                            ? 'No active items available on server'
                            : 'No items available in local storage'
                        }
                    </ThemedText>
                </ThemedView>
            );
        }

        return items;
    };

    return (
        <ThemedView style={styles.container}>
            <ImageBackground
                source={require('@/assets/images/kape1.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <Navbar 
                    cartItemCount={cart.length} 
                    onCartPress={() => setIsOrderSummaryVisible(true)}
                    activeNav="pos"
                />
                <ThemedView style={styles.content}>
                    {/* ORDER TYPE SELECTION - ONLY SHOW WHEN NO ORDER TYPE SELECTED */}
                    {!orderType && (
                        <ThemedView style={styles.menuSection}>
                            <ThemedView style={styles.orderTypeContainer}>
                                <ThemedText style={styles.orderTypeTitle}>
                                    Select Order Type</ThemedText>
                                <ThemedView style={styles.orderTypeButtons}>
                                    <TouchableOpacity
                                        style={[styles.orderTypeButton, styles.dineInButton]}
                                        onPress={() => setOrderType('dine-in')}
                                    >
                                        <Feather name="coffee" size={32} color="#FFFEEA" />
                                        <ThemedText style={styles.orderTypeButtonText}>
                                            DINE IN
                                        </ThemedText>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[styles.orderTypeButton, styles.takeOutButton]}
                                        onPress={() => setOrderType('take-out')}
                                    >
                                        <Feather name="shopping-bag" size={32} color="#FFFEEA" />
                                        <ThemedText style={styles.orderTypeButtonText}>
                                            TAKE OUT
                                        </ThemedText>
                                    </TouchableOpacity>
                                </ThemedView>
                            </ThemedView>
                        </ThemedView>
                    )}

                    {/* MENU HEADER AND CONTENT - ONLY SHOW WHEN ORDER TYPE IS SELECTED */}
                    {orderType && (
                        <ThemedView style={styles.menuSection2}>
                            <ThemedView style={styles.menuHeader}>
                                {/* Order Type Indicator */}
                                <ThemedView style={styles.orderTypeIndicator}>
                                    <ThemedText style={styles.orderTypeLabel}>
                                        Order Type:
                                    </ThemedText>
                                    <ThemedView style={[
                                        styles.orderTypeBadge,
                                        orderType === 'dine-in' ? styles.dineInBadge : styles.takeOutBadge
                                    ]}>
                                        <Feather
                                            name={orderType === 'dine-in' ? "coffee" : "shopping-bag"}
                                            size={14}
                                            color="#FFFEEA"
                                        />
                                        <ThemedText style={styles.orderTypeBadgeText}>
                                            {orderType === 'dine-in' ? 'DINE IN' : 'TAKE OUT'}
                                        </ThemedText>
                                        <TouchableOpacity
                                            onPress={() => {
                                                setOrderType(null);
                                                clearCart();
                                            }}
                                            style={styles.changeOrderTypeButton}
                                        >
                                            <Feather name="edit" size={12} color="#FFFEEA" />
                                        </TouchableOpacity>
                                    </ThemedView>
                                </ThemedView>

                                <ThemedView style={styles.searchContainer}>
                                    <Feather name="search" size={18} color="#874E3B" style={styles.searchIcon} />
                                    <TextInput
                                        style={styles.searchInput}
                                        placeholder="Search Items"
                                        value={searchQuery}
                                        onChangeText={setSearchQuery}
                                        placeholderTextColor="#854442"
                                    />
                                    <TouchableOpacity
                                        style={styles.reloadButton}
                                        onPress={() => {
                                            loadMenuItems();
                                            loadCategories();
                                        }}
                                    >
                                        <Feather name="refresh-cw" size={18} color="#874E3B" />
                                    </TouchableOpacity>
                                </ThemedView>

                                {/* Simple Cup Counter - Only show for take-out orders */}
                                {orderType === 'take-out' && cupCount > 0 && (
                                    <ThemedView style={styles.cupCounterContainer}>
                                        <Feather name="coffee" size={16} color="#874E3B" />
                                        <ThemedText style={styles.cupCounterLabel}>
                                            Total Cups: {cupCount}
                                        </ThemedText>
                                    </ThemedView>
                                )}
                            </ThemedView>

                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.categoriesContainer}
                                contentContainerStyle={styles.categoriesContent}
                            >
                                {categories.map((category, index) => (
                                    <TouchableOpacity
                                        key={`${category.id}-${index}`}
                                        style={[
                                            styles.categoryCard,
                                            selectedCategory === category.name && styles.categoryCardActive
                                        ]}
                                        onPress={() => setSelectedCategory(category.name)}
                                    >
                                        {category.id !== 'all' && (
                                            <ThemedView style={[
                                                styles.categoryModeIndicator,
                                                category.isOffline ? styles.sentMode : styles.deliveredMode
                                            ]}>
                                                <Feather
                                                    name="check"
                                                    size={8}
                                                    color={category.isOffline ? "#666" : "#FFF"}
                                                />
                                                {!category.isOffline && (
                                                    <Feather
                                                        name="check"
                                                        size={8}
                                                        color="#FFF"
                                                        style={styles.deliveredCheck}
                                                    />
                                                )}
                                            </ThemedView>
                                        )}

                                        <Feather
                                            name={(category.icon || 'folder') as any}
                                            size={28}
                                            color={selectedCategory === category.name ? '#FFFEEA' : '#874E3B'}
                                            style={styles.categoryIcon}
                                        />

                                        <Text
                                            style={[
                                                styles.categoryName,
                                                selectedCategory === category.name && styles.categoryNameActive
                                            ]}
                                            numberOfLines={2}
                                            ellipsizeMode="tail"
                                        >
                                            {category.name}
                                        </Text>

                                        {category.items_count !== undefined && category.items_count > 0 && category.id !== 'all' && (
                                            <Text style={[
                                                styles.categoryCount,
                                                selectedCategory === category.name && styles.categoryCountActive
                                            ]}>
                                                {category.items_count}
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            <ScrollView style={styles.menuList}>
                                {renderMenuItems()}
                            </ScrollView>
                        </ThemedView>
                    )}
                </ThemedView>
            </ImageBackground>

            {/* Order Summary Modal - Using extracted component with notes props */}
            <OrderSummaryModal 
                visible={isOrderSummaryVisible}
                onClose={() => setIsOrderSummaryVisible(false)}
                customerName={customerName}
                setCustomerName={setCustomerName}
                cart={cart}
                subtotal={subtotal}
                total={total}
                orderType={orderType}
                updateQuantity={updateQuantity}
                clearCart={clearCart}
                placeOrder={placeOrder}
                loading={loading}
                isProcessingOrder={isProcessingOrder}
                isBluetoothConnected={isBluetoothConnected}
                notes={notes}           // ADDED: pass notes
                setNotes={setNotes}     // ADDED: pass setNotes
            />

            {/* PROCESSING MODAL */}
            {isProcessingOrder && (
                <ThemedView style={styles.processingOverlay}>
                    <ThemedView style={styles.processingModal}>
                        <ThemedView style={styles.spinnerContainer}>
                            <Animated.View style={{ transform: [{ rotate: spin }] }}>
                                <Feather name="loader" size={32} color="#874E3B" />
                            </Animated.View>
                        </ThemedView>
                        <ThemedText style={styles.processingText}>Processing Order...</ThemedText>
                        <ThemedText style={styles.processingSubText}>Please wait while we save your order</ThemedText>
                    </ThemedView>
                </ThemedView>
            )}

            {showReceiptModal && currentReceipt && (
                <ThemedView style={styles.modalOverlay}>
                    <ThemedView style={styles.receiptModal}>
                        {/* RECEIPT HEADER */}
                        <ThemedView style={styles.receiptHeader}>
                            <ThemedText style={styles.receiptTitle}>THE KAPE SPOT</ThemedText>
                            <ThemedText style={styles.receiptSubtitle}>THANK YOU FOR VISIT</ThemedText>
                        </ThemedView>

                        <ThemedView style={styles.receiptSeparator}>
                            <ThemedText style={styles.separatorText}>-----------------------</ThemedText>
                        </ThemedView>

                        {/* ORDER DETAILS */}
                        <ThemedView style={styles.receiptSection}>
                            <ThemedView style={styles.receiptRow}>
                                <ThemedText style={styles.receiptLabel}>Name:</ThemedText>
                                <ThemedText style={styles.receiptValue}>{currentReceipt.customerName}</ThemedText>
                            </ThemedView>
                            <ThemedView style={styles.receiptRow}>
                                <ThemedText style={styles.receiptLabel}>Order ID:</ThemedText>
                                <ThemedText style={styles.receiptValue}>{currentReceipt.orderId}</ThemedText>
                            </ThemedView>
                            <ThemedView style={styles.receiptRow}>
                                <ThemedText style={styles.receiptLabel}>Date:</ThemedText>
                                <ThemedText style={styles.receiptValue}>
                                    {new Date(currentReceipt.timestamp).toLocaleDateString()}
                                </ThemedText>
                            </ThemedView>
                            <ThemedView style={styles.receiptRow}>
                                <ThemedText style={styles.receiptLabel}>Time:</ThemedText>
                                <ThemedText style={styles.receiptValue}>
                                    {new Date(currentReceipt.timestamp).toLocaleTimeString()}
                                </ThemedText>
                            </ThemedView>
                            <ThemedView style={styles.receiptRow}>
                                <ThemedText style={styles.receiptLabel}>Type:</ThemedText>
                                <ThemedText style={styles.receiptValue}>
                                    {currentReceipt.orderType === 'dine-in' ? 'DINE IN' : 'TAKE OUT'}
                                </ThemedText>
                            </ThemedView>
                            {/* ADDED: Show notes on receipt modal */}
                            {currentReceipt.notes && currentReceipt.notes.trim() !== '' && (
                                <ThemedView style={styles.receiptRow}>
                                    <ThemedText style={styles.receiptLabel}>Notes:</ThemedText>
                                    <ThemedText style={[styles.receiptValue, styles.notesValue]} numberOfLines={2}>
                                        {currentReceipt.notes}
                                    </ThemedText>
                                </ThemedView>
                            )}
                        </ThemedView>

                        <ThemedView style={styles.receiptSeparator}>
                            <ThemedText style={styles.separatorText}>-----------------------</ThemedText>
                        </ThemedView>

                        {/* ORDER ITEMS - SCROLLABLE */}
                        <ScrollView style={styles.receiptItemsScroll}>
                            <ThemedView style={styles.receiptItemHeader}>
                                <Text style={[styles.itemHeaderText, styles.itemNameHeader]}>Item</Text>
                                <Text style={[styles.itemHeaderText, styles.itemQtyHeader]}>Qty</Text>
                                <Text style={[styles.itemHeaderText, styles.itemPriceHeader]}>Price</Text>
                                <Text style={[styles.itemHeaderText, styles.itemTotalHeader]}>Total</Text>
                            </ThemedView>

                            {currentReceipt.items.map((item, index) => (
                                <ThemedView key={`${item.id}-${index}`} style={styles.receiptItem}>
                                    <Text style={[styles.receiptItemText, styles.itemName]} numberOfLines={1}>
                                        {item.name}
                                    </Text>
                                    <Text style={[styles.receiptItemText, styles.itemQty]}>{item.quantity}</Text>
                                    <Text style={[styles.receiptItemText, styles.itemPrice]}>₱{item.price.toFixed(2)}</Text>
                                    <Text style={[styles.receiptItemText, styles.itemTotal]}>
                                        ₱{(item.price * item.quantity).toFixed(2)}
                                    </Text>
                                </ThemedView>
                            ))}
                        </ScrollView>

                        <ThemedView style={styles.receiptSeparator}>
                            <ThemedText style={styles.separatorText}>-----------------------</ThemedText>
                        </ThemedView>

                        {/* TOTALS */}
                        <ThemedView style={styles.receiptTotal}>
                            <ThemedView style={styles.totalRow}>
                                <ThemedText style={styles.totalLabel}>Sub Total:</ThemedText>
                                <ThemedText style={styles.totalValue}>₱{currentReceipt.subtotal.toFixed(2)}</ThemedText>
                            </ThemedView>
                            <ThemedView style={styles.totalRow}>
                                <ThemedText style={styles.totalLabel}>Amount Due:</ThemedText>
                                <ThemedText style={styles.grandTotalValue}>₱{currentReceipt.total.toFixed(2)}</ThemedText>
                            </ThemedView>
                        </ThemedView>

                        {/* CUPS USED - ONLY FOR TAKE OUT */}
                        {currentReceipt.orderType === 'take-out' && currentReceipt.cupsUsed && currentReceipt.cupsUsed > 0 && (
                            <ThemedView style={styles.cupsUsedSection}>
                                <ThemedText style={styles.cupsUsedText}>
                                    Cups Used: {currentReceipt.cupsUsed}
                                </ThemedText>
                            </ThemedView>
                        )}

                        {/* THANK YOU MESSAGE */}
                        <ThemedView style={styles.thankYouSection}>
                            <ThemedText style={styles.thankYouText}>Thank you for your order!</ThemedText>
                        </ThemedView>

                        {/* ACTIONS */}
                        <ThemedView style={styles.receiptActions}>
                            <TouchableOpacity
                                style={[
                                    styles.printButton,
                                    !isBluetoothConnected && styles.printButtonDisabled
                                ]}
                                onPress={handlePrintReceipt}
                                disabled={!isBluetoothConnected}
                            >
                                <ThemedText style={styles.printButtonText}>
                                    {isBluetoothConnected ? 'Print Receipt (2 Copies)' : 'Printer Not Connected'}
                                </ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.cancelReceiptButton}
                                onPress={() => {
                                    setShowReceiptModal(false);
                                    resetAfterOrder();
                                }}
                            >
                                <ThemedText style={styles.cancelReceiptButtonText}>Close</ThemedText>
                            </TouchableOpacity>
                        </ThemedView>
                    </ThemedView>
                </ThemedView>
            )}
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
    categoryModeIndicator: {
        position: 'absolute',
        top: 2,
        right: 2,
        width: 14,
        height: 14,
        borderRadius: 7,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    categoryCount: {
        fontSize: 8,
        color: '#854442',
        marginTop: 1,
        fontWeight: 'bold',
    },
    categoryCountActive: {
        color: '#FFFEEA',
    },
    content: {
        flex: 1,
        padding: 16,
        backgroundColor: 'transparent',
    },
    menuSection: {
        height: 500,
        alignSelf: 'center',
        borderWidth: 1,
        borderColor: '#854442',
        borderRadius: 12,
        padding: 16,
        marginTop: 100,
        backgroundColor: 'rgba(223, 204, 175, 0.7)',
    },
    menuSection2: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#854442',
        borderRadius: 12,
        padding: 16,
        backgroundColor: 'rgba(223, 204, 175, 0.7)',
    },
    menuHeader: {
        marginBottom: 12,
        backgroundColor: 'transparent',
    },
    sectionTitle: {
        fontSize: 18,
        marginBottom: 5,
        textAlign: 'center',
        fontFamily: 'LobsterTwoItalic',
        color: '#854442',
    },
    tableHeader: {
        flexDirection: 'row',
        borderBottomWidth: 5,
        borderBottomColor: '#854442',
        paddingBottom: 6,
        marginBottom: 6,
        borderRadius: 10,
        backgroundColor: "rgba(255, 254, 234, 0.95)",
    },
    headerText: {
        fontWeight: 'bold',
        color: '#854442',
        fontSize: 17,
    },
    itemHeader: {
        flex: 2.5,
        marginLeft: 5,
        textAlign: 'left',
    },
    priceHeader: {
        flex: 1.5,
        textAlign: 'center',
    },
    qtyHeader: {
        flex: 1.5,
        textAlign: 'center',
    },
    totalHeader: {
        flex: 1.5,
        marginRight: 5,
        textAlign: 'right',
    },
    modalOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    orderListExpanded: {
        flex: 1,
        marginBottom: 12,
        maxHeight: 400,
        minHeight: 200,
    },
    emptyCartExpanded: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
        minHeight: 250,
        borderWidth: 1,
        borderColor: '#854442',
        borderRadius: 12,
        backgroundColor: "rgba(255, 254, 234, 0.95)",
    },
    orderSummaryModal: {
        width: '90%',
        height: '80%',
        maxWidth: 500,
        maxHeight: '75%',
        backgroundColor: '#DFCCAF',
        borderRadius: 12,
        padding: 16,
        borderWidth: 2,
        borderColor: '#854442',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    modalTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'transparent'
    },
    headerBluetoothIcon: {
        marginLeft: 4,
        backgroundColor: 'transparent'
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottomWidth: 2,
        backgroundColor: 'transparent',
        borderBottomColor: '#D4A574',
    },
    modalTitle: {
        fontSize: 20,
        fontFamily: 'LobsterTwoItalic',
        color: '#854442',
        fontWeight: 'bold',
    },
    closeModalButton: {
        padding: 4,
    },
    receiptModal: {
        width: 250,
        backgroundColor: '#FFFFFF',
        borderRadius: 4,
        padding: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
        maxHeight: '90%',
    },
    receiptHeader: {
        alignItems: 'center',
        marginBottom: 6,
    },
    receiptTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#000000',
        textAlign: 'center',
        marginBottom: 2,
    },
    receiptSubtitle: {
        fontSize: 10,
        color: '#000000',
        textAlign: 'center',
    },
    receiptSeparator: {
        alignItems: 'center',
        marginVertical: 6,
    },
    separatorText: {
        fontSize: 10,
        color: '#000000',
        letterSpacing: 0.5,
    },
    receiptSection: {
        marginBottom: 6,
    },
    receiptRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 1,
    },
    receiptLabel: {
        fontSize: 9,
        color: '#000000',
        fontWeight: '500',
    },
    receiptValue: {
        fontSize: 9,
        color: '#000000',
        flex: 1,
        textAlign: 'right',
    },
    // ADDED: notes value style
    notesValue: {
        fontSize: 8,
        color: '#555',
        fontStyle: 'italic',
        maxWidth: 150,
    },
    receiptItems: {
        marginBottom: 6,
    },
    receiptItemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 3,
        paddingBottom: 1,
        borderBottomWidth: 1,
        borderBottomColor: '#CCCCCC',
        
    },
    itemHeaderText: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#000000',
    },
    itemNameHeader: {
        flex: 3,
        textAlign: 'left',
    },
    itemQtyHeader: {
        flex: 1,
        textAlign: 'center',
    },
    itemPriceHeader: {
        flex: 2,
        textAlign: 'right',
    },
    itemTotalHeader: {
        flex: 2,
        textAlign: 'right',
    },
    receiptItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 1,
    },
    receiptItemText: {
        fontSize: 8,
        color: '#874E3B',
    },
    itemName: {
        flex: 3,
        textAlign: 'left',
        fontSize: 15,
        color: '#F5E6D3',
        fontWeight: '500',
        marginBottom: 2,
        fontFamily: 'LobsterTwoRegular',
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 4,
        shadowColor: 'rgba(0, 0, 0, 0.9)',
    },
    itemQty: {
        flex: 1,
        textAlign: 'center',
    },
    itemPrice: {
        flex: 2,
        textAlign: 'right',
        fontSize: 15,
        color: '#F5E6D3',
        fontWeight: '500',
        marginBottom: 2,
        fontFamily: 'LobsterTwoRegular',
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 4,
        shadowColor: 'rgba(0, 0, 0, 0.9)',
    },
    itemTotal: {
        flex: 2,
        textAlign: 'right',
        fontWeight: '500',
    },
    receiptTotal: {
        marginBottom: 6,
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 1,
        backgroundColor: '#DFCCAF',
    },
    totalLabel: {
        fontSize: 15,
        color: '#874E3B',
        fontWeight: '500',
    },
    totalValue: {
        fontSize: 15,
        color: '#874E3B',
    },
    grandTotalValue: {
        fontSize: 25,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    cupsUsedSection: {
        alignItems: 'center',
        marginBottom: 6,
        padding: 3,
        backgroundColor: '#F5F5F5',
        borderRadius: 2,
    },
    cupsUsedText: {
        fontSize: 8,
        color: '#000000',
        fontWeight: '500',
    },
    thankYouSection: {
        alignItems: 'center',
        marginBottom: 8,
    },
    thankYouText: {
        fontSize: 9,
        color: '#000000',
        fontStyle: 'italic',
    },
    receiptActions: {
        gap: 6,
    },
    printButton: {
        backgroundColor: '#000000',
        paddingVertical: 8,
        borderRadius: 3,
        alignItems: 'center',
    },
    printButtonText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: 'bold',
    },
    cancelReceiptButton: {
        backgroundColor: '#CCCCCC',
        paddingVertical: 8,
        borderRadius: 3,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#999999',
    },
    cancelReceiptButtonText: {
        color: '#000000',
        fontSize: 10,
        fontWeight: 'bold',
    },
    orderList: {
        flex: 1,
        marginBottom: 12,
        maxHeight: 300,
    },
    emptyCart: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 43,
        borderWidth: 1,
        borderColor: '#854442',
        borderRadius: 12,
        backgroundColor: "rgba(255, 254, 234, 0.95)",
    },
    emptyCartText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#874E3B',
        marginTop: 12,
        textAlign: 'center',
    },
    emptyCartSubText: {
        fontSize: 12,
        color: '#5A3921',
        marginTop: 6,
        textAlign: 'center',
    },
    orderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#E8D8C8',
        backgroundColor: "rgba(255, 254, 250, 0.95)",
        borderRadius: 10
    },
    cellText: {
        fontSize: 15,
        color: '#5A3921',
    },
    itemCell: {
        flex: 2.5,
        textAlign: 'left',
        marginLeft: 3
    },
    priceCell: {
        flex: 1.5,
        textAlign: 'center',
    },
    qtyCell: {
        flex: 1.5,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: "rgba(255, 254, 250, 0.95)",
    },
    qtyButton: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#854442',
    },
    qtyText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#874E3B',
        minWidth: 16,
        textAlign: 'center',
    },
    totalCell: {
        flex: 1.5,
        textAlign: 'right',
        fontWeight: 'bold',
        marginRight: 4,
    },
    totalsSection: {
        borderTopWidth: 2,
        borderTopColor: '#874E3B',
        marginBottom: 12,
        backgroundColor: '#874E3B',
    },
    grandTotal: {
        borderTopWidth: 1,
        borderTopColor: '#DFCCAF',
        paddingTop: 6,
        marginTop: 3,
        backgroundColor: '#DFCCAF',
    },
    grandTotalLabel: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
        backgroundColor: 'transparent',
    },
    cancelButton: {
        flex: 1,
        backgroundColor: '#E8D8C8',
        paddingVertical: 10,
        borderRadius: 6,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#854442',
    },
    cancelButtonText: {
        color: '#874E3B',
        fontSize: 14,
        fontWeight: 'bold',
    },
    placeOrderButton: {
        flex: 1,
        backgroundColor: '#854442',
        paddingVertical: 10,
        borderRadius: 6,
        alignItems: 'center',
    },
    placeOrderButtonDisabled: {
        backgroundColor: '#A8A29E',
    },
    placeOrderButtonText: {
        color: '#FFFEEA',
        fontSize: 14,
        fontWeight: 'bold',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 254, 234, 0.95)',
        borderWidth: 1,
        borderColor: '#854442',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 5,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: '#5A3921',
    },
    categoriesContainer: {
        flexDirection: 'row',
        marginBottom: 12,
        maxHeight: 80,
    },
    categoriesContent: {
        paddingVertical: 2,
        gap: 12,
    },
    categoryCard: {
        width: 75,
        height: 60,
        backgroundColor: '#F5E6D3',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#854442',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    categoryCardActive: {
        backgroundColor: '#854442',
        borderColor: '#854442',
        shadowColor: '#854442',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 5,
    },
    categoryIcon: {
        marginBottom: 4,
    },
    categoryName: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#874E3B',
        textAlign: 'center',
        marginTop: 2,
        lineHeight: 12,
    },
    categoryNameActive: {
        color: '#FFFEEA',
        fontWeight: 'bold',
    },
    menuList: {
        flex: 1,
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
    printButtonDisabled: {
        backgroundColor: '#A8A29E',
        borderColor: '#A8A29E',
    },
    menuRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
        backgroundColor: 'transparent',
    },
    menuCard: {
        width: '48%',
        aspectRatio: 1,
        backgroundColor: 'transparent',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E8D8C8',
        padding: 8,
        justifyContent: 'space-between',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3,
        overflow: 'hidden',
    },
    emptyCard: {
        width: '23%',
        aspectRatio: 1,
        backgroundColor: 'transparent',
    },
    imageContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 10,
        overflow: 'hidden',
    },
    cupCounterContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 254, 234, 0.95)',
        borderWidth: 1,
        borderColor: '#854442',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginTop: 8,
        alignSelf: 'flex-start',
    },
    cupCounterLabel: {
        fontSize: 14,
        color: '#874E3B',
        fontWeight: '500',
        marginRight: 8,
    },
    cupCounterControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    cupCounterButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#854442',
    },
    cupCounterValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
        minWidth: 20,
        textAlign: 'center',
    },
    cupIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(135, 78, 59, 0.8)',
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
        marginLeft: 30,
        alignSelf: 'flex-start',
        marginTop: 9,
    },
    cupIndicatorText: {
        fontSize: 8,
        color: '#FFFEEA',
        marginLeft: 2,
        fontWeight: 'bold',
    },
    cupConfirmationModal: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    cupConfirmationContent: {
        backgroundColor: '#FFFEEA',
        borderRadius: 12,
        padding: 20,
        borderWidth: 2,
        borderColor: '#854442',
        width: '80%',
    },
    itemImage: {
        width: '100%',
        height: '100%',
    },
    imagePlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
    },
    imageOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    searchAndReloadContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    cupCounterSubText: {
        fontSize: 10,
        color: '#874E3B',
        fontStyle: 'italic',
        marginLeft: 4,
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
    cardContent: {
        flex: 1,
        justifyContent: 'space-between',
        zIndex: 1,
        backgroundColor: 'transparent',
    },
    cardText: {
        flex: 1,
        zIndex: 1,
        backgroundColor: 'transparent',
    },
    itemCategory: {
        fontSize: 15,
        color: '#F5E6D3',
        fontWeight: '500',
        marginBottom: 2,
        fontFamily: 'LobsterTwoRegular',
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 4,
        shadowColor: 'rgba(0, 0, 0, 0.9)',
    },
    itemCode: {
        fontSize: 8,
        color: '#E8D8C8',
        marginBottom: 2,
        fontFamily: 'LobsterTwoRegular',
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 4,
        shadowColor: 'rgba(0, 0, 0, 0.9)',
    },
    itemStock: {
        fontSize: 8,
        fontWeight: 'bold',
        marginBottom: 4,
        fontFamily: 'LobsterTwoRegular',
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 4,
        shadowColor: 'rgba(0, 0, 0, 0.9)',
    },
    inStock: {
        color: '#FFFEEA',
    },
    outOfStock: {
        color: '#FECACA',
    },
    bottomRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        backgroundColor: 'transparent'
    },
    addButton: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#874E3B',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#854442',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 3,
    },
    addButtonDisabled: {
        backgroundColor: '#D1D5DB',
        borderColor: '#9CA3AF',
    },
    loadingContainer: {
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    loading1: {
        color: '#854442'
    },
    emptyMenuContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
        backgroundColor: 'transparent',
    },
    confirmCupButton: {
        backgroundColor: '#874E3B',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        marginLeft: 8,
    },
    confirmCupButtonText: {
        color: '#FFFEEA',
        fontSize: 12,
        fontWeight: 'bold',
    },
    receiptItemsScroll: {
        maxHeight: 200,
        marginBottom: 6,
    },
    cancelCupButton: {
        backgroundColor: '#E8D8C8',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#854442',
        marginLeft: 4,
    },
    cancelCupButtonText: {
        color: '#874E3B',
        fontSize: 12,
        fontWeight: 'bold',
    },
    emptyMenuText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
        marginTop: 12,
        textAlign: 'center',
    },
    emptyMenuSubText: {
        fontSize: 14,
        color: '#5A3921',
        marginTop: 6,
        textAlign: 'center',
    },
    modeIndicatorContainer: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    deliveredMode: {
        backgroundColor: '#0084FF',
    },
    sentMode: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#666',
    },
    deliveredCheck: {
        position: 'absolute',
        left: 2,
    },
    modeInfo: {
        fontSize: 12,
        color: '#874E3B',
        textAlign: 'center',
        marginBottom: 2,
        fontStyle: 'italic',
    },
    customerInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 1,
        backgroundColor: "transparent",
    },
    // ADDED: notes input container style
    notesInputContainer: {
        flexDirection: 'column',
        marginBottom: 5,
        backgroundColor: "transparent",
    },
    inputLabel: {
        fontSize: 14,
        color: '#854442',
        fontWeight: '700',
        width: 115,
        marginBottom: 4,
    },
    customerInput: {
        flex: 1,
        backgroundColor: 'rgba(255, 254, 234, 0.95)',
        borderWidth: 2,
        borderColor: '#854442',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 16,
        color: '#854442',
    },
    // ADDED: notes input style
    notesInput: {
        backgroundColor: 'rgba(255, 254, 234, 0.95)',
        borderWidth: 2,
        borderColor: '#854442',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        color: '#854442',
        minHeight: 60,
        textAlignVertical: 'top',
    },
    receiptOrderType: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
        marginTop: 8,
        paddingHorizontal: 12,
        paddingVertical: 4,
        backgroundColor: '#F5E6D3',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#854442',
    },
    receiptItemName: {
        fontSize: 12,
        color: '#5A3921',
        flex: 2,
    },
    totalAmount: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    processingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999,
    },
    processingModal: {
        width: '70%',
        backgroundColor: '#FFFEEA',
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#854442',
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    spinnerContainer: {
        marginBottom: 16,
    },
    processingText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#874E3B',
        textAlign: 'center',
        marginBottom: 8,
    },
    processingSubText: {
        fontSize: 14,
        color: '#5A3921',
        textAlign: 'center',
    },
    orderTypeContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
        backgroundColor: 'transparent',
    },
    orderTypeTitle: {
        fontSize: 32,
        fontFamily: 'LobsterTwoItalic',
        color: '#874E3B',
        marginBottom: 40,
        textAlign: 'center',
        letterSpacing: 2,
        textShadowColor: 'rgba(0, 0, 0, 0.1)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 4,
    },
    orderTypeButtons: {
        flexDirection: 'row',
        gap: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    orderTypeButton: {
        width: 140,
        height: 140,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 50,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    dineInButton: {
        backgroundColor: '#854442',
    },
    takeOutButton: {
        backgroundColor: '#6F4436',
    },
    orderTypeButtonText: {
        color: '#FFFEEA',
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 12,
        fontFamily: 'LobsterTwoRegular',
    },
    orderTypeIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 5,
        backgroundColor: 'rgba(255, 254, 234, 0.95)',
        padding: 5,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#854442',
    },
    orderTypeLabel: {
        fontSize: 16,
        color: '#854442',
        fontWeight: '500',
    },
    orderTypeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
    },
    dineInBadge: {
        backgroundColor: '#854442',
    },
    takeOutBadge: {
        backgroundColor: '#854442',
    },
    orderTypeBadgeText: {
        color: '#FFFEEA',
        fontSize: 12,
        fontWeight: 'bold',
    },
    changeOrderTypeButton: {
        marginLeft: 4,
        padding: 2,
    },
});