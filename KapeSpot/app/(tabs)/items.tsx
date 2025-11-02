// app/(tabs)/items.tsx
import { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, TextInput, TouchableOpacity, ImageBackground, Alert, Modal } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather } from "@expo/vector-icons";
import Navbar from '@/components/Navbar';
import { router } from 'expo-router';
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
    deleteDoc,
    doc,
    query,
    where,
    orderBy
} from 'firebase/firestore';
import { app } from '@/lib/firebase-config';

interface MenuItem {
    id: string;
    code: string;
    name: string;
    price: number;
    category: string;
    stocks: number;
    sales: number;
    status: boolean;
    description?: string;
    image?: string;
    isOffline?: boolean;
    firebaseId?: string;
}

interface Category {
    id: string;
    name: string;
    icon?: string;
    items_count: number;
    created_on: string;
    isOffline?: boolean;
    firebaseId?: string;
}

interface CupItem {
    id: string;
    name: string;
    stocks: number;
    size?: string;
    status?: boolean;
    isOffline?: boolean;
    firebaseId?: string;
}

interface PendingItem {
    id: string;
    type: 'CREATE_ITEM' | 'UPDATE_ITEM' | 'DELETE_ITEM' | 'CREATE_CATEGORY' | 'UPDATE_CATEGORY' | 'DELETE_CATEGORY' | 'CREATE_CUP' | 'UPDATE_CUP' | 'DELETE_CUP';
    data: any;
    timestamp: number;
    retryCount: number;
    serverId?: string;
}

interface User {
    id: string;
    username: string;
    role: 'user' | 'admin';
    name: string;
    firebaseUID?: string;
}

export default function ItemsScreen() {
    const [searchQuery, setSearchQuery] = useState('');
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [cupItems, setCupItems] = useState<CupItem[]>([]);
    const [activeSidebar, setActiveSidebar] = useState('food-items');
    const [currentPage, setCurrentPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [cupsLoading, setCupsLoading] = useState(false);
    const [categoriesLoading, setCategoriesLoading] = useState(false);
    const [isOnlineMode, setIsOnlineMode] = useState<boolean>(false);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userRole, setUserRole] = useState<'user' | 'admin'>('user');

    // Modal states
    const [editStocksModal, setEditStocksModal] = useState(false);
    const [selectedCup, setSelectedCup] = useState<CupItem | null>(null);
    const [newStocks, setNewStocks] = useState('');

    // Category Modal states
    const [categoryModalVisible, setCategoryModalVisible] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [categoryName, setCategoryName] = useState('');
    const [categoryIcon, setCategoryIcon] = useState('folder');

    // Item Edit Modal states
    const [editItemModal, setEditItemModal] = useState(false);
    const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
    const [editItemStocks, setEditItemStocks] = useState('');
    const [editItemPrice, setEditItemPrice] = useState('');

    // Cup Modal states
    const [cupModalVisible, setCupModalVisible] = useState(false);
    const [editingCup, setEditingCup] = useState<CupItem | null>(null);
    const [cupName, setCupName] = useState('');
    const [cupSize, setCupSize] = useState('');
    const [cupStocks, setCupStocks] = useState('');

    const itemsPerPage = 10;
    const db = getFirestore(app);

    // Load current user data
    useEffect(() => {
        const loadCurrentUser = async () => {
            try {
                const syncService = OfflineSyncService.getInstance();
                const userData = await syncService.getItem('currentUser');
                if (userData) {
                    const user = JSON.parse(userData);
                    setCurrentUser(user);
                    setUserRole(user.role || 'user');
                    console.log('👤 Current user role:', user.role);
                }
            } catch (error) {
                console.error('Error loading user data:', error);
            }
        };

        loadCurrentUser();
    }, []);

    // Check if user has admin privileges
    const isAdmin = userRole === 'admin';

    // Function to get connection mode - IMPROVED VERSION
    const getConnectionMode = async (): Promise<'online' | 'offline'> => {
        try {
            console.log('🔍 Checking connection mode...');
            const mode = await NetworkScanner.getApiBaseUrl();
            const isOnline = mode === 'online';
            setIsOnlineMode(isOnline);

            console.log('🌐 Connection Mode:', isOnline ? 'ONLINE' : 'OFFLINE');

            // If online, trigger immediate sync
            if (isOnline) {
                console.log('🚀 Online detected - triggering immediate sync...');
                setTimeout(() => {
                    const syncService = OfflineSyncService.getInstance();
                    syncService.trySync().catch(syncError => {
                        console.log('📡 Immediate sync failed:', syncError);
                    });
                }, 1000);
            }

            return mode;
        } catch (error) {
            console.log('❌ Error checking connection mode:', error);
            setIsOnlineMode(false);
            return 'offline';
        }
    };

    // Available icons for categories
    const availableIcons = ['folder', 'coffee', 'star', 'shopping-bag', 'package', 'heart', 'bookmark', 'tag'];

    // Load menu items from Firebase - SEPARATE LOGIC FOR ONLINE vs OFFLINE
    // Load menu items from Firebase - FIXED DUPLICATE ISSUE
    // Load menu items from Firebase - FIXED: Show only one source based on mode
    const loadMenuItems = async () => {
        setLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            if (connectionMode === 'offline') {
                console.log('📱 Loading OFFLINE data (local storage only)...');
                // OFFLINE MODE: Show ONLY local storage items
                const offlineItems = await syncService.getItems();

                const items: MenuItem[] = offlineItems.map(item => ({
                    ...item,
                    isOffline: true
                }));

                setMenuItems(items);
                console.log('✅ Loaded OFFLINE items:', items.length, 'items');
                return;
            }

            console.log('🔥 Fetching from FIREBASE (ONLINE MODE)...');

            // ONLINE MODE: Fetch from Firebase Firestore ONLY
            const itemsCollection = collection(db, 'items');
            const itemsSnapshot = await getDocs(itemsCollection);

            const firebaseItems: MenuItem[] = itemsSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    code: data.code || '',
                    name: data.name || '',
                    price: data.price || 0,
                    category: data.category || 'Uncategorized',
                    stocks: data.stocks || 0,
                    sales: data.sales || 0,
                    status: data.status !== false,
                    description: data.description || '',
                    image: data.image || undefined,
                    isOffline: false,
                    firebaseId: doc.id
                };
            });

            // IMPORTANT: Clear local items when online to avoid duplicates
            // Only show Firebase data when online
            setMenuItems(firebaseItems);
            console.log('✅ Loaded FIREBASE items only:', firebaseItems.length, 'items');

        } catch (error) {
            console.error('❌ Error loading menu items:', error);

            // Fallback to OFFLINE mode on error
            const syncService = OfflineSyncService.getInstance();
            const offlineItems = await syncService.getItems();

            const items: MenuItem[] = offlineItems.map(item => ({
                ...item,
                isOffline: true
            }));

            setMenuItems(items);
            setIsOnlineMode(false);
            console.log('🔄 Fallback to OFFLINE items:', items.length, 'items');
        } finally {
            setLoading(false);
        }
    };

    // ADD THIS FUNCTION TO REMOVE DUPLICATES
    const removeDuplicateItems = (items: MenuItem[]): MenuItem[] => {
        const seen = new Set();

        return items.filter(item => {
            // Use combination of name and code as unique identifier
            const identifier = `${item.name.toLowerCase()}-${item.code}`;

            if (seen.has(identifier)) {
                console.log('🔄 Removing duplicate:', identifier);
                return false;
            }

            seen.add(identifier);
            return true;
        });
    };

    // Load categories from Firebase
    // Load categories from Firebase - FIXED: Show only one source based on mode
    const loadCategories = async () => {
        setCategoriesLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            console.log('🔄 [CATEGORY LOAD] Starting categories load process...');
            console.log('🌐 Current Mode:', connectionMode === 'offline' ? 'OFFLINE' : 'ONLINE');

            if (connectionMode === 'offline') {
                console.log('📱 [CATEGORY LOAD] Loading OFFLINE categories (local storage)...');
                // OFFLINE MODE: Use ONLY local storage categories
                const offlineCategories = await syncService.getLocalCategories();

                console.log('📦 [CATEGORY LOAD] Raw offline categories:', offlineCategories.length);

                // Calculate items count for each category from local items
                const localItems = await syncService.getItems();
                const categoriesWithCounts: Category[] = offlineCategories.map((category: Category) => {
                    const itemsCount = localItems.filter(item =>
                        item.category.toLowerCase() === category.name.toLowerCase()
                    ).length;

                    return {
                        ...category,
                        items_count: itemsCount,
                        created_on: category.created_on || 'Unknown date',
                        isOffline: true // Mark as offline
                    };
                });

                setCategories(categoriesWithCounts);
                console.log('✅ [CATEGORY LOAD] Loaded OFFLINE categories:', categoriesWithCounts.length, 'categories');
                return;
            }

            console.log('🔥 [CATEGORY LOAD] Fetching categories from Firebase (ONLINE MODE)...');

            // ONLINE MODE: Fetch from Firebase Firestore ONLY
            const categoriesCollection = collection(db, 'categories');
            const categoriesSnapshot = await getDocs(categoriesCollection);

            const firebaseCategories: Category[] = categoriesSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name || '',
                    icon: data.icon || 'folder',
                    items_count: data.items_count || 0,
                    created_on: data.created_on || data.created_at || 'Unknown date',
                    isOffline: false, // Mark as online
                    firebaseId: doc.id
                };
            });

            // IMPORTANT: Only show Firebase data when online
            setCategories(firebaseCategories);
            console.log('✅ [CATEGORY LOAD] Loaded FIREBASE categories only:', firebaseCategories.length, 'categories');

        } catch (error) {
            console.error('❌ [CATEGORY LOAD] Error loading categories:', error);

            // Fallback to local storage categories ONLY
            const syncService = OfflineSyncService.getInstance();
            const offlineCategories = await syncService.getLocalCategories();

            console.log('📦 [CATEGORY LOAD] Fallback - Raw offline categories:', offlineCategories.length);

            // Calculate items count for each category from local items
            const localItems = await syncService.getItems();
            const categoriesWithCounts: Category[] = offlineCategories.map((category: Category) => {
                const itemsCount = localItems.filter(item =>
                    item.category.toLowerCase() === category.name.toLowerCase()
                ).length;

                return {
                    ...category,
                    items_count: itemsCount,
                    created_on: category.created_on || 'Unknown date',
                    isOffline: true
                };
            });

            setCategories(categoriesWithCounts);
            setIsOnlineMode(false);

            console.log('✅ [CATEGORY LOAD] Fallback complete - Loaded OFFLINE categories:', categoriesWithCounts.length);
        } finally {
            setCategoriesLoading(false);
            console.log('🏁 [CATEGORY LOAD] Categories loading process completed');
        }
    };
    // Load cups data - FIREBASE + LOCAL STORAGE
    // Load cups data - FIXED: Show only one source based on mode
    const loadCups = async () => {
        setCupsLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            if (connectionMode === 'offline') {
                // OFFLINE MODE: Load from local storage only
                console.log('📱 Loading cups from local storage (OFFLINE MODE)...');
                const storedCups = await syncService.getCups();

                if (storedCups.length > 0) {
                    setCupItems(storedCups);
                    console.log('✅ Loaded cups from local storage:', storedCups.length, 'cups');
                } else {
                    // Create initial cups in local storage
                    const initialCups: CupItem[] = [
                        { id: '1', name: 'Small Cup', size: '8oz', stocks: 100, status: true, isOffline: true },
                        { id: '2', name: 'Medium Cup', size: '12oz', stocks: 100, status: true, isOffline: true },
                        { id: '3', name: 'Large Cup', size: '16oz', stocks: 100, status: true, isOffline: true },
                    ];
                    await syncService.saveCups(initialCups);
                    setCupItems(initialCups);
                    console.log('✅ Created initial cups in local storage');
                }
                return;
            }

            // ONLINE MODE: Load from Firebase ONLY
            console.log('🔥 Loading cups from Firebase (ONLINE MODE)...');
            const cupsCollection = collection(db, 'cups');
            const cupsSnapshot = await getDocs(cupsCollection);

            const firebaseCups: CupItem[] = cupsSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name || '',
                    size: data.size || '',
                    stocks: data.stocks || 0,
                    status: data.status !== false,
                    isOffline: false,
                    firebaseId: doc.id
                };
            });

            // IMPORTANT: Only show Firebase data when online
            setCupItems(firebaseCups);
            console.log('✅ Loaded FIREBASE cups only:', firebaseCups.length, 'cups');

        } catch (error) {
            console.error('❌ Error loading cups:', error);

            // Fallback to local storage
            const syncService = OfflineSyncService.getInstance();
            const storedCups = await syncService.getCups();

            if (storedCups.length > 0) {
                setCupItems(storedCups);
                console.log('✅ Fallback: Loaded cups from local storage:', storedCups.length, 'cups');
            } else {
                const initialCups: CupItem[] = [
                    { id: '1', name: 'Small Cup', size: '8oz', stocks: 100, status: true, isOffline: true },
                    { id: '2', name: 'Medium Cup', size: '12oz', stocks: 100, status: true, isOffline: true },
                    { id: '3', name: 'Large Cup', size: '16oz', stocks: 100, status: true, isOffline: true },
                ];
                setCupItems(initialCups);
            }
            setIsOnlineMode(false);
        } finally {
            setCupsLoading(false);
        }
    };

    useFocusEffect(
        React.useCallback(() => {
            loadMenuItems();
            loadCategories();
            loadCups();
        }, [])
    );

    // Filter items based on active sidebar
    const filteredItems = menuItems.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.code.includes(searchQuery)
    );

    const filteredCategories = categories.filter(category =>
        category.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Pagination for food items
    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedItems = filteredItems.slice(startIndex, startIndex + itemsPerPage);

    const handleAddNewItem = () => {
        if (!isAdmin) {
            Alert.alert('Access Denied', 'Only administrators can add new items.');
            return;
        }
        router.push('/add-item');
    };

    // Category Functions
    const openAddCategoryModal = () => {
        if (!isAdmin) {
            Alert.alert('Access Denied', 'Only administrators can add categories.');
            return;
        }
        console.log('➕ [CATEGORY MODAL] Opening ADD category modal');
        setEditingCategory(null);
        setCategoryName('');
        setCategoryIcon('folder');
        setCategoryModalVisible(true);
    };

    const openEditCategoryModal = (category: Category) => {
        if (!isAdmin) {
            Alert.alert('Access Denied', 'Only administrators can edit categories.');
            return;
        }
        console.log('✏️ [CATEGORY MODAL] Opening EDIT category modal');
        console.log('📝 Editing Category Data:', {
            id: category.id,
            name: category.name,
            icon: category.icon,
            isOffline: category.isOffline
        });
        setEditingCategory(category);
        setCategoryName(category.name);
        setCategoryIcon(category.icon || 'folder');
        setCategoryModalVisible(true);
    };

    const closeCategoryModal = () => {
        setCategoryModalVisible(false);
        setEditingCategory(null);
        setCategoryName('');
        setCategoryIcon('folder');
    };

    // Item Edit Functions
    const openEditItemModal = (item: MenuItem) => {
        if (!isAdmin) {
            Alert.alert('Access Denied', 'Only administrators can edit items.');
            return;
        }
        console.log('✏️ [ITEM EDIT] Opening edit modal for:', item.name);
        setEditingItem(item);
        setEditItemStocks(item.stocks.toString());
        setEditItemPrice(item.price.toString());
        setEditItemModal(true);
    };

    const closeEditItemModal = () => {
        setEditItemModal(false);
        setEditingItem(null);
        setEditItemStocks('');
        setEditItemPrice('');
    };

    // Cup Functions
    const openAddCupModal = () => {
        if (!isAdmin) {
            Alert.alert('Access Denied', 'Only administrators can add cups.');
            return;
        }
        console.log('➕ [CUP MODAL] Opening ADD cup modal');
        setEditingCup(null);
        setCupName('');
        setCupSize('');
        setCupStocks('100'); // Default stocks
        setCupModalVisible(true);
    };

    const openEditCupModal = (cup: CupItem) => {
        if (!isAdmin) {
            Alert.alert('Access Denied', 'Only administrators can edit cups.');
            return;
        }
        console.log('✏️ [CUP MODAL] Opening EDIT cup modal');
        setEditingCup(cup);
        setCupName(cup.name);
        setCupSize(cup.size || '');
        setCupStocks(cup.stocks.toString());
        setCupModalVisible(true);
    };

    const closeCupModal = () => {
        setCupModalVisible(false);
        setEditingCup(null);
        setCupName('');
        setCupSize('');
        setCupStocks('');
    };

    // Update item stocks and price - FIREBASE VERSION
    const updateItemStocksAndPrice = async (id: string, newStocks: number, newPrice: number) => {
        if (!isAdmin) {
            Alert.alert('Access Denied', 'Only administrators can update items.');
            return;
        }

        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            // Find the item to check if it's offline
            const itemToUpdate = menuItems.find(item => item.id === id);
            const isOfflineItem = itemToUpdate?.isOffline;

            if (connectionMode === 'offline' || isOfflineItem) {
                // OFFLINE MODE: Update local storage only
                console.log('📱 Updating item stocks and price in local storage...');

                // Update local state
                setMenuItems(prev => prev.map(item =>
                    item.id === id ? { ...item, stocks: newStocks, price: newPrice } : item
                ));

                // Update local storage - TEMPORARY WORKAROUND
                console.log('🔄 Using temporary workaround for local storage update...');
                const localItems = await syncService.getItems();
                const updatedItems = localItems.map(item =>
                    item.id === id ? { ...item, stocks: newStocks, price: newPrice } : item
                );
                await syncService.setItem('localItems', JSON.stringify(updatedItems));

                Alert.alert('Success', 'Item updated successfully in local storage');
                return;
            }

            // ONLINE MODE: Update Firebase
            console.log('🔥 Updating item stocks and price on Firebase...');

            if (itemToUpdate?.firebaseId) {
                const itemDoc = doc(db, 'items', itemToUpdate.firebaseId);
                await updateDoc(itemDoc, {
                    stocks: newStocks,
                    price: newPrice,
                    updated_at: new Date().toISOString()
                });

                // Update local state
                setMenuItems(prev => prev.map(item =>
                    item.id === id ? { ...item, stocks: newStocks, price: newPrice } : item
                ));

                // Also update local storage for backup - TEMPORARY WORKAROUND
                const localItems = await syncService.getItems();
                const updatedItems = localItems.map(item =>
                    item.id === id ? { ...item, stocks: newStocks, price: newPrice } : item
                );
                await syncService.setItem('localItems', JSON.stringify(updatedItems));

                Alert.alert('Success', 'Item updated successfully on Firebase');
            } else {
                Alert.alert('Error', 'Item not found in Firebase');
            }

        } catch (error) {
            console.error('❌ Error updating item:', error);
            Alert.alert('Error', 'Failed to update item');
        }
    };

    // Save item changes
    const saveItemChanges = async () => {
        if (!editingItem) return;

        const stocksValue = parseInt(editItemStocks);
        const priceValue = parseFloat(editItemPrice);

        if (isNaN(stocksValue) || stocksValue < 0) {
            Alert.alert('Error', 'Please enter a valid stock number');
            return;
        }

        if (isNaN(priceValue) || priceValue < 0) {
            Alert.alert('Error', 'Please enter a valid price');
            return;
        }

        await updateItemStocksAndPrice(editingItem.id, stocksValue, priceValue);
        closeEditItemModal();
    };

    // Save category - FIREBASE VERSION with AUTO SYNC
    // Save category - FIXED: Save to proper source based on mode
    const saveCategory = async () => {
        if (!isAdmin) {
            Alert.alert('Access Denied', 'Only administrators can save categories.');
            return;
        }

        if (!categoryName.trim()) {
            Alert.alert('Error', 'Please enter category name');
            return;
        }

        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            // Prepare category data with the selected icon
            const categoryData = {
                name: categoryName,
                icon: categoryIcon,
                items_count: 0,
                created_on: new Date().toISOString(),
                ...(editingCategory && { id: editingCategory.id })
            };

            console.log('🔄 [CATEGORY SAVE] Starting category save process...');
            console.log('📝 Category Data:', {
                name: categoryName,
                icon: categoryIcon,
                isEdit: !!editingCategory,
                editingId: editingCategory?.id
            });
            console.log('🌐 Current Mode:', connectionMode === 'offline' ? 'OFFLINE' : 'ONLINE');

            if (connectionMode === 'online') {
                console.log('🔥 ONLINE MODE: Saving to Firebase first...');

                try {
                    const firebaseData = {
                        name: categoryName,
                        icon: categoryIcon,
                        items_count: 0,
                        created_on: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };

                    let firebaseId: string;

                    if (editingCategory && editingCategory.firebaseId) {
                        // Update existing category in Firebase
                        const categoryDoc = doc(db, 'categories', editingCategory.firebaseId);
                        await updateDoc(categoryDoc, firebaseData);
                        firebaseId = editingCategory.firebaseId;
                        console.log('📝 [CATEGORY SAVE] Updated existing category in Firebase');
                    } else {
                        // Create new category in Firebase
                        const docRef = await addDoc(collection(db, 'categories'), firebaseData);
                        firebaseId = docRef.id;
                        console.log('➕ [CATEGORY SAVE] Created new category in Firebase');
                    }

                    console.log('✅ [CATEGORY SAVE] Step 1 COMPLETE: Saved to FIREBASE successfully');

                    // STEP 2: THEN SAVE TO LOCAL STORAGE WITH FIREBASE INFO
                    console.log('💾 [CATEGORY SAVE] Step 2: Saving to LOCAL storage with Firebase info...');
                    const saveResult = await syncService.saveCategory({
                        ...categoryData,
                        id: firebaseId,
                        firebaseId: firebaseId,
                        icon: categoryIcon
                    }, true);

                    if (saveResult.success) {
                        console.log('✅ [CATEGORY SAVE] Step 2 COMPLETE: Local record updated with Firebase ID');
                        await loadCategories();
                        Alert.alert(
                            'Success',
                            `Category "${categoryName}" with icon "${categoryIcon}" saved successfully to Firebase!`
                        );
                    } else {
                        console.log('⚠️ Firebase saved but local backup failed');
                        await loadCategories();
                        Alert.alert(
                            'Success',
                            `Category "${categoryName}" saved to Firebase!`
                        );
                    }

                    console.log('🎉 [CATEGORY SAVE] COMPLETE: Category with icon saved to FIREBASE!');

                } catch (firebaseError) {
                    console.log('❌ Firebase save failed, saving to local storage only');

                    // Firebase failed, save to local storage only
                    const localResult = await syncService.saveCategory(categoryData, false);

                    if (localResult.success) {
                        await loadCategories();
                        Alert.alert(
                            'Saved Locally',
                            `Category "${categoryName}" with icon "${categoryIcon}" saved to local storage. Auto-sync triggered for Firebase.`
                        );
                    } else {
                        Alert.alert('Error', 'Failed to save category to local storage.');
                    }
                }
            } else {
                // OFFLINE MODE - Save to local storage only
                console.log('📱 OFFLINE MODE: Saving to LOCAL storage only...');
                const localResult = await syncService.saveCategory(categoryData, false);

                if (localResult.success) {
                    await loadCategories();
                    Alert.alert(
                        'Saved Locally',
                        `Category "${categoryName}" with icon "${categoryIcon}" saved to local storage. Will auto-sync when online.`
                    );
                } else {
                    Alert.alert('Error', 'Failed to save category to local storage.');
                }
            }

            console.log('🎉 [CATEGORY SAVE] FINAL: Category with icon saved successfully!');
            closeCategoryModal();

            // AUTO SYNC: Trigger immediate sync attempt
            console.log('🚀 [AUTO SYNC] Triggering immediate sync attempt...');
            setTimeout(() => {
                syncService.trySync().catch(syncError => {
                    console.log('📡 [AUTO SYNC] Immediate sync failed:', syncError);
                });
            }, 2000);

        } catch (error) {
            console.error('❌ [CATEGORY SAVE] Error saving category with icon:', categoryIcon);
            Alert.alert(
                'Error',
                `Failed to save category: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    };

    // Save cup function
    // Save cup function - FIXED: Save to proper source based on mode
    const saveCup = async () => {
        if (!isAdmin) {
            Alert.alert('Access Denied', 'Only administrators can save cups.');
            return;
        }

        if (!cupName.trim()) {
            Alert.alert('Error', 'Please enter cup name');
            return;
        }

        if (!cupSize.trim()) {
            Alert.alert('Error', 'Please enter cup size');
            return;
        }

        const stocksValue = parseInt(cupStocks);
        if (isNaN(stocksValue) || stocksValue < 0) {
            Alert.alert('Error', 'Please enter valid stocks number');
            return;
        }

        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            // Prepare cup data
            const cupData = {
                name: cupName,
                size: cupSize,
                stocks: stocksValue,
                status: true,
                ...(editingCup && { id: editingCup.id })
            };

            console.log('🔄 [CUP SAVE] Starting cup save process...');
            console.log('🌐 Current Mode:', connectionMode === 'offline' ? 'OFFLINE' : 'ONLINE');

            if (connectionMode === 'online') {
                console.log('🔥 ONLINE MODE: Saving to Firebase first...');

                try {
                    const firebaseData = {
                        name: cupName,
                        size: cupSize,
                        stocks: stocksValue,
                        status: true,
                        updated_at: new Date().toISOString()
                    };

                    let firebaseId: string;

                    if (editingCup && editingCup.firebaseId) {
                        // Update existing cup in Firebase
                        const cupDoc = doc(db, 'cups', editingCup.firebaseId);
                        await updateDoc(cupDoc, firebaseData);
                        firebaseId = editingCup.firebaseId;
                        console.log('📝 [CUP SAVE] Updated existing cup in Firebase');
                    } else {
                        // Create new cup in Firebase
                        const docRef = await addDoc(collection(db, 'cups'), {
                            ...firebaseData,
                            created_at: new Date().toISOString()
                        });
                        firebaseId = docRef.id;
                        console.log('➕ [CUP SAVE] Created new cup in Firebase');
                    }

                    console.log('✅ [CUP SAVE] Step 1 COMPLETE: Saved to FIREBASE successfully');

                    // STEP 2: THEN SAVE TO LOCAL STORAGE WITH FIREBASE INFO
                    console.log('💾 [CUP SAVE] Step 2: Saving to LOCAL storage with Firebase info...');

                    let localSuccess;
                    if (editingCup) {
                        // Update existing cup in local storage
                        const currentCups = await syncService.getCups();
                        const updatedCups = currentCups.map(cup =>
                            cup.id === editingCup.id
                                ? { ...cup, name: cupName, size: cupSize, stocks: stocksValue, firebaseId: firebaseId, isOffline: false }
                                : cup
                        );
                        await syncService.saveCups(updatedCups);
                        localSuccess = true;
                    } else {
                        // Create new cup in local storage
                        const currentCups = await syncService.getCups();
                        const newCup: CupItem = {
                            id: firebaseId,
                            name: cupName,
                            size: cupSize,
                            stocks: stocksValue,
                            status: true,
                            isOffline: false,
                            firebaseId: firebaseId
                        };
                        const updatedCups = [...currentCups, newCup];
                        await syncService.saveCups(updatedCups);
                        localSuccess = true;
                    }

                    if (localSuccess) {
                        console.log('✅ [CUP SAVE] Step 2 COMPLETE: Saved to LOCAL storage with Firebase ID');
                        await loadCups();
                        Alert.alert(
                            'Success',
                            `Cup "${cupName}" saved successfully to Firebase!`
                        );
                    } else {
                        console.log('⚠️ Firebase saved but local backup failed');
                        await loadCups();
                        Alert.alert(
                            'Success',
                            `Cup "${cupName}" saved to Firebase!`
                        );
                    }

                } catch (firebaseError) {
                    console.log('❌ Firebase save failed, saving to local storage only');

                    // Firebase failed, save to local storage only
                    let localSuccess;
                    if (editingCup) {
                        // Update existing cup in local storage
                        const currentCups = await syncService.getCups();
                        const updatedCups = currentCups.map(cup =>
                            cup.id === editingCup.id
                                ? { ...cup, name: cupName, size: cupSize, stocks: stocksValue }
                                : cup
                        );
                        await syncService.saveCups(updatedCups);
                        localSuccess = true;
                    } else {
                        // Create new cup in local storage
                        const currentCups = await syncService.getCups();
                        const newCup: CupItem = {
                            id: Date.now().toString(),
                            name: cupName,
                            size: cupSize,
                            stocks: stocksValue,
                            status: true,
                            isOffline: true
                        };
                        const updatedCups = [...currentCups, newCup];
                        await syncService.saveCups(updatedCups);
                        localSuccess = true;
                    }

                    if (localSuccess) {
                        await loadCups();
                        Alert.alert(
                            'Saved Locally',
                            `Cup "${cupName}" saved to local storage. Auto-sync triggered for Firebase.`
                        );
                    } else {
                        Alert.alert('Error', 'Failed to save cup to local storage.');
                    }
                }
            } else {
                // OFFLINE MODE - Save to local storage only
                console.log('📱 OFFLINE MODE: Saving to LOCAL storage only...');

                let localSuccess;
                if (editingCup) {
                    // Update existing cup in local storage
                    const currentCups = await syncService.getCups();
                    const updatedCups = currentCups.map(cup =>
                        cup.id === editingCup.id
                            ? { ...cup, name: cupName, size: cupSize, stocks: stocksValue }
                            : cup
                    );
                    await syncService.saveCups(updatedCups);
                    localSuccess = true;
                } else {
                    // Create new cup in local storage
                    const currentCups = await syncService.getCups();
                    const newCup: CupItem = {
                        id: Date.now().toString(),
                        name: cupName,
                        size: cupSize,
                        stocks: stocksValue,
                        status: true,
                        isOffline: true
                    };
                    const updatedCups = [...currentCups, newCup];
                    await syncService.saveCups(updatedCups);
                    localSuccess = true;
                }

                if (localSuccess) {
                    await loadCups();
                    Alert.alert(
                        'Saved Locally',
                        `Cup "${cupName}" saved to local storage. Will auto-sync when online.`
                    );
                } else {
                    Alert.alert('Error', 'Failed to save cup to local storage.');
                }
            }

            console.log('🎉 [CUP SAVE] FINAL: Cup saved successfully!');
            closeCupModal();

            // AUTO SYNC: Trigger immediate sync attempt
            setTimeout(() => {
                syncService.trySync().catch(syncError => {
                    console.log('📡 [AUTO SYNC] Immediate sync failed:', syncError);
                });
            }, 2000);

        } catch (error) {
            console.error('❌ [CUP SAVE] Error saving cup:', error);
            Alert.alert(
                'Error',
                `Failed to save cup: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    };

    // Delete category - FIREBASE VERSION
    const deleteCategory = async (id: string) => {
        if (!isAdmin) {
            Alert.alert('Access Denied', 'Only administrators can delete categories.');
            return;
        }

        Alert.alert(
            'Delete Category',
            'Are you sure you want to delete this category?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const syncService = OfflineSyncService.getInstance();
                            const connectionMode = await getConnectionMode();

                            // Find the category first
                            const categoryToDelete = categories.find(cat => cat.id === id);
                            if (!categoryToDelete) {
                                Alert.alert('Error', 'Category not found');
                                return;
                            }

                            console.log('🗑️ [FIREBASE DELETE] Starting delete process for category:', categoryToDelete.name);

                            // STEP 1: ALWAYS DELETE FROM LOCAL STORAGE FIRST
                            console.log('💾 [FIREBASE DELETE] Step 1: Deleting from LOCAL storage...');
                            const localSuccess = await syncService.deleteLocalCategory(id);

                            if (!localSuccess) {
                                Alert.alert('Error', 'Failed to delete category from local storage');
                                return;
                            }

                            console.log('✅ [FIREBASE DELETE] Step 1 COMPLETE: Deleted from LOCAL storage');

                            // STEP 2: UPDATE LOCAL ITEMS THAT USE THIS CATEGORY
                            console.log('🔄 [FIREBASE DELETE] Step 2: Updating items with deleted category...');
                            const localItems = await syncService.getItems();
                            const itemsToUpdate = localItems.filter(item => item.category === categoryToDelete.name);

                            if (itemsToUpdate.length > 0) {
                                console.log(`📝 [FIREBASE DELETE] Updating ${itemsToUpdate.length} items to 'Uncategorized'`);

                                const updatedItems = localItems.map(item =>
                                    item.category === categoryToDelete.name
                                        ? { ...item, category: 'Uncategorized' }
                                        : item
                                );

                                await syncService.setItem('localItems', JSON.stringify(updatedItems));
                                console.log('✅ [FIREBASE DELETE] Step 2 COMPLETE: Items updated');
                            }

                            // STEP 3: TRY TO DELETE FROM FIREBASE IF ONLINE AND IT'S AN ONLINE CATEGORY
                            if (connectionMode === 'online' && !categoryToDelete.isOffline && categoryToDelete.firebaseId) {
                                console.log('🔥 [FIREBASE DELETE] Step 3: Attempting to delete from FIREBASE...');

                                try {
                                    const categoryDoc = doc(db, 'categories', categoryToDelete.firebaseId);
                                    await deleteDoc(categoryDoc);

                                    console.log('✅ [FIREBASE DELETE] Step 3 COMPLETE: Deleted from FIREBASE successfully');

                                    // STEP 4: ALSO UPDATE ITEMS ON FIREBASE IF NEEDED
                                    if (itemsToUpdate.length > 0) {
                                        console.log('🔄 [FIREBASE DELETE] Step 4: Updating items on Firebase...');
                                        for (const item of itemsToUpdate) {
                                            if (!item.isOffline && item.firebaseId) {
                                                try {
                                                    const itemDoc = doc(db, 'items', item.firebaseId);
                                                    await updateDoc(itemDoc, {
                                                        category: 'Uncategorized',
                                                        updated_at: new Date().toISOString()
                                                    });
                                                } catch (itemError) {
                                                    console.log('⚠️ Failed to update item on Firebase:', item.name);
                                                }
                                            }
                                        }
                                        console.log('✅ [FIREBASE DELETE] Step 4 COMPLETE: Firebase items updated');
                                    }

                                    Alert.alert('Success', 'Category deleted successfully from both local and Firebase!');

                                } catch (firebaseError) {
                                    console.log('⚠️ [FIREBASE DELETE] Firebase delete failed, but local delete completed:', firebaseError);

                                    // Add to pending items for later Firebase deletion
                                    const pendingDelete: PendingItem = {
                                        id: id,
                                        type: 'DELETE_CATEGORY',
                                        data: { id: id, name: categoryToDelete.name, firebaseId: categoryToDelete.firebaseId },
                                        timestamp: Date.now(),
                                        retryCount: 0
                                    };

                                    const pendingItems = await syncService.getPendingItems();
                                    const filteredPendingItems = pendingItems.filter(item => item.id !== id);

                                    await syncService.setItem('pendingItems', JSON.stringify(filteredPendingItems));

                                    Alert.alert(
                                        'Deleted Locally',
                                        'Category deleted from local storage. Firebase deletion will be retried later.'
                                    );
                                }
                            } else {
                                // OFFLINE MODE or OFFLINE CATEGORY - Only local delete was successful
                                if (categoryToDelete.isOffline) {
                                    console.log('📱 [FIREBASE DELETE] Offline category - Only deleted from LOCAL storage');
                                } else {
                                    console.log('📡 [FIREBASE DELETE] Offline mode - Only deleted from LOCAL storage');
                                }

                                // Add to pending items for later Firebase deletion (if it was an online category)
                                if (!categoryToDelete.isOffline && categoryToDelete.firebaseId) {
                                    const pendingDelete: PendingItem = {
                                        id: id,
                                        type: 'DELETE_CATEGORY',
                                        data: { id: id, name: categoryToDelete.name, firebaseId: categoryToDelete.firebaseId },
                                        timestamp: Date.now(),
                                        retryCount: 0
                                    };

                                    const pendingItems = await syncService.getPendingItems();
                                    const filteredPendingItems = pendingItems.filter(item => item.id !== id);

                                    await syncService.setItem('pendingItems', JSON.stringify(filteredPendingItems));
                                }

                                Alert.alert(
                                    'Deleted Locally',
                                    'Category deleted from local storage.' +
                                    (!categoryToDelete.isOffline ? ' Will sync deletion when online.' : '')
                                );
                            }

                            // STEP 5: UPDATE UI
                            console.log('🎨 [FIREBASE DELETE] Step 5: Updating UI...');
                            setCategories(prev => prev.filter(cat => cat.id !== id));

                            // Also update menu items in state
                            setMenuItems(prev => prev.map(item =>
                                item.category === categoryToDelete.name
                                    ? { ...item, category: 'Uncategorized' }
                                    : item
                            ));

                            console.log('🎉 [FIREBASE DELETE] DELETE PROCESS COMPLETED!');

                        } catch (error) {
                            console.error('❌ [FIREBASE DELETE] Error in delete process:', error);
                            Alert.alert(
                                'Error',
                                `Failed to delete category: ${error instanceof Error ? error.message : 'Unknown error'}`
                            );
                        }
                    }
                }
            ]
        );
    };

    // Delete cup function
    const deleteCup = async (id: string) => {
        if (!isAdmin) {
            Alert.alert('Access Denied', 'Only administrators can delete cups.');
            return;
        }

        Alert.alert(
            'Delete Cup',
            'Are you sure you want to delete this cup?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const syncService = OfflineSyncService.getInstance();
                            const connectionMode = await getConnectionMode();

                            // Find the cup first
                            const cupToDelete = cupItems.find(cup => cup.id === id);
                            if (!cupToDelete) {
                                Alert.alert('Error', 'Cup not found');
                                return;
                            }

                            console.log('🗑️ [CUP DELETE] Starting delete process for cup:', cupToDelete.name);

                            // STEP 1: ALWAYS DELETE FROM LOCAL STORAGE FIRST
                            console.log('💾 [CUP DELETE] Step 1: Deleting from LOCAL storage...');
                            const currentCups = await syncService.getCups();
                            const updatedCups = currentCups.filter(cup => cup.id !== id);
                            await syncService.saveCups(updatedCups);

                            console.log('✅ [CUP DELETE] Step 1 COMPLETE: Deleted from LOCAL storage');

                            // STEP 2: TRY TO DELETE FROM FIREBASE IF ONLINE AND IT'S AN ONLINE CUP
                            if (connectionMode === 'online' && !cupToDelete.isOffline && cupToDelete.firebaseId) {
                                console.log('🔥 [CUP DELETE] Step 2: Attempting to delete from FIREBASE...');

                                try {
                                    const cupDoc = doc(db, 'cups', cupToDelete.firebaseId);
                                    await deleteDoc(cupDoc);

                                    console.log('✅ [CUP DELETE] Step 2 COMPLETE: Deleted from FIREBASE successfully');
                                    Alert.alert('Success', 'Cup deleted successfully from both local and Firebase!');

                                } catch (firebaseError) {
                                    console.log('⚠️ [CUP DELETE] Firebase delete failed, but local delete completed');

                                    // Add to pending items for later Firebase deletion
                                    const pendingDelete: PendingItem = {
                                        id: id,
                                        type: 'DELETE_CUP',
                                        data: { id: id, name: cupToDelete.name, firebaseId: cupToDelete.firebaseId },
                                        timestamp: Date.now(),
                                        retryCount: 0
                                    };

                                    const pendingItems = await syncService.getPendingItems();
                                    const filteredPendingItems = pendingItems.filter(item => item.id !== id);

                                    await syncService.setItem('pendingItems', JSON.stringify(filteredPendingItems));

                                    Alert.alert(
                                        'Deleted Locally',
                                        'Cup deleted from local storage. Firebase deletion will be retried later.'
                                    );
                                }
                            } else {
                                // OFFLINE MODE or OFFLINE CUP - Only local delete was successful
                                if (cupToDelete.isOffline) {
                                    console.log('📱 [CUP DELETE] Offline cup - Only deleted from LOCAL storage');
                                } else {
                                    console.log('📡 [CUP DELETE] Offline mode - Only deleted from LOCAL storage');
                                }

                                // Add to pending items for later Firebase deletion (if it was an online cup)
                                if (!cupToDelete.isOffline && cupToDelete.firebaseId) {
                                    const pendingDelete: PendingItem = {
                                        id: id,
                                        type: 'DELETE_CUP',
                                        data: { id: id, name: cupToDelete.name, firebaseId: cupToDelete.firebaseId },
                                        timestamp: Date.now(),
                                        retryCount: 0
                                    };

                                    const pendingItems = await syncService.getPendingItems();
                                    const filteredPendingItems = pendingItems.filter(item => item.id !== id);

                                    await syncService.setItem('pendingItems', JSON.stringify(filteredPendingItems));
                                }

                                Alert.alert(
                                    'Deleted Locally',
                                    'Cup deleted from local storage.' +
                                    (!cupToDelete.isOffline ? ' Will sync deletion when online.' : '')
                                );
                            }

                            // STEP 3: UPDATE UI
                            console.log('🎨 [CUP DELETE] Step 3: Updating UI...');
                            setCupItems(prev => prev.filter(cup => cup.id !== id));

                            console.log('🎉 [CUP DELETE] DELETE PROCESS COMPLETED!');

                        } catch (error) {
                            console.error('❌ [CUP DELETE] Error in delete process:', error);
                            Alert.alert(
                                'Error',
                                `Failed to delete cup: ${error instanceof Error ? error.message : 'Unknown error'}`
                            );
                        }
                    }
                }
            ]
        );
    };

    // Update cup stocks - FIREBASE VERSION
    const updateCupStocks = async (id: string, newStocks: number) => {
        if (!isAdmin) {
            Alert.alert('Access Denied', 'Only administrators can update cup stocks.');
            return;
        }

        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            // Find the cup to check if it's offline
            const cupToUpdate = cupItems.find(cup => cup.id === id);
            const isOfflineCup = cupToUpdate?.isOffline;

            if (connectionMode === 'offline' || isOfflineCup) {
                // OFFLINE MODE: Update local storage only
                console.log('📱 Updating cup stocks in local storage...');

                // Update local state
                setCupItems(prev => prev.map(cup =>
                    cup.id === id ? { ...cup, stocks: newStocks } : cup
                ));

                // Update local storage
                const updatedCups = cupItems.map(cup =>
                    cup.id === id ? { ...cup, stocks: newStocks } : cup
                );
                await syncService.saveCups(updatedCups);

                Alert.alert('Success', 'Cup stocks updated in local storage');
                return;
            }

            // ONLINE MODE: Update Firebase
            console.log('🔥 Updating cup stocks on Firebase...');

            if (cupToUpdate?.firebaseId) {
                const cupDoc = doc(db, 'cups', cupToUpdate.firebaseId);
                await updateDoc(cupDoc, {
                    stocks: newStocks,
                    updated_at: new Date().toISOString()
                });

                // Update local state
                setCupItems(prev => prev.map(cup =>
                    cup.id === id ? { ...cup, stocks: newStocks } : cup
                ));

                // Also update local storage for backup
                const updatedCups = cupItems.map(cup =>
                    cup.id === id ? { ...cup, stocks: newStocks } : cup
                );
                await syncService.saveCups(updatedCups);

                Alert.alert('Success', 'Cup stocks updated on Firebase');
            } else {
                Alert.alert('Error', 'Cup not found in Firebase');
            }

        } catch (error) {
            console.error('❌ Error updating cup stocks:', error);
            Alert.alert('Error', 'Failed to update cup stocks');
        }
    };

    // Function to open edit stocks modal
    const openEditStocksModal = (cup: CupItem) => {
        if (!isAdmin) {
            Alert.alert('Access Denied', 'Only administrators can edit cup stocks.');
            return;
        }
        setSelectedCup(cup);
        setNewStocks(cup.stocks.toString());
        setEditStocksModal(true);
    };

    // Function to close modal
    const closeEditStocksModal = () => {
        setEditStocksModal(false);
        setSelectedCup(null);
        setNewStocks('');
    };

    // Function to save updated stocks
    const saveStocks = async () => {
        if (!selectedCup || !newStocks) return;

        const stocksValue = parseInt(newStocks);
        if (isNaN(stocksValue) || stocksValue < 0) {
            Alert.alert('Error', 'Please enter a valid number');
            return;
        }

        await updateCupStocks(selectedCup.id, stocksValue);
        closeEditStocksModal();
    };

    // Delete item - FIREBASE VERSION
    // Delete item - FIREBASE VERSION (FIXED)
    const deleteItem = async (id: string) => {
        if (!isAdmin) {
            Alert.alert('Access Denied', 'Only administrators can delete items.');
            return;
        }

        Alert.alert(
            'Delete Item',
            'Are you sure you want to delete this item?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        setLoading(true);
                        try {
                            const syncService = OfflineSyncService.getInstance();
                            const connectionMode = await getConnectionMode();

                            // Find the item first to check if it's offline
                            const itemToDelete = menuItems.find(item => item.id === id);
                            if (!itemToDelete) {
                                Alert.alert('Error', 'Item not found');
                                return;
                            }

                            const isOfflineItem = itemToDelete?.isOffline;

                            // Get current counts before deletion
                            const localItemsBefore = await syncService.getItems();
                            const totalItemsBefore = menuItems.length;

                            console.log('📊 TOTAL ITEMS BEFORE DELETION:');
                            console.log('   UI Items:', totalItemsBefore);
                            console.log('   Local Storage:', localItemsBefore.length);
                            console.log('   Item to delete:', itemToDelete?.name, `(ID: ${id})`);

                            // STEP 1: ALWAYS DELETE FROM LOCAL STORAGE FIRST
                            console.log('🗑️ Step 1: Deleting from LOCAL storage...');
                            const localSuccess = await syncService.deleteLocalItem(id);

                            if (!localSuccess) {
                                Alert.alert('Error', 'Failed to delete item from local storage');
                                return;
                            }

                            console.log('✅ Step 1 COMPLETE: Deleted from LOCAL storage');

                            // STEP 2: TRY TO DELETE FROM FIREBASE IF ONLINE AND IT'S AN ONLINE ITEM
                            if (connectionMode === 'online' && !isOfflineItem && itemToDelete.firebaseId) {
                                console.log('🔥 Step 2: Attempting to delete from FIREBASE...');

                                try {
                                    const itemDoc = doc(db, 'items', itemToDelete.firebaseId);
                                    await deleteDoc(itemDoc);

                                    console.log('✅ Step 2 COMPLETE: Deleted from FIREBASE successfully');

                                    // Remove from local state
                                    setMenuItems(prev => prev.filter(item => item.id !== id));

                                    Alert.alert(
                                        'Success',
                                        'Item deleted successfully from both local storage and Firebase!'
                                    );

                                } catch (firebaseError) {
                                    console.log('⚠️ Firebase delete failed, but local delete completed');

                                    // Add to pending items for later Firebase deletion
                                    const pendingDelete: PendingItem = {
                                        id: id,
                                        type: 'DELETE_ITEM',
                                        data: {
                                            id: id,
                                            name: itemToDelete.name,
                                            firebaseId: itemToDelete.firebaseId
                                        },
                                        timestamp: Date.now(),
                                        retryCount: 0
                                    };

                                    const pendingItems = await syncService.getPendingItems();
                                    const filteredPendingItems = pendingItems.filter(item => item.id !== id);
                                    filteredPendingItems.push(pendingDelete);

                                    await syncService.setItem('pendingItems', JSON.stringify(filteredPendingItems));

                                    // Remove from local state
                                    setMenuItems(prev => prev.filter(item => item.id !== id));

                                    Alert.alert(
                                        'Deleted Locally',
                                        'Item deleted from local storage. Firebase deletion will be retried later.'
                                    );
                                }
                            } else {
                                // OFFLINE MODE or OFFLINE ITEM - Only local delete was successful
                                if (isOfflineItem) {
                                    console.log('📱 Offline item - Only deleted from LOCAL storage');
                                } else {
                                    console.log('📡 Offline mode - Only deleted from LOCAL storage');
                                }

                                // Add to pending items for later Firebase deletion (if it was an online item)
                                if (!isOfflineItem && itemToDelete.firebaseId) {
                                    const pendingDelete: PendingItem = {
                                        id: id,
                                        type: 'DELETE_ITEM',
                                        data: {
                                            id: id,
                                            name: itemToDelete.name,
                                            firebaseId: itemToDelete.firebaseId
                                        },
                                        timestamp: Date.now(),
                                        retryCount: 0
                                    };

                                    const pendingItems = await syncService.getPendingItems();
                                    const filteredPendingItems = pendingItems.filter(item => item.id !== id);
                                    filteredPendingItems.push(pendingDelete);

                                    await syncService.setItem('pendingItems', JSON.stringify(filteredPendingItems));
                                }

                                // Remove from local state
                                setMenuItems(prev => prev.filter(item => item.id !== id));

                                Alert.alert(
                                    'Deleted Locally',
                                    'Item deleted from local storage.' +
                                    (!isOfflineItem ? ' Will sync deletion when online.' : '')
                                );
                            }

                            console.log('🎉 DELETE PROCESS COMPLETED!');

                        } catch (error) {
                            console.error('❌ Error in delete process:', error);
                            Alert.alert(
                                'Error',
                                `Failed to delete item: ${error instanceof Error ? error.message : 'Unknown error'}`
                            );
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };
    // Toggle item status - FIREBASE VERSION
    const toggleStatus = async (id: string) => {
        if (!isAdmin) {
            Alert.alert('Access Denied', 'Only administrators can toggle item status.');
            return;
        }

        try {
            const connectionMode = await getConnectionMode();
            if (connectionMode === 'offline') {
                // OFFLINE MODE: Update local state only
                setMenuItems(prev => prev.map(item =>
                    item.id === id ? { ...item, status: !item.status } : item
                ));
                return;
            }

            // ONLINE MODE: Update Firebase
            const item = menuItems.find(item => item.id === id);
            if (item?.firebaseId) {
                const itemDoc = doc(db, 'items', item.firebaseId);
                await updateDoc(itemDoc, {
                    status: !item.status,
                    updated_at: new Date().toISOString()
                });

                setMenuItems(prev => prev.map(item =>
                    item.id === id ? { ...item, status: !item.status } : item
                ));
            }
        } catch (error) {
            console.error('Error updating status:', error);
        }
    };

    return (
        <ThemedView style={styles.container}>
            {/* Navbar Component */}
            <Navbar activeNav="items" />

            {/* Main Content */}
            <ImageBackground
                source={require('@/assets/images/kape1.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <ThemedView style={styles.content}>
                    {/* Sidebar */}
                    <ThemedView style={styles.sidebar}>
                        <ThemedView style={styles.sidebarHeader}>
                            <ThemedText style={styles.sidebarTitle}>ITEMS</ThemedText>
                        </ThemedView>

                        <TouchableOpacity
                            style={[
                                styles.sidebarItem,
                                activeSidebar === 'food-items' && styles.sidebarItemActive
                            ]}
                            onPress={() => setActiveSidebar('food-items')}
                        >
                            <Feather
                                name="package"
                                size={20}
                                color={activeSidebar === 'food-items' ? '#FFFEEA' : '#874E3B'}
                            />
                            <ThemedText style={[
                                styles.sidebarText,
                                activeSidebar === 'food-items' && styles.sidebarTextActive
                            ]}>
                                Food Items
                            </ThemedText>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.sidebarItem,
                                activeSidebar === 'categories' && styles.sidebarItemActive
                            ]}
                            onPress={() => setActiveSidebar('categories')}
                        >
                            <Feather
                                name="folder"
                                size={20}
                                color={activeSidebar === 'categories' ? '#FFFEEA' : '#874E3B'}
                            />
                            <ThemedText style={[
                                styles.sidebarText,
                                activeSidebar === 'categories' && styles.sidebarTextActive
                            ]}>
                                Categories
                            </ThemedText>
                        </TouchableOpacity>

                        {/* Cups Section */}
                        <TouchableOpacity
                            style={[
                                styles.sidebarItem,
                                activeSidebar === 'cups' && styles.sidebarItemActive
                            ]}
                            onPress={() => setActiveSidebar('cups')}
                        >
                            <Feather
                                name="coffee"
                                size={20}
                                color={activeSidebar === 'cups' ? '#FFFEEA' : '#874E3B'}
                            />
                            <ThemedText style={[
                                styles.sidebarText,
                                activeSidebar === 'cups' && styles.sidebarTextActive
                            ]}>
                                Cups
                            </ThemedText>
                        </TouchableOpacity>
                    </ThemedView>

                    {/* Main Content Area */}
                    <ThemedView style={styles.mainContent}>
                        {/* Header Section */}
                        <ThemedView style={styles.headerSection}>
                            <ThemedView style={styles.true1}>
                                <ThemedText style={styles.mainTitle}>
                                    {activeSidebar === 'food-items' && 'Food Items'}
                                    {activeSidebar === 'categories' && 'Categories'}
                                    {activeSidebar === 'cups' && 'Cups Management'}
                                </ThemedText>
                                <ThemedText style={styles.modeInfo}>
                                    {isOnlineMode ? 'Connected to server' : 'Using local storage'} |
                                    Role: {isAdmin ? '👑 ADMIN' : '👤 USER'}
                                </ThemedText>
                            </ThemedView>

                            <ThemedView style={styles.headerActions}>
                                {/* Reload button */}
                                <TouchableOpacity
                                    style={styles.reloadButton}
                                    onPress={() => {
                                        loadMenuItems();
                                        loadCategories();
                                        loadCups();
                                    }}
                                >
                                    <Feather name="refresh-cw" size={18} color="#874E3B" />
                                </TouchableOpacity>

                                {activeSidebar === 'categories' && isAdmin && (
                                    <TouchableOpacity style={styles.addNewButton} onPress={openAddCategoryModal}>
                                        <Feather name="plus" size={16} color="#FFFEEA" />
                                        <ThemedText style={styles.addNewButtonText}>Add New</ThemedText>
                                    </TouchableOpacity>
                                )}

                                {activeSidebar === 'food-items' && isAdmin && (
                                    <TouchableOpacity style={styles.addNewButton} onPress={handleAddNewItem} disabled={loading}>
                                        <Feather name="plus" size={16} color="#FFFEEA" />
                                        <ThemedText style={styles.addNewButtonText}>
                                            {loading ? 'Loading...' : 'Add New'}
                                        </ThemedText>
                                    </TouchableOpacity>
                                )}

                                {activeSidebar === 'cups' && isAdmin && (
                                    <TouchableOpacity style={styles.addNewButton} onPress={openAddCupModal}>
                                        <Feather name="plus" size={16} color="#FFFEEA" />
                                        <ThemedText style={styles.addNewButtonText}>Add New</ThemedText>
                                    </TouchableOpacity>
                                )}

                                <ThemedView style={styles.searchContainer}>
                                    <Feather name="search" size={18} color="#874E3B" style={styles.searchIcon} />
                                    <TextInput
                                        style={styles.searchInput}
                                        placeholder={
                                            activeSidebar === 'food-items' ? "Search Item" :
                                                activeSidebar === 'categories' ? "Search Category" :
                                                    "Search Cup"
                                        }
                                        value={searchQuery}
                                        onChangeText={setSearchQuery}
                                    />
                                </ThemedView>
                            </ThemedView>
                        </ThemedView>

                        {/* Content based on active sidebar */}
                        {activeSidebar === 'food-items' && (
                            <ThemedView style={styles.tableSection}>
                                <ThemedView style={styles.tableHeader}>
                                    <ThemedText style={[styles.headerText, styles.codeHeader]}>Code</ThemedText>
                                    <ThemedText style={[styles.headerText, styles.nameHeader]}>Item Name</ThemedText>
                                    <ThemedText style={[styles.headerText, styles.statusHeader]}>Status</ThemedText>
                                    <ThemedText style={[styles.headerText, styles.categoryHeader]}>Category</ThemedText>
                                    <ThemedText style={[styles.headerText, styles.stocksHeader]}>Stocks</ThemedText>
                                    <ThemedText style={[styles.headerText, styles.priceHeader]}>Price</ThemedText>
                                    <ThemedText style={[styles.headerText, styles.salesHeader]}>Sales</ThemedText>
                                    {/* Actions column only for admin */}
                                    {isAdmin && (
                                        <ThemedText style={[styles.headerText, styles.actionsHeader]}>Actions</ThemedText>
                                    )}
                                </ThemedView>

                                <ScrollView style={styles.tableContent}>
                                    {loading ? (
                                        <ThemedView style={styles.loadingContainer}>
                                            <ThemedText>Loading items...</ThemedText>
                                        </ThemedView>
                                    ) : paginatedItems.length === 0 ? (
                                        <ThemedView style={styles.emptyContainer}>
                                            <ThemedText>No items found</ThemedText>
                                        </ThemedView>
                                    ) : (
                                        paginatedItems.map((item, index) => (
                                            <ThemedView key={`${item.id}-${index}`} style={styles.tableRow}>
                                                <ThemedText style={[styles.cellText, styles.codeCell]}>
                                                    {item.code}
                                                </ThemedText>
                                                <ThemedText style={[styles.cellText, styles.nameCell]}>{item.name}</ThemedText>
                                                {/* Status cell */}
                                                <ThemedView style={[styles.statusCell, item.isOffline ? styles.offlineStatus : styles.onlineStatus]}>
                                                    <ThemedText style={styles.statusText}>
                                                        {item.isOffline ? '📱 Offline' : '🌐 Online'}
                                                    </ThemedText>
                                                </ThemedView>
                                                <ThemedText style={[styles.cellText, styles.categoryCell]}>{item.category}</ThemedText>
                                                <ThemedText style={[styles.cellText, styles.stocksCell]}>{item.stocks}</ThemedText>
                                                <ThemedText style={[styles.cellText, styles.priceCell]}>₱{item.price.toFixed(2)}</ThemedText>
                                                <ThemedText style={[styles.cellText, styles.salesCell]}>{item.sales}</ThemedText>
                                                {/* Actions cell only for admin */}
                                                {isAdmin && (
                                                    <ThemedView style={styles.actionsCell}>
                                                        <TouchableOpacity
                                                            style={[
                                                                styles.statusButton,
                                                                item.status ? styles.statusActive : styles.statusInactive
                                                            ]}
                                                            onPress={() => toggleStatus(item.id)}
                                                        >
                                                            <Feather
                                                                name={item.status ? "check" : "x"}
                                                                size={16}
                                                                color={item.status ? "#16A34A" : "#DC2626"}
                                                            />
                                                        </TouchableOpacity>
                                                        {/* EDIT BUTTON - Pencil Icon */}
                                                        <TouchableOpacity
                                                            style={styles.editButton}
                                                            onPress={() => openEditItemModal(item)}
                                                        >
                                                            <Feather name="edit-2" size={16} color="#874E3B" />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            style={styles.deleteButton}
                                                            onPress={() => deleteItem(item.id)}
                                                        >
                                                            <Feather name="trash-2" size={16} color="#DC2626" />
                                                        </TouchableOpacity>
                                                    </ThemedView>
                                                )}
                                            </ThemedView>
                                        ))
                                    )}
                                </ScrollView>

                                {/* Table Footer with Pagination */}
                                <ThemedView style={styles.tableFooter}>
                                    <ThemedText style={styles.footerText}>
                                        Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredItems.length)} of {filteredItems.length} items
                                    </ThemedText>

                                    <ThemedView style={styles.paginationContainer}>
                                        <ThemedView style={styles.itemsPerPage}>
                                            <ThemedText style={styles.paginationText}>Items per page</ThemedText>
                                            <ThemedView style={styles.pageSelector}>
                                                <ThemedText style={styles.pageSelectorText}>{itemsPerPage}</ThemedText>
                                                <Feather name="chevron-down" size={16} color="#874E3B" />
                                            </ThemedView>
                                        </ThemedView>

                                        <ThemedView style={styles.pageNavigation}>
                                            <TouchableOpacity
                                                style={[styles.pageButton, currentPage === 1 && styles.pageButtonDisabled]}
                                                onPress={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                                disabled={currentPage === 1}
                                            >
                                                <Feather name="chevron-left" size={16} color={currentPage === 1 ? "#9CA3AF" : "#874E3B"} />
                                            </TouchableOpacity>

                                            {[...Array(Math.min(3, totalPages))].map((_, index) => {
                                                const pageNum = index + 1;
                                                return (
                                                    <TouchableOpacity
                                                        key={pageNum}
                                                        style={[
                                                            styles.pageNumber,
                                                            currentPage === pageNum && styles.pageNumberActive
                                                        ]}
                                                        onPress={() => setCurrentPage(pageNum)}
                                                    >
                                                        <ThemedText style={[
                                                            styles.pageNumberText,
                                                            currentPage === pageNum && styles.pageNumberTextActive
                                                        ]}>
                                                            {pageNum}
                                                        </ThemedText>
                                                    </TouchableOpacity>
                                                );
                                            })}

                                            {totalPages > 3 && (
                                                <ThemedText style={styles.pageDots}>...</ThemedText>
                                            )}

                                            <TouchableOpacity
                                                style={[styles.pageButton, currentPage === totalPages && styles.pageButtonDisabled]}
                                                onPress={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                                disabled={currentPage === totalPages}
                                            >
                                                <Feather name="chevron-right" size={16} color={currentPage === totalPages ? "#9CA3AF" : "#874E3B"} />
                                            </TouchableOpacity>
                                        </ThemedView>
                                    </ThemedView>
                                </ThemedView>
                            </ThemedView>
                        )}

                        {/* Categories Table */}
                        {activeSidebar === 'categories' && (
                            <ThemedView style={styles.tableSection}>
                                <ThemedView style={styles.tableHeader}>
                                    <ThemedText style={[styles.headerText, styles.categoryIconHeader]}>Icon</ThemedText>
                                    <ThemedText style={[styles.headerText, styles.categoryNameHeader]}>Category Name</ThemedText>
                                    <ThemedText style={[styles.headerText, styles.categoryItemsHeader]}>Items in Category</ThemedText>
                                    <ThemedText style={[styles.headerText, styles.categoryDateHeader]}>Created on</ThemedText>
                                    {/* Actions column only for admin */}
                                    {isAdmin && (
                                        <ThemedText style={[styles.headerText, styles.categoryActionsHeader]}>Actions</ThemedText>
                                    )}
                                </ThemedView>

                                <ScrollView style={styles.tableContent}>
                                    {categoriesLoading ? (
                                        <ThemedView style={styles.loadingContainer}>
                                            <ThemedText>Loading categories...</ThemedText>
                                        </ThemedView>
                                    ) : filteredCategories.length === 0 ? (
                                        <ThemedView style={styles.emptyContainer}>
                                            <ThemedText>No categories found</ThemedText>
                                        </ThemedView>
                                    ) : (
                                        filteredCategories.map((category, index) => (
                                            <ThemedView key={`${category.id}-${index}`} style={styles.tableRow}>
                                                <ThemedView style={[styles.categoryIconCell]}>
                                                    <Feather
                                                        name={(category.icon || 'folder') as any}
                                                        size={20}
                                                        color="#874E3B"
                                                    />
                                                </ThemedView>
                                                <ThemedText style={[styles.cellText, styles.categoryNameCell]}>
                                                    {category.name} {category.isOffline && '📱'}
                                                </ThemedText>
                                                <ThemedText style={[styles.cellText, styles.categoryItemsCell]}>
                                                    {category.items_count}
                                                </ThemedText>
                                                <ThemedText style={[styles.cellText, styles.categoryDateCell]}>
                                                    {category.created_on}
                                                </ThemedText>
                                                {/* Actions cell only for admin */}
                                                {isAdmin && (
                                                    <ThemedView style={styles.categoryActionsCell}>
                                                        <TouchableOpacity
                                                            style={styles.editButton}
                                                            onPress={() => openEditCategoryModal(category)}
                                                        >
                                                            <Feather name="edit-2" size={16} color="#874E3B" />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            style={styles.deleteButton}
                                                            onPress={() => deleteCategory(category.id)}
                                                        >
                                                            <Feather name="trash-2" size={16} color="#DC2626" />
                                                        </TouchableOpacity>
                                                        <ThemedView style={[
                                                            styles.checkIndicator,
                                                            category.isOffline ? styles.offlineCheck : styles.onlineCheck
                                                        ]}>
                                                            <Feather
                                                                name="check"
                                                                size={14}
                                                                color={category.isOffline ? "#666" : "#0084FF"}
                                                            />
                                                        </ThemedView>
                                                    </ThemedView>
                                                )}
                                            </ThemedView>
                                        ))
                                    )}
                                </ScrollView>
                            </ThemedView>
                        )}

                        {activeSidebar === 'cups' && (
                            <ThemedView style={styles.tableSection}>
                                <ThemedView style={styles.tableHeader}>
                                    <ThemedText style={[styles.headerText, styles.cupNameHeader]}>Cup Name</ThemedText>
                                    <ThemedText style={[styles.headerText, styles.cupSizeHeader]}>Size</ThemedText>
                                    <ThemedText style={[styles.headerText, styles.cupStocksHeader]}>Stocks</ThemedText>
                                    {/* Actions column only for admin */}
                                    {isAdmin && (
                                        <ThemedText style={[styles.headerText, styles.cupActionsHeader]}>Actions</ThemedText>
                                    )}
                                </ThemedView>

                                <ScrollView style={styles.tableContent}>
                                    {cupsLoading ? (
                                        <ThemedView style={styles.loadingContainer}>
                                            <ThemedText>Loading cups...</ThemedText>
                                        </ThemedView>
                                    ) : cupItems.length === 0 ? (
                                        <ThemedView style={styles.emptyContainer}>
                                            <ThemedText>No cups found</ThemedText>
                                        </ThemedView>
                                    ) : (
                                        cupItems.map((cup, index) => (
                                            <ThemedView key={`${cup.id}-${index}`} style={styles.tableRow}>
                                                <ThemedText style={[styles.cellText, styles.cupNameCell]}>
                                                    {cup.name} {cup.isOffline && '📱'}
                                                </ThemedText>
                                                <ThemedText style={[styles.cellText, styles.cupSizeCell]}>{cup.size || 'N/A'}</ThemedText>
                                                <ThemedText style={[styles.cellText, styles.cupStocksCell]}>{cup.stocks}</ThemedText>
                                                {/* Actions cell only for admin */}
                                                {isAdmin && (
                                                    <ThemedView style={styles.cupActionsCell}>

                                                        <TouchableOpacity
                                                            style={styles.editButton}
                                                            onPress={() => openEditCupModal(cup)}
                                                        >
                                                            <Feather name="edit-2" size={16} color="#874E3B" />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            style={styles.deleteButton}
                                                            onPress={() => deleteCup(cup.id)}
                                                        >
                                                            <Feather name="trash-2" size={16} color="#DC2626" />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            style={styles.addStockButton}
                                                            onPress={() => updateCupStocks(cup.id, cup.stocks + 10)}
                                                        >
                                                            <Feather name="plus" size={16} color="#16A34A" />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            style={styles.removeStockButton}
                                                            onPress={() => updateCupStocks(cup.id, Math.max(0, cup.stocks - 10))}
                                                        >
                                                            <Feather name="minus" size={16} color="#DC2626" />
                                                        </TouchableOpacity>
                                                    </ThemedView>
                                                )}
                                            </ThemedView>
                                        ))
                                    )}
                                </ScrollView>
                            </ThemedView>
                        )}
                    </ThemedView>
                </ThemedView>

                {/* Edit Stocks Modal */}
                {editStocksModal && selectedCup && (
                    <ThemedView style={styles.modalOverlay}>
                        <ThemedView style={styles.modalContainer}>
                            <ThemedView style={styles.modalHeader}>
                                <ThemedText style={styles.modalTitle}>
                                    Edit Stocks - {selectedCup.name}
                                </ThemedText>
                                <TouchableOpacity
                                    style={styles.closeButton}
                                    onPress={closeEditStocksModal}
                                >
                                    <Feather name="x" size={20} color="#874E3B" />
                                </TouchableOpacity>
                            </ThemedView>



                            <ThemedView style={styles.modalActions}>
                                <TouchableOpacity
                                    style={styles.cancelModalButton}
                                    onPress={closeEditStocksModal}
                                >
                                    <ThemedText style={styles.cancelModalButtonText}>
                                        Cancel
                                    </ThemedText>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.saveModalButton}
                                    onPress={saveStocks}
                                >
                                    <ThemedText style={styles.saveModalButtonText}>
                                        Save Changes
                                    </ThemedText>
                                </TouchableOpacity>
                            </ThemedView>
                        </ThemedView>
                    </ThemedView>
                )}

                {/* Category Modal */}
                {/* Category Modal */}
                <Modal
                    visible={categoryModalVisible}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={closeCategoryModal}
                >
                    <ThemedView style={styles.modalOverlay}>
                        <ThemedView style={styles.modalContainer}>
                            <ThemedView style={styles.modalHeader}>
                                <ThemedText style={styles.modalTitle}>
                                    {editingCategory ? 'Edit Category' : 'Add New Category'}
                                </ThemedText>
                                <TouchableOpacity
                                    style={styles.closeButton}
                                    onPress={closeCategoryModal}
                                >
                                    <Feather name="x" size={20} color="#874E3B" />
                                </TouchableOpacity>
                            </ThemedView>

                            <ScrollView
                                style={styles.modalContentScroll}
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                            >
                                <ThemedView style={styles.modalContent}>
                                    <ThemedView style={styles.inputContainer}>
                                        <ThemedText style={styles.inputLabel}>
                                            Category Name:
                                        </ThemedText>
                                        <TextInput
                                            style={styles.textInput}
                                            value={categoryName}
                                            onChangeText={setCategoryName}
                                            placeholder="Enter category name"
                                            placeholderTextColor="#9CA3AF"
                                            autoFocus={true} // Auto focus on input
                                            returnKeyType="done"
                                            onSubmitEditing={saveCategory} // Allow saving with keyboard return
                                        />
                                    </ThemedView>

                                    <ThemedView style={styles.inputContainer}>
                                        <ThemedText style={styles.inputLabel}>
                                            Select Icon: {categoryIcon && `(Selected: ${categoryIcon})`}
                                        </ThemedText>
                                        <ScrollView
                                            horizontal
                                            style={styles.iconsContainer}
                                            keyboardShouldPersistTaps="handled"
                                            showsHorizontalScrollIndicator={false}
                                        >
                                            {availableIcons.map((icon) => (
                                                <TouchableOpacity
                                                    key={icon}
                                                    style={[
                                                        styles.iconOption,
                                                        categoryIcon === icon && styles.iconOptionSelected
                                                    ]}
                                                    onPress={() => {
                                                        console.log('🎯 User selected icon:', icon);
                                                        setCategoryIcon(icon);
                                                    }}
                                                >
                                                    <Feather
                                                        name={icon as any}
                                                        size={20}
                                                        color={categoryIcon === icon ? "#FFFEEA" : "#874E3B"}
                                                    />
                                                    <ThemedText style={[
                                                        styles.iconText,
                                                        categoryIcon === icon && styles.iconTextSelected
                                                    ]}>
                                                        {icon}
                                                    </ThemedText>
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    </ThemedView>
                                </ThemedView>
                            </ScrollView>

                            <ThemedView style={styles.modalActions}>
                                <TouchableOpacity
                                    style={styles.cancelModalButton}
                                    onPress={closeCategoryModal}
                                >
                                    <ThemedText style={styles.cancelModalButtonText}>
                                        Cancel
                                    </ThemedText>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.saveModalButton}
                                    onPress={saveCategory}
                                >
                                    <ThemedText style={styles.saveModalButtonText}>
                                        {editingCategory ? 'Update Category' : 'Add Category'}
                                    </ThemedText>
                                </TouchableOpacity>
                            </ThemedView>
                        </ThemedView>
                    </ThemedView>
                </Modal>

                {/* Item Edit Modal */}
                <Modal
                    visible={editItemModal}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={closeEditItemModal}
                >
                    <ThemedView style={styles.modalOverlay}>
                        <ThemedView style={styles.modalContainer}>
                            <ThemedView style={styles.modalHeader}>
                                <ThemedText style={styles.modalTitle}>
                                    Edit Item - {editingItem?.name}
                                </ThemedText>
                                <TouchableOpacity
                                    style={styles.closeButton}
                                    onPress={closeEditItemModal}
                                >
                                    <Feather name="x" size={20} color="#874E3B" />
                                </TouchableOpacity>
                            </ThemedView>

                            <ThemedView style={styles.modalContent}>
                                <ThemedView style={styles.inputContainer}>
                                    <ThemedText style={styles.inputLabel}>
                                        Current Stocks: {editingItem?.stocks}
                                    </ThemedText>
                                    <TextInput
                                        style={styles.stocksInput}
                                        value={editItemStocks}
                                        onChangeText={setEditItemStocks}
                                        keyboardType="numeric"
                                        placeholder="Enter new stocks"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </ThemedView>

                                <ThemedView style={styles.inputContainer}>
                                    <ThemedText style={styles.inputLabel}>
                                        Current Price: ₱{editingItem?.price.toFixed(2)}
                                    </ThemedText>
                                    <TextInput
                                        style={styles.stocksInput}
                                        value={editItemPrice}
                                        onChangeText={setEditItemPrice}
                                        keyboardType="numeric"
                                        placeholder="Enter new price"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </ThemedView>
                            </ThemedView>

                            <ThemedView style={styles.modalActions}>
                                <TouchableOpacity
                                    style={styles.cancelModalButton}
                                    onPress={closeEditItemModal}
                                >
                                    <ThemedText style={styles.cancelModalButtonText}>
                                        Cancel
                                    </ThemedText>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.saveModalButton}
                                    onPress={saveItemChanges}
                                >
                                    <ThemedText style={styles.saveModalButtonText}>
                                        Save Changes
                                    </ThemedText>
                                </TouchableOpacity>
                            </ThemedView>
                        </ThemedView>
                    </ThemedView>
                </Modal>

                {/* Cup Modal */}
                <Modal
                    visible={cupModalVisible}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={closeCupModal}
                >
                    <ThemedView style={styles.modalOverlay}>
                        <ThemedView style={styles.modalContainer}>
                            <ThemedView style={styles.modalHeader}>
                                <ThemedText style={styles.modalTitle}>
                                    {editingCup ? 'Edit Cup' : 'Add New Cup'}
                                </ThemedText>
                                <TouchableOpacity
                                    style={styles.closeButton}
                                    onPress={closeCupModal}
                                >
                                    <Feather name="x" size={20} color="#874E3B" />
                                </TouchableOpacity>
                            </ThemedView>

                            <ThemedView style={styles.modalContent}>
                                <ThemedView style={styles.inputContainer}>
                                    <ThemedText style={styles.inputLabel}>
                                        Cup Name:
                                    </ThemedText>
                                    <TextInput
                                        style={styles.stocksInput}
                                        value={cupName}
                                        onChangeText={setCupName}
                                        placeholder="Enter cup name"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </ThemedView>

                                <ThemedView style={styles.inputContainer}>
                                    <ThemedText style={styles.inputLabel}>
                                        Size:
                                    </ThemedText>
                                    <TextInput
                                        style={styles.stocksInput}
                                        value={cupSize}
                                        onChangeText={setCupSize}
                                        placeholder="Enter cup size (e.g., 8oz, 12oz)"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </ThemedView>

                                <ThemedView style={styles.inputContainer}>
                                    <ThemedText style={styles.inputLabel}>
                                        Stocks:
                                    </ThemedText>
                                    <TextInput
                                        style={styles.stocksInput}
                                        value={cupStocks}
                                        onChangeText={setCupStocks}
                                        keyboardType="numeric"
                                        placeholder="Enter number of stocks"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </ThemedView>
                            </ThemedView>

                            <ThemedView style={styles.modalActions}>
                                <TouchableOpacity
                                    style={styles.cancelModalButton}
                                    onPress={closeCupModal}
                                >
                                    <ThemedText style={styles.cancelModalButtonText}>
                                        Cancel
                                    </ThemedText>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.saveModalButton}
                                    onPress={saveCup}
                                >
                                    <ThemedText style={styles.saveModalButtonText}>
                                        {editingCup ? 'Update Cup' : 'Add Cup'}
                                    </ThemedText>
                                </TouchableOpacity>
                            </ThemedView>
                        </ThemedView>
                    </ThemedView>
                </Modal>
            </ImageBackground>
        </ThemedView>
    );
}

// Styles remain exactly the same as in your original file...
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
        flexDirection: 'row',
        padding: 16,
        backgroundColor: 'transparent',
    },
    // ADD MODE INDICATOR STYLES
    modeIndicatorContainer: {
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 1000,
        backgroundColor: 'rgba(255, 254, 234, 0.9)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 2,
    },
    modeText: {
        fontSize: 12,
        fontWeight: 'bold',
        backgroundColor: '#fffecaF2'
    },
    onlineModeText: {
        color: '#fffecaF2',
        borderColor: '#fffecaF2',
    },
    offlineModeText: {
        color: '#fffecaF2',
        borderColor: '#fffecaF2',
    },
    modeInfo: {
        fontSize: 12,
        color: '#874E3B',
        fontStyle: 'italic',
        marginTop: 4,
        backgroundColor: 'fffecaF2'

    },
    sidebar: {
        width: 200,
        backgroundColor: "#fffecaF2",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#D4A574',
        marginRight: 16,
        paddingVertical: 16,
    },
    sidebarHeader: {
        paddingHorizontal: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E8D8C8',
        backgroundColor: "#fffecaF2",
        marginBottom: 8,
    },
    sidebarTitle: {
        fontSize: 16,
        color: '#874E3B',
        fontFamily: 'LobsterTwoRegular',
    },
    sidebarItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginHorizontal: 8,
        borderRadius: 8,
        gap: 12,
    },
    sidebarItemActive: {
        backgroundColor: '#874E3B',
    },
    sidebarText: {
        fontSize: 14,
        color: '#5A3921',
        fontWeight: '500',
    },
    sidebarTextActive: {
        color: '#FFFEEA',
    },
    mainContent: {
        flex: 1,
        borderRadius: 12,
    },
    headerSection: {
        backgroundColor: "#fffecaF2",
        borderRadius: 12,
        padding: 5,
        borderWidth: 1,
        borderColor: '#D4A574',
        marginBottom: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    mainTitle: {
        fontSize: 28,
        color: '#874E3B',
        fontFamily: 'LobsterTwoItalic',
        backgroundColor: '#fffecaF2'
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        backgroundColor: "#fffecaF2",
    },
    addNewButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#874E3B',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        gap: 8,
    },
    addNewButtonText: {
        color: '#FFFEEA',
        fontSize: 14,
        fontWeight: 'bold',
    },
    statusHeader: {
        flex: 1,
        textAlign: 'center',
    },

    // Status cell
    statusCell: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
        borderRadius: 6,
        marginHorizontal: 2,
    },
    onlineStatus: {
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderWidth: 1,
        borderColor: '#16A34A',
    },
    offlineStatus: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 1,
        borderColor: '#DC2626',
    },
    statusText: {
        fontSize: 11,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    onlineStatusText: {
        color: '#16A34A',
    },
    offlineStatusText: {
        color: '#DC2626',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 254, 234, 0.95)',
        borderWidth: 1,
        borderColor: '#D4A574',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 2,
        minWidth: 250,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: '#5A3921',
    },
    tableSection: {
        flex: 1,
        backgroundColor: "#fffecaF2",
        borderRadius: 12,
        borderWidth: 1,
        borderBottomLeftRadius: 12,
        borderColor: '#D4A574',
        overflow: 'hidden',
    },
    // Add these to your styles in Items.tsx
    deliveredMode: {
        backgroundColor: '#0084FF', // Messenger blue
    },
    sentMode: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#666',
    },
    modeIconText: {
        fontSize: 8,
        fontWeight: 'bold',
        color: '#FFF',
        textAlign: 'center',
        lineHeight: 12,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#874E3B',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderBottomWidth: 2,
        borderBottomColor: '#D4A574',
    },
    headerText: {
        fontWeight: 'bold',
        color: '#FFFEEA',
        fontSize: 14,
    },
    codeHeader: {
        flex: 1.2,
        textAlign: 'center',
    },
    nameHeader: {
        flex: 2,
        textAlign: 'left',
        paddingLeft: 8,
    },
    // Add these to your styles
    iconText: {
        fontSize: 10,
        color: '#874E3B',
        marginTop: 4,
        textAlign: 'center',
    },
    iconTextSelected: {
        color: '#FFFEEA',
    },
    categoryHeader: {
        flex: 1.3,
        textAlign: 'center',
    },
    stocksHeader: {
        flex: 1,
        textAlign: 'center',
    },
    priceHeader: {
        flex: 1,
        textAlign: 'center',
    },
    salesHeader: {
        flex: 1,
        textAlign: 'center',
    },
    actionsHeader: {
        flex: 1.5,
        textAlign: 'center',
    },
    // Category specific headers
    categoryIconHeader: {
        flex: 0.8,
        textAlign: 'center',
    },
    categoryNameHeader: {
        flex: 2,
        textAlign: 'left',
        paddingLeft: 8,
    },
    // Add these to your styles:
    modalContentScroll: {
        maxHeight: 400, // Limit height to prevent modal from being too tall
    },
    modalContent: {
        padding: 20,
    },
    textInput: {
        backgroundColor: '#FFFFFF',
        borderWidth: 2,
        borderColor: '#D4A574',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 16,
        color: '#5A3921',
    },
    categoryItemsHeader: {
        flex: 1.5,
        textAlign: 'center',
    },
    categoryDateHeader: {
        flex: 2,
        textAlign: 'center',
    },
    categoryActionsHeader: {
        flex: 1.2,
        textAlign: 'center',
    },
    // Cup specific headers
    cupNameHeader: {
        flex: 2,
        textAlign: 'left',
        paddingLeft: 8,
    },
    cupSizeHeader: {
        flex: 1,
        textAlign: 'center',
    },
    cupStocksHeader: {
        flex: 1,
        textAlign: 'center',
    },
    cupActionsHeader: {
        flex: 1.5,
        textAlign: 'center',
    },
    tableContent: {
        flex: 1,
    },
    tableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#E8D8C8',
        backgroundColor: "rgba(255, 254, 234, 0.95)",
    },
    cellText: {
        fontSize: 13,
        color: '#5A3921',
        fontWeight: '500',
    },
    codeCell: {
        flex: 1.2,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    nameCell: {
        flex: 2,
        textAlign: 'left',
        paddingLeft: 8,
    },
    categoryCell: {
        flex: 1.3,
        textAlign: 'center',
    },
    stocksCell: {
        flex: 1,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    priceCell: {
        flex: 1,
        textAlign: 'center',
        fontWeight: 'bold',
        color: '#874E3B',
    },
    // Add to your styles
    checkIndicator: {
        width: 15,
        height: 15,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
    },
    onlineCheck: {
        backgroundColor: 'rgba(0, 132, 255, 0.1)',
        borderColor: '#0084FF',
    },
    offlineCheck: {
        backgroundColor: 'rgba(102, 102, 102, 0.1)',
        borderColor: '#666',
    },
    salesCell: {
        flex: 1,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    // Category specific cells
    categoryIconCell: {
        flex: 0.8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    categoryNameCell: {
        flex: 2,
        textAlign: 'left',
        paddingLeft: 8,
    },
    categoryItemsCell: {
        flex: 1.5,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    categoryDateCell: {
        flex: 2,
        textAlign: 'center',
        fontSize: 12,
    },
    categoryActionsCell: {
        flex: 1.2,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
    },
    // Cup specific cells
    cupNameCell: {
        flex: 2,
        textAlign: 'left',
        paddingLeft: 8,
    },
    cupSizeCell: {
        flex: 1,
        textAlign: 'center',
    },
    cupStocksCell: {
        flex: 1,
        textAlign: 'center',
        fontWeight: 'bold',
        fontSize: 16,
    },
    actionsCell: {
        flex: 1.5,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    cupActionsCell: {
        flex: 1.5,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
    },
    true1: {
        backgroundColor: '#fffecaF2'
    },
    statusButton: {
        width: 32,
        height: 32,
        borderRadius: 6,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    statusActive: {
        backgroundColor: '#DCFCE7',
        borderColor: '#16A34A',
    },
    statusInactive: {
        backgroundColor: '#FEE2E2',
        borderColor: '#DC2626',
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
    editButton: {
        width: 32,
        height: 32,
        borderRadius: 6,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    deleteButton: {
        width: 32,
        height: 32,
        borderRadius: 6,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#DC2626',
    },
    // Cup action buttons
    stockButton: {
        width: 32,
        height: 32,
        borderRadius: 6,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    addStockButton: {
        width: 32,
        height: 32,
        borderRadius: 6,
        backgroundColor: '#DCFCE7',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#16A34A',
    },
    removeStockButton: {
        width: 32,
        height: 32,
        borderRadius: 6,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#DC2626',
    },
    tableFooter: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#D4A574',
        backgroundColor: '#F5E6D3',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    footerText: {
        fontSize: 14,
        color: '#5A3921',
        fontWeight: '500',
    },
    paginationContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 24,
        backgroundColor: '#F5E6D3',
    },
    itemsPerPage: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5E6D3',
        gap: 8,
    },
    paginationText: {
        fontSize: 14,
        color: '#5A3921',
        fontWeight: '500',
    },
    pageSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D4A574',
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        gap: 4,
    },
    pageSelectorText: {
        fontSize: 14,
        color: '#5A3921',
        fontWeight: '500',
    },
    pageNavigation: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5E6D3',
        gap: 8,
    },
    pageButton: {
        width: 32,
        height: 32,
        borderRadius: 4,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    pageButtonDisabled: {
        backgroundColor: '#F3F4F6',
        borderColor: '#D1D5DB',
    },
    pageNumber: {
        width: 32,
        height: 32,
        borderRadius: 4,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    pageNumberActive: {
        backgroundColor: '#874E3B',
        borderColor: '#874E3B',
    },
    pageNumberText: {
        fontSize: 14,
        color: '#5A3921',
        fontWeight: '500',
    },
    pageNumberTextActive: {
        color: '#FFFEEA',
    },
    pageDots: {
        fontSize: 14,
        color: '#5A3921',
        fontWeight: '500',
    },
    loadingContainer: {
        padding: 20,
        alignItems: 'center',
        backgroundColor: '#fffecaF2'
    },
    emptyContainer: {
        padding: 20,
        alignItems: 'center',
        backgroundColor: 'transparent',
    },

    // Modal Styles
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
    modalContainer: {
        width: '80%',
        backgroundColor: '#FFFEEA',
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#D4A574',
        padding: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E8D8C8',
        backgroundColor: '#F5E6D3',
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#874E3B',
        fontFamily: 'LobsterTwoRegular',
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FFFEEA',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D4A574',
    },

    inputContainer: {
        marginTop: 16,
    },
    inputLabel: {
        fontSize: 16,
        color: '#5A3921',
        fontWeight: '500',
        marginBottom: 8,
    },
    stocksInput: {
        backgroundColor: '#FFFFFF',
        borderWidth: 2,
        borderColor: '#D4A574',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        fontSize: 16,
        color: '#5A3921',
        textAlign: 'center',
        fontWeight: 'bold',
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#E8D8C8',
        backgroundColor: '#F5E6D3',
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 10,
    },
    cancelModalButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 6,
        backgroundColor: '#E8D8C8',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    cancelModalButtonText: {
        color: '#874E3B',
        fontSize: 14,
        fontWeight: 'bold',
    },
    saveModalButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 6,
        backgroundColor: '#874E3B',
    },
    saveModalButtonText: {
        color: '#FFFEEA',
        fontSize: 14,
        fontWeight: 'bold',
    },
    // Category Modal Styles
    iconsContainer: {
        flexDirection: 'row',
        marginTop: 8,
    },
    iconOption: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    iconOptionSelected: {
        backgroundColor: '#874E3B',
        borderColor: '#874E3B',
    },
});