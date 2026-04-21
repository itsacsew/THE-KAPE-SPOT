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
    Text,
    ActivityIndicator,
    Share,
    Platform
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather } from "@expo/vector-icons";
import Navbar from '@/components/Navbar';
import { NetworkScanner } from '@/lib/network-scanner';
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';
import { OfflineSyncService } from '@/lib/offline-sync';
import { PermissionsAndroid } from 'react-native';
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
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as RNFS from 'react-native-fs';
import BleManager from 'react-native-ble-manager';
import ReactNativeBlobUtil from 'react-native-blob-util'; // ADD THIS IMPORT

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
    notes?: string;
}

interface BluetoothConnection {
    connected: boolean;
    deviceName: string;
    peripheralId: string;
    serviceId: string;
    connectedAt: string | null;
}

// Interface for grouped item export
interface GroupedExportItem {
    name: string;
    totalQuantity: number;
    price: number;
    totalSales: number;
    dates: string[];
}

const { width } = Dimensions.get('window');
const CARD_MARGIN = 8;
const CARD_WIDTH = (width - (CARD_MARGIN * 10)) / 2; // 2 columns with margins

export default function LogScreen() {
    const [orders, setOrders] = useState<OrderData[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOnlineMode, setIsOnlineMode] = useState<boolean>(false);
    const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null);
    const [showOrderModal, setShowOrderModal] = useState(false);
    const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid' | 'cancelled'>('all');
    const [showItemsModal, setShowItemsModal] = useState(false);
    const [allItems, setAllItems] = useState<{
        name: string;
        quantity: number;
        price: number;
        totalPrice: number;
        orderIds: string[];
        customerNames: string[];
        dates: string[];
    }[]>([]);
    const [isBluetoothConnected, setIsBluetoothConnected] = useState<boolean>(false);
    const [bluetoothDeviceName, setBluetoothDeviceName] = useState<string>('');
    const [bluetoothConnection, setBluetoothConnection] = useState<BluetoothConnection | null>(null);
    const [isPrinting, setIsPrinting] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<string>('');
    const [hasFirebaseData, setHasFirebaseData] = useState<boolean>(false);
    const [checkingFirebase, setCheckingFirebase] = useState<boolean>(false);
    const [exportingItems, setExportingItems] = useState(false);

    // Initialize Firebase
    const db = getFirestore(app);

    // IMPROVED: Real-time Firebase listener for ALL orders (unpaid, paid, cancelled)
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
                                    updated_at: docData.updated_at,
                                    notes: docData.notes || ''
                                };

                                firebaseOrders.push(order);
                            });

                            console.log('✅ Processed orders count:', firebaseOrders.length);

                            // Sort by timestamp with proper undefined handling
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

    // Load orders with better error handling
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
                allOrders = localOrders;
                console.log('📱 Local orders loaded:', allOrders.length);

                // Sort by timestamp
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
                            updated_at: data.updated_at,
                            notes: data.notes || ''
                        };
                    });

                    allOrders = firebaseOrders;

                    // Check if there's data in Firebase
                    setHasFirebaseData(firebaseOrders.length > 0);

                    // Sort by timestamp
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
                    allOrders = localOrders;

                    // Sort by timestamp
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
            // Final fallback - try to get from local storage
            try {
                const syncService = OfflineSyncService.getInstance();
                const localOrders = await syncService.getPendingReceipts();
                const filteredOrders = localOrders;

                // Sort by timestamp
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
                setOrders([]);
            }
        } finally {
            setLoading(false);
        }
    };

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

    // showAllItems with date tracking for export
    const showAllItems = () => {
        try {
            // Use Map to combine same items
            const itemsMap = new Map<string, {
                name: string;
                quantity: number;
                price: number;
                totalPrice: number;
                orderIds: string[];
                customerNames: string[];
                dates: string[];
            }>();

            orders.forEach(order => {
                // Only include paid orders for the items list
                if (order.status === 'paid') {
                    order.items.forEach(item => {
                        // Only include non-cancelled items
                        if (!item.cancelled) {
                            const itemKey = item.name.trim().toLowerCase();
                            const originalName = item.name;
                            const orderDate = new Date(order.timestamp).toLocaleDateString();
                            
                            if (itemsMap.has(itemKey)) {
                                const existing = itemsMap.get(itemKey)!;
                                existing.quantity += item.quantity;
                                existing.totalPrice += (item.price * item.quantity);
                                if (!existing.orderIds.includes(order.orderId)) {
                                    existing.orderIds.push(order.orderId);
                                }
                                if (!existing.customerNames.includes(order.customerName)) {
                                    existing.customerNames.push(order.customerName);
                                }
                                if (!existing.dates.includes(orderDate)) {
                                    existing.dates.push(orderDate);
                                }
                            } else {
                                itemsMap.set(itemKey, {
                                    name: originalName,
                                    quantity: item.quantity,
                                    price: item.price,
                                    totalPrice: item.price * item.quantity,
                                    orderIds: [order.orderId],
                                    customerNames: [order.customerName],
                                    dates: [orderDate]
                                });
                            }
                        }
                    });
                }
            });

            // Convert Map to array and sort by name
            const groupedItems = Array.from(itemsMap.values()).sort((a, b) => 
                a.name.localeCompare(b.name)
            );
            
            setAllItems(groupedItems);
            setShowItemsModal(true);
        } catch (error) {
            console.error('❌ Error preparing items list:', error);
            Alert.alert('Error', 'Failed to load items list');
        }
    };

    // NEW EXPORT FUNCTION - MATCHING try.tsx APPROACH
    // Generate CSV content with grouped items (BY ITEM, not by order)
    const generateGroupedItemsCSV = (items: any[]): string => {
        // Create CSV content with proper headers
        let csvContent = 'ITEMS,QNTY,PRICE OF THE ITEM,TOTAL SALES,DATE ORDERED\n';

        let grandTotalSales = 0;
        let totalQuantity = 0;

        // Sort items by name
        const sortedItems = [...items].sort((a, b) => a.name.localeCompare(b.name));

        sortedItems.forEach((item) => {
            // Clean item name - remove problematic characters
            const cleanItemName = item.name
                .replace(/,/g, ' ')      // Remove commas
                .replace(/"/g, "'")      // Replace double quotes with single
                .replace(/\n/g, ' ')     // Remove new lines
                .replace(/\r/g, ' ')     // Remove carriage returns
                .trim();

            const quantity = item.quantity;
            const unitPrice = item.price;
            const totalSales = item.totalPrice;
            const datesString = item.dates.join(', ');

            csvContent += `"${cleanItemName}","${quantity}","₱${unitPrice.toFixed(2)}","₱${totalSales.toFixed(2)}","${datesString}"\n`;
            
            grandTotalSales += totalSales;
            totalQuantity += quantity;
        });

        // Add summary section
        csvContent += '\n';
        csvContent += '"SUMMARY","","","",""\n';
        csvContent += `"Total Unique Items","${sortedItems.length}","","",""\n`;
        csvContent += `"Total Quantity Sold","${totalQuantity}","","",""\n`;
        csvContent += `"Grand Total Sales","","","","₱${grandTotalSales.toFixed(2)}"\n`;
        csvContent += `"Export Date","${new Date().toLocaleDateString()}","","",""\n`;
        csvContent += `"Generated By","KapeSpot POS","","",""\n`;

        return csvContent;
    };


// ============== 100% WORKING EXPORT FUNCTION ==============
const exportGroupedItemsToExcel = async () => {
    if (allItems.length === 0) {
        Alert.alert('No Data', 'There are no items to export.');
        return;
    }

    setExportingItems(true);
    
    try {
        // Request permission for Android
        if (Platform.OS === 'android') {
            const androidVersion = parseInt(String(Platform.Version), 10);
            
            if (androidVersion < 29) { // Below Android 10 needs permission
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
                    {
                        title: 'Storage Permission',
                        message: 'App needs permission to save CSV files to Downloads folder',
                        buttonPositive: 'OK',
                        buttonNegative: 'Cancel',
                    }
                );
                if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                    Alert.alert('Permission Denied', 'Cannot save file without storage permission.');
                    setExportingItems(false);
                    return;
                }
            }
        }

        const csvContent = generateGroupedItemsCSV(allItems);
        const timestamp = new Date().toISOString().split('T')[0];
        const fileName = `KapeSpot_Items_Report_${timestamp}.csv`;
        
        // ============== DIRECT SAVE TO /storage/Download/ ==============
        let filePath = '';
        
        if (Platform.OS === 'android') {
            // Try multiple paths to find the working one
            const possiblePaths = [
                '/storage/Download', 
                ReactNativeBlobUtil.fs.dirs.DownloadDir,
            ];
            
            let workingPath = '';
            for (const path of possiblePaths) {
                try {
                    const folderExists = await ReactNativeBlobUtil.fs.exists(path);
                    if (folderExists) {
                        workingPath = path;
                        console.log('✅ Found working path:', path);
                        break;
                    }
                } catch (e) {
                    console.log('Path not accessible:', path);
                }
            }
            
            // If no path found, use default
            if (!workingPath) {
                workingPath = '/storage/Download';
                // Create folder if not exists
                try {
                    await ReactNativeBlobUtil.fs.mkdir(workingPath);
                } catch (e) {
                    console.log('Folder creation skipped:', e);
                }
            }
            
            filePath = `${workingPath}/${fileName}`;
        } else {
            // iOS path
            const dirs = ReactNativeBlobUtil.fs.dirs;
            filePath = `${dirs.DocumentDir}/${fileName}`;
        }
        
        console.log('📁 Saving to:', filePath);
        
        // Write the file
        await ReactNativeBlobUtil.fs.writeFile(filePath, csvContent, 'utf8');
        
        // Verify file exists
        const fileExists = await ReactNativeBlobUtil.fs.exists(filePath);
        
        if (!fileExists) {
            throw new Error('File save failed - file not found after write');
        }
        
        // Get file info
        const fileInfo = await ReactNativeBlobUtil.fs.stat(filePath);
        console.log('✅ File saved:', fileInfo);
        
        // Calculate totals
        const totalUniqueItems = allItems.length;
        const totalQuantitySold = allItems.reduce((sum, item) => sum + item.quantity, 0);
        const grandTotalSales = allItems.reduce((sum, item) => sum + item.totalPrice, 0);
        
        // Show success with DOWNLOAD button
        Alert.alert(
            '✅ Export Successful!',
            `📊 ${totalUniqueItems} unique items\n🥤 ${totalQuantitySold} servings\n💰 ₱${grandTotalSales.toFixed(2)}\n\n📄 ${fileName}\n📂 storage/Download/`,
            [
                {
                    text: '💾 DOWNLOAD FILE',
                    onPress: () => downloadFileNow(filePath, fileName)
                },
                {
                    text: 'OK',
                    style: 'default'
                }
            ]
        );
        
    } catch (error: any) {
        console.error('Export error:', error);
        Alert.alert('Export Failed', error?.message || 'Unknown error occurred');
    } finally {
        setExportingItems(false);
    }
};

// ============== DOWNLOAD FILE FUNCTION ==============
const downloadFileNow = async (filePath: string, fileName: string) => {
    try {
        // Check if file exists
        const exists = await ReactNativeBlobUtil.fs.exists(filePath);
        
        if (!exists) {
            Alert.alert('Error', 'File not found. Please export again.');
            return;
        }
        
        if (Platform.OS === 'android') {
            // For Android - trigger download manager
            // This will show the system download notification
            await ReactNativeBlobUtil.android.addCompleteDownload({
                title: fileName,
                description: 'KapeSpot Items Report',
                mime: 'text/csv',
                path: filePath,
                showNotification: true,
            });
            
            Alert.alert(
                '✅ Download Complete!',
                `File saved to:\n📂 ${filePath}\n\nCheck your File Manager or Downloads app.`,
                [{ text: 'OK' }]
            );
        } else {
            // For iOS - share and save
            await Sharing.shareAsync(filePath, {
                mimeType: 'text/csv',
                dialogTitle: 'Save CSV Report',
                UTI: 'public.comma-separated-values-text'
            });
        }
        
    } catch (error: any) {
        console.error('Download error:', error);
        Alert.alert('Download Failed', error?.message || 'Unable to download file');
    }
};

// Function to open downloaded file
const openDownloadedFile = async (filePath: string) => {
    try {
        const fileExists = await ReactNativeBlobUtil.fs.exists(filePath);
        
        if (!fileExists) {
            Alert.alert('File Not Found', 'The file has been moved or deleted.');
            return;
        }
        
        if (Platform.OS === 'android') {
            await ReactNativeBlobUtil.android.actionViewIntent(filePath, 'text/csv');
        } else {
            // For iOS - use Sharing
            await Sharing.shareAsync(filePath, {
                mimeType: 'text/csv',
                dialogTitle: 'Share CSV File',
            });
        }
    } catch (error) {
        console.error('Error opening file:', error);
        Alert.alert('Cannot Open', 'Please use File Manager to open the file from Downloads folder.');
    }
};

// Function to open Downloads folder directly
const openDownloadsFolder = async () => {
    try {
        if (Platform.OS === 'android') {
            const downloadsPath = ReactNativeBlobUtil.fs.dirs.DownloadDir;
            await ReactNativeBlobUtil.android.actionViewIntent(downloadsPath, 'resource/folder');
        } else {
            Alert.alert(
                'iOS Instructions',
                'Open the Files app and go to Downloads folder to find your CSV file.',
                [{ text: 'OK' }]
            );
        }
    } catch (error) {
        Alert.alert(
            'Downloads Folder',
            `Your file is saved in the Downloads folder.\n\nPath: ${ReactNativeBlobUtil.fs.dirs.DownloadDir}`,
            [{ text: 'OK' }]
        );
    }
};

// NEW FUNCTION: Download file to device (forces download/save)
const downloadFileToDevice = async (filePath: string, fileName: string) => {
    try {
        // Check if file exists
        const fileExists = await ReactNativeBlobUtil.fs.exists(filePath);
        
        if (!fileExists) {
            Alert.alert('File Not Found', 'The file does not exist. Please export again.');
            return;
        }

        // For Android - trigger download notification
        if (Platform.OS === 'android') {
            // This will show in the device's download manager
            await ReactNativeBlobUtil.android.actionViewIntent(filePath, 'text/csv');
            
            Alert.alert(
                '✅ Download Complete!',
                `File "${fileName}" has been saved to your Downloads folder.\n\nYou can find it in:\n• File Manager > Downloads\n• Download Manager app`,
                [{ text: 'OK' }]
            );
        } else {
            // For iOS - share the file
            const shareOptions = {
                title: 'Save CSV File',
                url: filePath,
                type: 'text/csv'
            };
            await Share.share(shareOptions);
        }
    } catch (error) {
        console.error('Download error:', error);
        Alert.alert(
            'Download Failed',
            'Unable to download file. Please check storage permissions.'
        );
    }
};

    // Helper function to open file manager (updated for better Android support)
const openFileManager = async (filePath: string) => {
    try {
        if (Platform.OS === 'android') {
            // Check if file exists first
            const fileExists = await ReactNativeBlobUtil.fs.exists(filePath);
            
            if (!fileExists) {
                Alert.alert('File Not Found', 'The file no longer exists. Please export again.');
                return;
            }
            
            // For Android - try to open the file directly
            await ReactNativeBlobUtil.android.actionViewIntent(filePath, 'text/csv');
        } else {
            // For iOS - share the file
            const shareOptions = {
                title: 'Share CSV File',
                url: `file://${filePath}`,
                type: 'text/csv'
            };
            await Share.share(shareOptions);
        }
    } catch (error) {
        console.error('Error opening file manager:', error);
        // Fallback: Show detailed instructions
        const fileName = filePath.split('/').pop();
        Alert.alert(
            '📁 File Location',
            `Your CSV file has been saved to:\n\n📂 Downloads folder\n📄 File: ${fileName}\n\nTo access it:\n1. Open your File Manager app\n2. Navigate to Downloads folder\n3. Look for ${fileName}`,
            [{ text: 'OK' }]
        );
    }
};

    const closeItemsModal = () => {
        setShowItemsModal(false);
        setAllItems([]);
    };

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

    // Render orders in 2-column grid - similar to POS menu items
    const renderOrdersGrid = () => {
        if (loading) {
            return (
                <ThemedView style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#874E3B" />
                    <ThemedText style={styles.loadingContainers}>Loading orders...</ThemedText>
                </ThemedView>
            );
        }

        const filteredOrders = getFilteredOrders();

        if (filteredOrders.length === 0) {
            return (
                <ThemedView style={styles.emptyContainer}>
                    <Feather name="archive" size={48} color="#854442" />
                    <ThemedText style={styles.emptyText}>No orders found</ThemedText>
                    <ThemedText style={styles.emptySubtext}>
                        {filter === 'all'
                            ? 'No orders yet'
                            : `No ${filter} orders found`}
                    </ThemedText>
                </ThemedView>
            );
        }

        // Create rows with 2 orders per row (like POS menu items)
        const rows = [];
        for (let i = 0; i < filteredOrders.length; i += 2) {
            const rowOrders = filteredOrders.slice(i, i + 2);
            rows.push(
                <ThemedView key={`row-${i}`} style={styles.ordersRow}>
                    {rowOrders.map((order, orderIndex) => (
                        <TouchableOpacity
                            key={`${order.orderId}-${orderIndex}`}
                            style={styles.orderCard}
                            onPress={() => openOrderModal(order)}
                        >
                            {/* Order Header */}
                            <ThemedView style={styles.orderHeader}>
                                <ThemedText style={styles.orderId}>
                                    #{getOrderNumberIndicator(filteredOrders, order.orderId)}
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

                            {/* Order Type Indicator */}
                            {order.order_type && (
                                <ThemedView style={styles.orderTypeTag}>
                                    <Feather 
                                        name={order.order_type === 'dine-in' ? "coffee" : "shopping-bag"} 
                                        size={8} 
                                        color="#FFFEEA" 
                                    />
                                    <ThemedText style={styles.orderTypeTagText}>
                                        {order.order_type === 'dine-in' ? 'DINE IN' : 'TAKE OUT'}
                                    </ThemedText>
                                </ThemedView>
                            )}

                            {/* Notes Section in Order Card */}
                            {order.notes && order.notes.trim() !== '' && (
                                <ThemedView style={styles.notesTag}>
                                    <Feather name="message-square" size={8} color="#874E3B" />
                                    <ThemedText style={styles.notesTagText} numberOfLines={2}>
                                        {order.notes.length > 40 ? order.notes.substring(0, 40) + '...' : order.notes}
                                    </ThemedText>
                                </ThemedView>
                            )}

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

                            {/* Cups Used (for take-out orders) */}
                            {order.order_type === 'take-out' && order.cups_used && order.cups_used > 0 && (
                                <ThemedView style={styles.cupsTag}>
                                    <Feather name="coffee" size={8} color="#874E3B" />
                                    <ThemedText style={styles.cupsTagText}>
                                        Cups: {order.cups_used}
                                    </ThemedText>
                                </ThemedView>
                            )}

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
                    ))}
                    {/* Fill empty slot if only 1 order in row */}
                    {rowOrders.length < 2 && (
                        <ThemedView style={styles.emptyCard} />
                    )}
                </ThemedView>
            );
        }

        return rows;
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
                                        <Feather name="refresh-cw" size={18} color="#F5E6D3" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.itemsButton}
                                        onPress={showAllItems}
                                        disabled={loading || orders.length === 0}
                                    >
                                        <Feather name="list" size={18} color="#F5E6D3" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.deleteButton}
                                        onPress={deleteAllOrders}
                                        disabled={loading}
                                    >
                                        <Feather name="trash-2" size={18} color="#F5E6D3" />
                                    </TouchableOpacity>
                                </ThemedView>
                            </ThemedView>

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

                    {/* Orders Grid Container - 2 COLUMN LAYOUT */}
                    <ThemedView style={styles.ordersContainer}>
                        <ScrollView
                            style={styles.scrollView}
                            contentContainerStyle={styles.ordersGrid}
                            showsVerticalScrollIndicator={false}
                        >
                            {renderOrdersGrid()}
                        </ScrollView>
                    </ThemedView>

                    {/* Order Details Modal */}
                    <Modal
                        visible={showOrderModal}
                        animationType="slide"
                        transparent={true}
                        onRequestClose={closeOrderModal}
                        statusBarTranslucent={true}
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

                                    {/* Order Type in Modal */}
                                    {selectedOrder?.order_type && (
                                        <ThemedView style={styles.orderTypeSection}>
                                            <ThemedText style={styles.orderTypeLabel}>Order Type:</ThemedText>
                                            <ThemedView style={[
                                                styles.orderTypeBadgeModal,
                                                selectedOrder.order_type === 'dine-in' ? styles.dineInBadge : styles.takeOutBadge
                                            ]}>
                                                <Feather
                                                    name={selectedOrder.order_type === 'dine-in' ? "coffee" : "shopping-bag"}
                                                    size={12}
                                                    color="#FFFEEA"
                                                />
                                                <ThemedText style={styles.orderTypeBadgeText}>
                                                    {selectedOrder.order_type === 'dine-in' ? 'DINE IN' : 'TAKE OUT'}
                                                </ThemedText>
                                            </ThemedView>
                                        </ThemedView>
                                    )}

                                    {/* Notes Section in Modal */}
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

                                    {/* Cups Used in Modal */}
                                    {selectedOrder?.order_type === 'take-out' && selectedOrder?.cups_used && selectedOrder.cups_used > 0 && (
                                        <ThemedView style={styles.cupsSection}>
                                            <ThemedText style={styles.cupsLabel}>Cups Used:</ThemedText>
                                            <ThemedText style={styles.cupsValue}>{selectedOrder.cups_used}</ThemedText>
                                        </ThemedView>
                                    )}

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

                    {/* All Items List Modal - WITH UPDATED EXPORT BUTTON */}
                    <Modal
                        visible={showItemsModal}
                        animationType="slide"
                        transparent={true}
                        onRequestClose={closeItemsModal}
                        statusBarTranslucent={true}
                    >
                        <ThemedView style={styles.modalOverlay}>
                            <ThemedView style={styles.itemsModal}>
                                <ThemedView style={styles.modalHeader}>
                                    <ThemedView style={styles.modalHeaderLeft}>
                                        <ThemedText style={styles.modalTitle}>
                                            All Order Items
                                        </ThemedText>
                                        <ThemedText style={styles.itemsCount}>
                                            {allItems.length} unique items total
                                        </ThemedText>
                                    </ThemedView>
                                    <ThemedView style={styles.modalHeaderRight}>
                                        {/* Export to Excel Button - UPDATED to use new export function */}
                                        <TouchableOpacity
                                            style={[styles.exportItemsButton, exportingItems && styles.exportButtonDisabled]}
                                            onPress={exportGroupedItemsToExcel}
                                            disabled={exportingItems || allItems.length === 0}
                                        >
                                            {exportingItems ? (
                                                <ActivityIndicator size="small" color="#FFFEEA" />
                                            ) : (
                                                <Feather name="download" size={18} color="#FFFEEA" />
                                            )}
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={closeItemsModal} style={styles.closeButton}>
                                            <Feather name="x" size={24} color="#854442" />
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
                                                    From {item.orderIds.length} order(s): {item.customerNames.slice(0, 2).join(', ')}
                                                    {item.customerNames.length > 2 && ` +${item.customerNames.length - 2} more`}
                                                </ThemedText>
                                                <ThemedText style={styles.itemDateInfo}>
                                                    Date Paid: {item.dates.join(', ')}
                                                </ThemedText>
                                            </ThemedView>

                                            <ThemedView style={styles.itemPriceSection}>
                                                <ThemedText style={styles.itemQuantityModal}>
                                                    x{item.quantity}
                                                </ThemedText>
                                                <ThemedText style={styles.itemPriceModal}>
                                                    ₱{item.totalPrice.toFixed(2)}
                                                </ThemedText>
                                                <ThemedText style={styles.itemUnitPrice}>
                                                    @ ₱{item.price.toFixed(2)} each
                                                </ThemedText>
                                            </ThemedView>
                                        </ThemedView>
                                    ))}
                                </ScrollView>

                                <ThemedView style={styles.itemsFooter}>
                                    <ThemedText style={styles.itemsTotal}>
                                        Total: ₱{allItems.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2)}
                                    </ThemedText>
                                    <ThemedText style={styles.itemsCountFooter}>
                                        {allItems.length} unique items • {allItems.reduce((sum, item) => sum + item.quantity, 0)} total servings
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
        backgroundColor: "rgba(223, 204, 175, 0.7)",
        borderRadius: 12,
        padding: 5,
        borderWidth: 1,
        borderColor: '#854442',
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'transparent'
    },
    headerButtons: {
        flexDirection: 'row',
        gap: 8,
        backgroundColor: 'transparent'
    },
    mainTitle: {
        fontSize: 28,
        color: '#854442',
        fontFamily: 'LobsterTwoItalic',
        lineHeight: 50
    },
    lastUpdateText: {
        fontSize: 11,
        color: '#8B7355',
        fontStyle: 'italic',
        marginTop: 2,
        fontWeight: 'bold'
    },
    filterContainer: {
        flexDirection: 'row',
        marginTop: 12,
        gap: 4,
        backgroundColor: 'transparent'
    },
    filterButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
        backgroundColor: '#F5E6D3',
        borderWidth: 1,
        borderColor: '#854442',
    },
    filterButtonActive: {
        backgroundColor: '#854442',
        borderColor: '#854442',
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
        backgroundColor: '#854442',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#F5E6D3',
    },
    itemsButton: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: '#854442',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#F5E6D3',
    },
    deleteButton: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: '#854442',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#F5E6D3',
    },
    ordersContainer: {
        flex: 1,
        backgroundColor: "rgba(223, 204, 175, 0.7)",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#854442',
        padding: 12,
    },
    scrollView: {
        flex: 1,
    },
    ordersGrid: {
        flexDirection: 'column',
    },
    ordersRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
        backgroundColor: 'transparent',
    },
    orderCard: {
        width: CARD_WIDTH,
        backgroundColor: "#FFFEEA",
        borderRadius: 12,
        padding: 10,
        borderWidth: 2,
        borderColor: '#F5E6D3',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },
    emptyCard: {
        width: CARD_WIDTH,
        backgroundColor: 'transparent',
    },
    orderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 6,
        backgroundColor: 'transparent'
    },
    orderId: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#854442',
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
        fontSize: 15,
        fontWeight: '700',
        color: '#854442',
        marginBottom: 4,
    },
    orderTypeTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#874E3B',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        alignSelf: 'flex-start',
        marginBottom: 4,
        gap: 4,
    },
    orderTypeTagText: {
        color: '#FFFEEA',
        fontSize: 8,
        fontWeight: 'bold',
    },
    notesTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF3E0',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 4,
        alignSelf: 'flex-start',
        marginBottom: 4,
        gap: 4,
        borderWidth: 1,
        borderColor: '#D4A574',
        maxWidth: '100%',
    },
    notesTagText: {
        color: '#874E3B',
        fontSize: 8,
        fontWeight: '500',
        flex: 1,
        flexWrap: 'wrap',
    },
    orderDate: {
        fontSize: 10,
        color: '#8B7355',
        marginBottom: 6,
        fontStyle: 'italic',
    },
    itemDisplay: {
        flex: 1,
        marginTop: 2,
        justifyContent: 'center',
        marginBottom: 6,
        minHeight: 50,
        backgroundColor: 'transparent'
    },
    mainItem: {
        fontSize: 13,
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
        marginBottom: 2,
        paddingTop: 4,
        borderTopWidth: 1,
        borderTopColor: '#E8D8C8',
        backgroundColor: 'transparent'
    },
    totalLabel: {
        fontSize: 15,
        color: '#854442',
        fontWeight: '600',
    },
    orderTotal: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#854442',
    },
    cupsTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5E6D3',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        alignSelf: 'flex-start',
        marginBottom: 6,
        gap: 4,
    },
    cupsTagText: {
        color: '#874E3B',
        fontSize: 8,
        fontWeight: 'bold',
    },
    viewButton: {
        backgroundColor: '#874E3B',
        paddingVertical: 6,
        borderRadius: 6,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#6B3E2D',
    },
    viewButtonText: {
        color: '#FFFEEA',
        fontSize: 9,
        fontWeight: 'bold',
    },
    loadingContainer: {
        padding: 20,
        alignItems: 'center',
        width: '100%',
        backgroundColor: 'transparent'
    },
    loadingContainers:{
        color: '#854442',
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
        textAlign: 'center'
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
        borderBottomColor: '#854442',
    },
    modalHeaderLeft: {
        flex: 1,
        backgroundColor: 'transparent'
    },
    modalHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'transparent'
    },
    modalTitleContainer: {
        flex: 1,
        backgroundColor: 'transparent'
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
        borderColor: '#854442',
        overflow: 'hidden',
        maxHeight: '90%',
        height: 'auto',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#854442',
        fontFamily: 'LobsterTwoRegular',
        marginBottom: 4,
        backgroundColor: 'transparent'
    },
    modalContent: {
        padding: 20,
        backgroundColor: 'transparent'
    },
    customerSection: {
        marginBottom: 12,
        backgroundColor: 'transparent'
    },
    customerLabel: {
        fontSize: 14,
        color: '#854442',
        marginBottom: 4,
    },
    customerInfo: {
        fontSize: 20,
        fontWeight: '700',
        color: '#854442',
    },
    timeSection: {
        marginBottom: 12,
        backgroundColor: 'transparent'
    },
    timeLabel: {
        fontSize: 14,
        color: '#854442',
        marginBottom: 4,
    },
    timeInfo: {
        fontSize: 16,
        fontWeight: '600',
        color: '#854442',
    },
    orderTypeSection: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 8,
        backgroundColor: 'transparent'
    },
    orderTypeLabel: {
        fontSize: 16,
        color: '#854442',
    },
    orderTypeBadgeModal: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    dineInBadge: {
        backgroundColor: '#854442',
    },
    takeOutBadge: {
        backgroundColor: '#854442',
    },
    orderTypeBadgeText: {
        color: '#FFFEEA',
        fontSize: 10,
        fontWeight: 'bold',
    },
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
    cupsSection: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 8,
        backgroundColor: '#F5E6D3',
        padding: 8,
        borderRadius: 8,
    },
    cupsLabel: {
        fontSize: 14,
        color: '#874E3B',
        fontWeight: 'bold',
    },
    cupsValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    itemsSection: {
        marginBottom: 20,
        backgroundColor: 'transparent'
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
        backgroundColor: 'transparent'
    },
    itemInfo: {
        flex: 1,
        backgroundColor: 'transparent'
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
        backgroundColor: 'transparent'
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
        borderTopColor: '#854442',
        paddingTop: 16,
        backgroundColor: 'transparent'
    },
    subtotalSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        backgroundColor: 'transparent'
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
        backgroundColor: 'transparent'
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
        borderColor: '#854442',
        overflow: 'hidden',
    },
    itemsList: {
        flex: 1,
        padding: 16,
        maxHeight: '80%',
        backgroundColor: 'transparent'
    },
    itemRowModal: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E8D8C8',
        minHeight: 60,
        backgroundColor: 'transparent'
    },
    itemNameSection: {
        flex: 1,
        marginRight: 12,
        backgroundColor: 'transparent'
    },
    itemNameModal: {
        fontSize: 18,
        fontWeight: '600',
        color: '#854442',
        marginBottom: 4,
        flex: 1,
    },
    itemOrderInfo: {
        fontSize: 11,
        color: '#8B7355',
        fontStyle: 'italic',
        marginTop: 2,
    },
    itemDateInfo: {
        fontSize: 10,
        color: '#D4A574',
        marginTop: 2,
    },
    itemPriceSection: {
        alignItems: 'flex-end',
        minWidth: 100,
        backgroundColor: 'transparent'
    },
    itemQuantityModal: {
        fontSize: 16,
        color: '#854442',
        marginBottom: 2,
        fontWeight: '600',
    },
    itemPriceModal: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#854442',
    },
    itemUnitPrice: {
        fontSize: 10,
        color: '#8B7355',
        marginTop: 2,
    },
    itemsFooter: {
        padding: 20,
        borderTopWidth: 2,
        borderTopColor: '#854442',
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
    // Export Items Button Styles
    exportItemsButton: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: '#16A34A',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#16A34A',
    },
    exportButtonDisabled: {
        backgroundColor: '#C4A484',
        borderColor: '#C4A484',
    },
    closeButton: {
        padding: 4,
        backgroundColor: 'transparent'
    },
});