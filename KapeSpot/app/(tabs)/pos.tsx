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
    Animated
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

    // Initialize Firebase
    const db = getFirestore(app);

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
        setCupCount(0);
        setOrderType(null); // RESET ORDER TYPE
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

            // RESET STATE WHEN SCREEN GETS FOCUS
            resetPOSState();

            // Clear cart when screen loses focus
            return () => {
                console.log('📍 POS Screen unfocused - clearing cart');
                // Don't reset order type here, only clear cart
                setCart([]);
                setCustomerName('');
                setCupCount(0);
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
        setCupCount(0);
    };

    // Function to reset everything after order completion
    const resetAfterOrder = () => {
        console.log('🔄 Resetting after order completion...');
        setCart([]);
        setCustomerName('');
        setCupCount(0);
        setOrderType(null); // RESET ORDER TYPE
        setShowReceiptModal(false);
        setCurrentReceipt(null);

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

            const receiptData: ReceiptData = {
                orderId: `ORD-${Date.now()}`,
                customerName: customerName.trim(),
                items: [...cart],
                subtotal: subtotal,
                total: total,
                timestamp: new Date().toISOString(),
                status: 'unpaid',
                cupsUsed: orderType === 'take-out' ? cupCount : 0,
                orderType: orderType
            };

            console.log('🔄 [FIREBASE ORDER] Starting order process...');
            console.log('🌐 Current Mode:', connectionMode === 'offline' ? 'OFFLINE' : 'ONLINE');
            console.log('🥤 Total cups used in this order:', cupCount);
            console.log('📝 Order Type:', orderType);

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
                    // Save order to Firebase
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
                        order_type: orderType
                    };

                    const docRef = await addDoc(collection(db, 'orders'), orderData);
                    const firebaseId = docRef.id;

                    console.log('✅ Step 3 COMPLETE: Saved to FIREBASE successfully:', {
                        firebaseId: firebaseId,
                        orderId: receiptData.orderId,
                        orderType: orderType
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
                orderType: orderType!
            };
            setCurrentReceipt(receiptData);
            setShowReceiptModal(true);
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

    const handlePrintReceipt = () => {
        Alert.alert('Printing Receipt', 'Receipt sent to printer!');

        setTimeout(() => {
            Alert.alert('Printing Complete', 'Two copies printed successfully!');
            resetAfterOrder(); // USE RESET FUNCTION
        }, 2000);
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
                    <ThemedText>Loading menu items...</ThemedText>
                </ThemedView>
            );
        }

        const items = [];
        for (let i = 0; i < filteredItems.length; i += 4) {
            const rowItems = filteredItems.slice(i, i + 4);
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

                                        <ThemedText style={styles.itemName} numberOfLines={2}>
                                            {item.name}
                                        </ThemedText>
                                        <ThemedText style={styles.itemCategory}>
                                            {item.category}
                                        </ThemedText>
                                        <ThemedText style={styles.itemCode}>
                                            Code: {item.code}
                                        </ThemedText>
                                        <ThemedText style={[
                                            styles.itemStock,
                                            item.stocks === 0 ? styles.outOfStock : styles.inStock
                                        ]}>
                                            Stock: {item.stocks}
                                        </ThemedText>

                                    </ThemedView>
                                    <ThemedView style={styles.bottomRow}>
                                        <ThemedText style={styles.itemPrice}>
                                            ₱{item.price.toFixed(2)}
                                        </ThemedText>
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
                    {rowItems.length < 4 &&
                        Array.from({ length: 4 - rowItems.length }).map((_, index) => (
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
            <Navbar activeNav="pos" />

            <ImageBackground
                source={require('@/assets/images/kape1.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <ThemedView style={styles.content}>
                    <ThemedView style={styles.orderSection}>
                        <ThemedText style={styles.sectionTitle}>Order Summary</ThemedText>

                        <ThemedView style={styles.customerInputContainer}>
                            <ThemedText style={styles.inputLabel}>Customer Name:</ThemedText>
                            <TextInput
                                style={styles.customerInput}
                                value={customerName}
                                onChangeText={setCustomerName}
                                placeholder="Enter customer name"
                                placeholderTextColor="#9CA3AF"
                            />
                        </ThemedView>

                        <ThemedView style={styles.tableHeader}>
                            <ThemedText style={[styles.headerText, styles.itemHeader]}>Item</ThemedText>
                            <ThemedText style={[styles.headerText, styles.priceHeader]}>Price</ThemedText>
                            <ThemedText style={[styles.headerText, styles.qtyHeader]}>Qnt.</ThemedText>
                            <ThemedText style={[styles.headerText, styles.totalHeader]}>Total (₱)</ThemedText>
                        </ThemedView>

                        <ScrollView style={styles.orderList}>
                            {cart.length === 0 ? (
                                <ThemedView style={styles.emptyCart}>
                                    <Feather name="shopping-cart" size={36} color="#D4A574" />
                                    <ThemedText style={styles.emptyCartText}>No items in cart</ThemedText>
                                    <ThemedText style={styles.emptyCartSubText}>
                                        {orderType ? 'Tap on menu items to add them' : 'Select order type first'}
                                    </ThemedText>
                                </ThemedView>
                            ) : (
                                cart.map((item, index) => (
                                    <ThemedView key={`${item.id}-${index}`} style={styles.orderRow}>
                                        <ThemedText style={[styles.cellText, styles.itemCell]} numberOfLines={1}>
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

                        <ThemedView style={styles.actionButtons}>
                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={() => {
                                    clearCart();
                                    setOrderType(null); // RESET ORDER TYPE ON CANCEL
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

                    <ThemedView style={styles.menuSection}>
                        {/* ORDER TYPE SELECTION - SHOW FIRST */}
                        {!orderType && (
                            <ThemedView style={styles.orderTypeContainer}>
                                <ThemedText style={styles.orderTypeTitle}>
                                    Select Order Type
                                </ThemedText>
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
                        )}

                        {/* MENU HEADER - SHOW ONLY AFTER ORDER TYPE SELECTION */}
                        {orderType && (
                            <>
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
                                                size={32}
                                                color={selectedCategory === category.name ? '#FFFEEA' : '#874E3B'}
                                                style={styles.categoryIcon}
                                            />
                                            <ThemedText style={[
                                                styles.categoryName,
                                                selectedCategory === category.name && styles.categoryNameActive
                                            ]}>
                                                {category.name}
                                            </ThemedText>
                                            {category.items_count !== undefined && category.items_count > 0 && category.id !== 'all' && (
                                                <ThemedText style={[
                                                    styles.categoryCount,
                                                    selectedCategory === category.name && styles.categoryCountActive
                                                ]}>
                                                    {category.items_count}
                                                </ThemedText>
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>

                                <ScrollView style={styles.menuList}>
                                    {renderMenuItems()}
                                </ScrollView>
                            </>
                        )}
                    </ThemedView>
                </ThemedView>
            </ImageBackground>

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
                        <ThemedView style={styles.receiptHeader}>
                            <ThemedText style={styles.receiptTitle}>KapeSpot</ThemedText>
                            <ThemedText style={styles.receiptSubtitle}>Order Receipt</ThemedText>
                            <ThemedText style={styles.receiptOrderType}>
                                {currentReceipt.orderType === 'dine-in' ? 'DINE IN' : 'TAKE OUT'}
                            </ThemedText>
                        </ThemedView>

                        <ThemedView style={styles.receiptSection}>
                            <ThemedText style={styles.receiptLabel}>Name: {currentReceipt.customerName}</ThemedText>
                            <ThemedText style={styles.receiptLabel}>Order ID: {currentReceipt.orderId}</ThemedText>
                            <ThemedText style={styles.receiptLabel}>Date: {currentReceipt.timestamp}</ThemedText>
                        </ThemedView>

                        <ThemedView style={styles.receiptSeparator}>
                            <ThemedText style={styles.separatorText}>______________________</ThemedText>
                        </ThemedView>

                        <ThemedView style={styles.receiptItems}>
                            <ThemedView style={styles.receiptItemHeader}>
                                <ThemedText style={styles.itemHeaderText}>Item</ThemedText>
                                <ThemedText style={styles.itemHeaderText}>Qty</ThemedText>
                                <ThemedText style={styles.itemHeaderText}>Price</ThemedText>
                                <ThemedText style={styles.itemHeaderText}>Total</ThemedText>
                            </ThemedView>

                            {currentReceipt.items.map((item, index) => (
                                <ThemedView key={`${item.id}-${index}`} style={styles.receiptItem}>
                                    <ThemedText style={styles.receiptItemName} numberOfLines={1}>{item.name}</ThemedText>
                                    <ThemedText style={styles.itemQty}>{item.quantity}</ThemedText>
                                    <ThemedText style={styles.itemPrice}>₱{item.price.toFixed(2)}</ThemedText>
                                    <ThemedText style={styles.itemTotal}>₱{(item.price * item.quantity).toFixed(2)}</ThemedText>
                                </ThemedView>
                            ))}
                        </ThemedView>

                        <ThemedView style={styles.receiptSeparator}>
                            <ThemedText style={styles.separatorText}>______________________</ThemedText>
                        </ThemedView>

                        <ThemedView style={styles.receiptTotal}>
                            <ThemedText style={styles.totalLabel}>Amount to Pay:</ThemedText>
                            <ThemedText style={styles.totalAmount}>₱{currentReceipt.total.toFixed(2)}</ThemedText>
                        </ThemedView>

                        {currentReceipt.orderType === 'take-out' && currentReceipt.cupsUsed && currentReceipt.cupsUsed > 0 && (
                            <ThemedView style={styles.cupsUsedSection}>
                                <ThemedText style={styles.cupsUsedText}>
                                    Cups Used: {currentReceipt.cupsUsed}
                                </ThemedText>
                            </ThemedView>
                        )}

                        <ThemedView style={styles.receiptActions}>
                            <TouchableOpacity style={styles.printButton} onPress={handlePrintReceipt}>
                                <ThemedText style={styles.printButtonText}>Print Receipt (2 Copies)</ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.cancelReceiptButton}
                                onPress={() => {
                                    setShowReceiptModal(false);
                                    resetAfterOrder(); // RESET AFTER CLOSING RECEIPT
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


// ... (styles remain the same as previous version)
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
        top: 4,
        right: 4,
        width: 16,
        height: 16,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    categoryCount: {
        fontSize: 10,
        color: '#874E3B',
        marginTop: 2,
        fontWeight: 'bold',
    },
    categoryCountActive: {
        color: '#FFFEEA',
    },
    content: {
        flex: 1,
        flexDirection: 'row',
        padding: 16,
        gap: 16,
        backgroundColor: 'transparent',
    },
    orderSection: {
        width: '35%',
        backgroundColor: "#fffecaF2",
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    menuSection: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#D4A574',
        borderRadius: 12,
        padding: 16,
        backgroundColor: '#fffecaF2',
    },
    menuHeader: {
        marginBottom: 12,
        backgroundColor: "#fffecaF2"
    },
    sectionTitle: {
        fontSize: 18,
        marginBottom: 5,
        textAlign: 'center',
        fontFamily: 'LobsterTwoItalic',
        color: '#874E3B',
    },
    tableHeader: {
        flexDirection: 'row',
        borderBottomWidth: 2,
        borderBottomColor: '#874E3B',
        paddingBottom: 6,
        marginBottom: 6,
        backgroundColor: "rgba(255, 254, 234, 0.95)",
    },
    headerText: {
        fontWeight: 'bold',
        color: '#874E3B',
        fontSize: 17,
    },
    itemHeader: {
        flex: 2.5,
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
        textAlign: 'right',
    },
    orderList: {
        flex: 1,
        marginBottom: 12,
    },
    emptyCart: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 43,
        borderWidth: 1,
        borderColor: '#D4A574',
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
    },
    cellText: {
        fontSize: 15,
        color: '#5A3921',
    },
    itemCell: {
        flex: 2.5,
        textAlign: 'left',
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
        borderColor: '#D4A574',
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
    },
    totalsSection: {
        borderTopWidth: 2,
        borderTopColor: '#874E3B',
        marginBottom: 12,
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 3,
        backgroundColor: 'rgba(255, 254, 234, 0.95)',
    },
    totalLabel: {
        fontSize: 16,
        color: '#5A3921',
    },
    totalValue: {
        fontSize: 16,
        color: '#5A3921',
        fontWeight: '500',
    },
    grandTotal: {
        borderTopWidth: 1,
        borderTopColor: '#D4A574',
        paddingTop: 6,
        marginTop: 3,
    },
    grandTotalLabel: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    grandTotalValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
        backgroundColor: "#fffecaF2",
    },
    cancelButton: {
        flex: 1,
        backgroundColor: '#E8D8C8',
        paddingVertical: 10,
        borderRadius: 6,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    cancelButtonText: {
        color: '#874E3B',
        fontSize: 14,
        fontWeight: 'bold',
    },
    placeOrderButton: {
        flex: 1,
        backgroundColor: '#874E3B',
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
        borderColor: '#D4A574',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
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
        maxHeight: 90,
    },
    categoriesContent: {
        paddingVertical: 4,
        gap: 12,
    },
    categoryCard: {
        width: 80,
        height: 80,
        backgroundColor: '#F5E6D3',
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#D4A574',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3,
    },
    categoryCardActive: {
        backgroundColor: '#874E3B',
        borderColor: '#874E3B',
        shadowColor: '#874E3B',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 5,
    },
    categoryIcon: {
        marginBottom: 6,
    },
    categoryName: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#874E3B',
        textAlign: 'center',
    },
    categoryNameActive: {
        color: '#FFFEEA',
        fontWeight: 'bold',
    },
    menuList: {
        flex: 1,
    },
    menuRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
        backgroundColor: "#fffecaF2",
    },
    menuCard: {
        width: '23%',
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
        borderColor: '#D4A574',
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
        borderColor: '#D4A574',
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
        borderColor: '#D4A574',
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
        borderColor: '#D4A574',
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
    itemName: {
        fontSize: 18,
        fontFamily: 'LobsterTwoItalic',
        color: '#FFFEEA',
        textShadowColor: 'rgba(0, 0, 0, 0.9)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 4,
        shadowColor: 'rgba(0, 0, 0, 0.9)',
        shadowOffset: { width: 2, height: 2 },
        shadowOpacity: 0.9,
        shadowRadius: 8,
        elevation: 10,
        lineHeight: 40,
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
    itemPrice: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#FFFEEA',
        fontFamily: 'LobsterTwoRegular',
        textShadowColor: 'rgba(0, 0, 0, 0.7)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 3,
    },
    addButton: {
        width: 26,
        height: 26,
        borderRadius: 13,
        backgroundColor: '#874E3B',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#874E3B',
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
    cancelCupButton: {
        backgroundColor: '#E8D8C8',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#D4A574',
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
        marginBottom: 12,
        backgroundColor: "#fffecaF2",
    },
    inputLabel: {
        fontSize: 14,
        color: '#5A3921',
        fontWeight: '500',
        width: 115
    },
    customerInput: {
        flex: 1,
        backgroundColor: 'rgba(255, 254, 234, 0.95)',
        borderWidth: 2,
        borderColor: '#D4A574',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 16,
        color: '#5A3921',
    },
    modalOverlay: {
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
    receiptModal: {
        width: '85%',
        backgroundColor: '#FFFEEA',
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#D4A574',
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    receiptHeader: {
        alignItems: 'center',
        marginBottom: 16,
    },
    receiptTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#874E3B',
        fontFamily: 'LobsterTwoItalic',
    },
    receiptSubtitle: {
        fontSize: 14,
        color: '#5A3921',
        marginTop: 4,
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
        borderColor: '#D4A574',
    },
    receiptSection: {
        marginBottom: 12,
    },
    receiptLabel: {
        fontSize: 14,
        color: '#5A3921',
        marginBottom: 4,
    },
    receiptSeparator: {
        alignItems: 'center',
        marginVertical: 12,
    },
    separatorText: {
        fontSize: 16,
        color: '#5A3921',
        letterSpacing: 2,
    },
    receiptItems: {
        marginBottom: 12,
    },
    receiptItemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#D4A574',
    },
    itemHeaderText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#874E3B',
        flex: 1,
        textAlign: 'center',
    },
    receiptItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    receiptItemName: {
        fontSize: 12,
        color: '#5A3921',
        flex: 2,
    },
    itemQty: {
        fontSize: 12,
        color: '#5A3921',
        flex: 1,
        textAlign: 'center',
    },

    itemTotal: {
        fontSize: 12,
        color: '#5A3921',
        flex: 1,
        textAlign: 'right',
        fontWeight: 'bold',
    },
    receiptTotal: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#D4A574',
    },

    totalAmount: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    cupsUsedSection: {
        alignItems: 'center',
        marginTop: 8,
        padding: 8,
        backgroundColor: '#F5E6D3',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    cupsUsedText: {
        fontSize: 14,
        color: '#874E3B',
        fontWeight: 'bold',
    },
    receiptActions: {
        marginTop: 20,
        gap: 12,
    },
    printButton: {
        backgroundColor: '#874E3B',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    printButtonText: {
        color: '#FFFEEA',
        fontSize: 16,
        fontWeight: 'bold',
    },
    cancelReceiptButton: {
        backgroundColor: '#E8D8C8',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    cancelReceiptButtonText: {
        color: '#874E3B',
        fontSize: 14,
        fontWeight: 'bold',
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
        borderColor: '#D4A574',
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
        backgroundColor: '#fffecaF2',
    },
    orderTypeTitle: {
        fontSize: 24,
        fontFamily: 'LobsterTwoItalic',
        color: '#874E3B',
        marginBottom: 30,
        textAlign: 'center',
    },
    orderTypeButtons: {
        flexDirection: 'row',
        gap: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fffecaF2',
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
        backgroundColor: '#874E3B',
    },
    takeOutButton: {
        backgroundColor: '#D4A574',
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
        marginBottom: 12,
        backgroundColor: 'rgba(255, 254, 234, 0.95)',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    orderTypeLabel: {
        fontSize: 16,
        color: '#874E3B',
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
        backgroundColor: '#874E3B',
    },
    takeOutBadge: {
        backgroundColor: '#D4A574',
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