// app/(tabs)/pos.tsx
import { useState, useEffect } from 'react';
import {
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ImageBackground,
    Alert,
    Image
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather } from "@expo/vector-icons";
import Navbar from '@/components/Navbar';
import { NetworkScanner } from '@/lib/network-scanner';
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';
import { OfflineSyncService } from '@/lib/offline-sync';

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
}

interface Category {
    id: string;
    name: string;
    icon?: string;
    items_count?: number;
    isOffline?: boolean;
}

interface ApiMenuItem {
    id: number | string;
    code: string;
    name: string;
    price: string | number;
    category: string;
    stocks: string | number;
    sales: string | number;
    status: string | number | boolean;
    description?: string;
    image?: string | null;
    created_at?: string;
    updated_at?: string;
}

interface ReceiptData {
    orderId: string;
    customerName: string;
    items: MenuItem[];
    subtotal: number;
    total: number;
    timestamp: string;
    status: 'unpaid' | 'paid' | 'cancelled';
}

export default function PosScreen() {
    const [searchQuery, setSearchQuery] = useState('');
    const [cart, setCart] = useState<MenuItem[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(false);
    const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
    const [isOnlineMode, setIsOnlineMode] = useState<boolean>(false);
    const [customerName, setCustomerName] = useState('');
    const [showReceiptModal, setShowReceiptModal] = useState(false);
    const [currentReceipt, setCurrentReceipt] = useState<ReceiptData | null>(null);

    const getApiBaseUrl = async (): Promise<string> => {
        try {
            const serverIP = await NetworkScanner.findServerIP();

            if (serverIP === 'demo') {
                console.log('🔄 POS Running in demo mode');
                setIsOnlineMode(false);
                return 'demo';
            }

            const baseUrl = `http://${serverIP}/backend/api`;
            console.log(`🌐 POS Using server: ${baseUrl}`);
            setIsOnlineMode(true);
            return baseUrl;

        } catch (error) {
            console.log('❌ POS Error detecting server, using offline mode');
            setIsOnlineMode(false);
            return 'demo';
        }
    };

    const loadMenuItems = async () => {
        setLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const API_BASE_URL = await getApiBaseUrl();
            setApiBaseUrl(API_BASE_URL);

            if (API_BASE_URL === 'demo') {
                console.log('📱 POS Loading OFFLINE data (demo + local storage)...');

                const offlineItems = await syncService.getItems();
                const allOfflineItems = [...offlineItems];

                const posItems: MenuItem[] = allOfflineItems.map(item => ({
                    ...item,
                    quantity: 0,
                    stocks: Number(item.stocks || 0),
                    status: item.status === true || item.status === '1' || item.status === 1,
                    isOffline: true
                }));

                setMenuItems(posItems);
                console.log('✅ POS Loaded OFFLINE items:', posItems.length, 'items');
                return;
            }

            console.log('🔗 POS Fetching from SERVER (ONLINE MODE)...');
            const response = await fetch(`${API_BASE_URL}/items.php`);

            if (!response.ok) throw new Error('HTTP error');

            const data: ApiMenuItem[] = await response.json();
            console.log('📦 POS Server data received:', data.length, 'items');

            const serverItems: MenuItem[] = data
                .filter((item: ApiMenuItem) =>
                    item.status === '1' || item.status === 1 || item.status === true
                )
                .map((item: ApiMenuItem) => ({
                    id: String(item.id),
                    code: String(item.code),
                    name: String(item.name),
                    price: Number(item.price),
                    category: String(item.category),
                    stocks: Number(item.stocks || 0),
                    quantity: 0,
                    status: true,
                    image: item.image || undefined,
                    isOffline: false
                }));

            setMenuItems(serverItems);
            console.log('✅ POS Loaded ONLINE items:', serverItems.length, 'active server items');

        } catch (error) {
            const syncService = OfflineSyncService.getInstance();
            const offlineItems = await syncService.getItems();
            const offlinePosItems: MenuItem[] = offlineItems.map(item => ({
                ...item,
                quantity: 0,
                stocks: Number(item.stocks || 0),
                status: item.status === true || item.status === '1' || item.status === 1,
                isOffline: true
            }));

            setMenuItems([...offlinePosItems]);
            setIsOnlineMode(false);
        } finally {
            setLoading(false);
        }
    };

    const loadCategories = async () => {
        try {
            const syncService = OfflineSyncService.getInstance();
            const API_BASE_URL = await getApiBaseUrl();

            if (API_BASE_URL === 'demo') {
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

            console.log('🔗 POS Fetching categories from SERVER (ONLINE MODE)...');
            const response = await fetch(`${API_BASE_URL}/categories.php`);

            if (!response.ok) throw new Error('HTTP error');

            const data = await response.json();
            console.log('📦 POS Server categories received:', data.length, 'categories');

            const offlineCategories = await syncService.getLocalCategories();

            const allCategoriesRaw = [
                ...data.map((category: any) => ({
                    id: String(category.id),
                    name: String(category.name),
                    icon: category.icon || 'folder',
                    items_count: category.items_count || 0,
                    isOffline: false
                })),
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
            console.log('❌ POS Error loading categories, falling back to OFFLINE mode');

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

    useFocusEffect(
        React.useCallback(() => {
            loadMenuItems();
            loadCategories();
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
        const currentStock = menuItems.find(menuItem => menuItem.id === item.id)?.stocks || 0;
        const currentInCart = cart.find(cartItem => cartItem.id === item.id)?.quantity || 0;

        if (currentInCart >= currentStock) {
            Alert.alert('Out of Stock', `No more ${item.name} available!`);
            return;
        }

        setMenuItems(prev => prev.map(menuItem =>
            menuItem.id === item.id
                ? { ...menuItem, stocks: menuItem.stocks - 1 }
                : menuItem
        ));

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
    };

    const removeFromCart = (id: string) => {
        const cartItem = cart.find(item => item.id === id);
        if (cartItem) {
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
    };

    const placeOrder = async () => {
        if (cart.length === 0) {
            Alert.alert('Empty Cart', 'Please add items to cart first!');
            return;
        }

        if (!customerName.trim()) {
            Alert.alert('Customer Name Required', 'Please enter customer name for the receipt');
            return;
        }

        setLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const API_BASE_URL = await getApiBaseUrl();

            const receiptData: ReceiptData = {
                orderId: `ORD-${Date.now()}`,
                customerName: customerName.trim(),
                items: [...cart],
                subtotal: subtotal,
                total: total,
                timestamp: new Date().toLocaleString(),
                status: 'unpaid'
            };

            console.log('🔄 [DUAL-SAVE] Starting dual-save process for order...');

            console.log('💾 [DUAL-SAVE] Step 1: Saving to LOCAL storage...');
            const existingReceipts = await syncService.getItem('pendingReceipts');
            const receipts = existingReceipts ? JSON.parse(existingReceipts) : [];
            receipts.push(receiptData);
            await syncService.setItem('pendingReceipts', JSON.stringify(receipts));

            console.log('✅ [DUAL-SAVE] Step 1 COMPLETE: Saved to LOCAL storage');

            if (API_BASE_URL !== 'demo' && isOnlineMode) {
                console.log('🌐 [DUAL-SAVE] Step 2: Attempting to save to SERVER...');

                try {
                    const response = await fetch(`${API_BASE_URL}/orders.php`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            orderId: receiptData.orderId,
                            customerName: receiptData.customerName,
                            items: receiptData.items,
                            subtotal: receiptData.subtotal,
                            total: receiptData.total,
                            status: receiptData.status
                        }),
                    });

                    let result;
                    const responseText = await response.text();

                    try {
                        result = JSON.parse(responseText);
                    } catch (parseError) {
                        console.error('❌ [DUAL-SAVE] Failed to parse JSON response:', responseText);
                        throw new Error('Server returned invalid JSON format');
                    }

                    if (!response.ok) {
                        throw new Error(result.message || `HTTP error! status: ${response.status}`);
                    }

                    if (result.success) {
                        console.log('✅ [DUAL-SAVE] Step 2 COMPLETE: Saved to SERVER successfully');
                        console.log('📄 Server response:', result);

                        if (result.order_id || result.id) {
                            console.log('🔄 [DUAL-SAVE] Updating local record with server info...');
                        }

                        console.log('🎉 [DUAL-SAVE] ORDER SAVED TO BOTH LOCAL AND SERVER!');

                    } else {
                        throw new Error(result.message || 'Server returned success: false');
                    }

                } catch (serverError) {
                    console.log('⚠️ [DUAL-SAVE] Server save failed, but local backup exists:', serverError);
                    console.log('📱 [DUAL-SAVE] Order saved to local storage only. Server sync will be retried later.');
                }
            } else {
                console.log('📱 [DUAL-SAVE] Offline mode - Only saved to LOCAL storage');
            }

            if (API_BASE_URL !== 'demo' && isOnlineMode) {
                console.log('📦 [DUAL-SAVE] Step 3: Updating server stocks...');

                for (const cartItem of cart) {
                    const currentItem = menuItems.find(item => item.id === cartItem.id);
                    if (currentItem && !currentItem.isOffline) {
                        const newStocks = currentItem.stocks;
                        const newSales = (currentItem as any).sales + cartItem.quantity || cartItem.quantity;

                        try {
                            const response = await fetch(`${API_BASE_URL}/items.php`, {
                                method: 'PUT',
                                headers: {
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    id: cartItem.id,
                                    stocks: newStocks,
                                    sales: newSales
                                }),
                            });

                            const result = await response.json();
                            if (!result.success) {
                                console.error('❌ Failed to update server item stocks:', cartItem.id);
                            } else {
                                console.log('✅ Updated server stocks for:', cartItem.name);
                            }
                        } catch (stockError) {
                            console.error('❌ Error updating server stocks:', stockError);
                        }
                    }
                }
                console.log('✅ [DUAL-SAVE] Step 3 COMPLETE: Server stocks updated');
            }

            setCurrentReceipt(receiptData);
            setShowReceiptModal(true);

            console.log('🎉 [DUAL-SAVE] ORDER PROCESS COMPLETED SUCCESSFULLY!');

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
                status: 'unpaid'
            };
            setCurrentReceipt(receiptData);
            setShowReceiptModal(true);
        } finally {
            setLoading(false);
        }
    };

    const handlePrintReceipt = () => {
        Alert.alert('Printing Receipt', 'Receipt sent to printer!');

        setTimeout(() => {
            Alert.alert('Printing Complete', 'Two copies printed successfully!');
            setShowReceiptModal(false);
            setCart([]);
            setCustomerName('');
        }, 2000);
    };

    const getImageSource = (item: MenuItem) => {
        if (!item.image) return null;

        if (typeof item.image === 'string') {
            if (apiBaseUrl === 'demo' || item.isOffline) {
                return null;
            }
            const serverIP = apiBaseUrl.replace('http://', '').replace('/backend/api', '');
            return { uri: `http://${serverIP}/backend/uploads/${item.image}` };
        } else {
            return item.image;
        }
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

                        <ThemedText style={styles.modeInfo}>
                            {isOnlineMode
                                ? 'Connected to server'
                                : 'Using local storage'
                            }
                        </ThemedText>

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
                                    <ThemedText style={styles.emptyCartSubText}>Tap on menu items to add them</ThemedText>
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
                                onPress={clearCart}
                                disabled={loading}
                            >
                                <ThemedText style={styles.cancelButtonText}>
                                    {loading ? 'Processing...' : 'Cancel'}
                                </ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.placeOrderButton, loading && styles.placeOrderButtonDisabled]}
                                onPress={placeOrder}
                                disabled={loading || cart.length === 0}
                            >
                                <ThemedText style={styles.placeOrderButtonText}>
                                    {loading ? 'Processing...' : 'Place Order'}
                                </ThemedText>
                            </TouchableOpacity>
                        </ThemedView>
                    </ThemedView>

                    <ThemedView style={styles.menuSection}>
                        <ThemedView style={styles.menuHeader}>
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
                    </ThemedView>
                </ThemedView>
            </ImageBackground>

            {showReceiptModal && currentReceipt && (
                <ThemedView style={styles.modalOverlay}>
                    <ThemedView style={styles.receiptModal}>
                        <ThemedView style={styles.receiptHeader}>
                            <ThemedText style={styles.receiptTitle}>KapeSpot</ThemedText>
                            <ThemedText style={styles.receiptSubtitle}>Order Receipt</ThemedText>
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

                        <ThemedView style={styles.receiptActions}>
                            <TouchableOpacity style={styles.printButton} onPress={handlePrintReceipt}>
                                <ThemedText style={styles.printButtonText}>Print Receipt (2 Copies)</ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.cancelReceiptButton}
                                onPress={() => setShowReceiptModal(false)}
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
        paddingTop: 8,
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
        marginBottom: 12,
        backgroundColor: "#fffecaF2",
    },
    inputLabel: {
        fontSize: 14,
        color: '#5A3921',
        marginBottom: 8,
        fontWeight: '500',
    },
    customerInput: {
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
});