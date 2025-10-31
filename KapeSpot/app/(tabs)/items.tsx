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
}

interface Category {
    id: string;
    name: string;
    icon?: string;
    items_count: number;
    created_on: string;
    isOffline?: boolean;
}


interface CupItem {
    id: string;
    name: string;
    stocks: number;
    size?: string;
    status?: boolean;
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

interface ApiCategory {
    id: number | string;
    name: string;
    icon?: string;
    items_count?: number;
    created_at?: string;
    created_on?: string;
}
// Add this interface sa items.tsx
interface PendingItem {
    id: string;
    type: 'CREATE_ITEM' | 'UPDATE_ITEM' | 'DELETE_ITEM' | 'CREATE_CATEGORY' | 'UPDATE_CATEGORY' | 'DELETE_CATEGORY';
    data: any;
    timestamp: number;
    retryCount: number;
    serverId?: string;
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

    // Modal states
    const [editStocksModal, setEditStocksModal] = useState(false);
    const [selectedCup, setSelectedCup] = useState<CupItem | null>(null);
    const [newStocks, setNewStocks] = useState('');

    // Category Modal states
    const [categoryModalVisible, setCategoryModalVisible] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [categoryName, setCategoryName] = useState('');
    const [categoryIcon, setCategoryIcon] = useState('folder');

    const itemsPerPage = 10;

    // Function to get dynamic API URL
    // Function to get dynamic API URL
    const getApiBaseUrl = async (): Promise<string> => {
        try {
            const serverIP = await NetworkScanner.findServerIP();

            if (serverIP === 'demo' || serverIP === 'local') {
                console.log('❌ No server found, using local storage only');
                setIsOnlineMode(false);
                return 'local';
            }

            // Test the connection first with proper timeout
            const testUrl = `http://${serverIP}/backend/api/test.php`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            try {
                const testResponse = await fetch(testUrl, {
                    method: 'GET',
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!testResponse.ok) {
                    throw new Error('Server test failed');
                }

                const baseUrl = `http://${serverIP}/backend/api`;
                console.log(`🌐 Using server: ${baseUrl}`);
                setIsOnlineMode(true);
                return baseUrl;
            } catch (testError) {
                clearTimeout(timeoutId);
                throw testError;
            }

        } catch (error) {
            console.log('❌ Error detecting server, using local storage only:', error);
            setIsOnlineMode(false);
            return 'local';
        }
    };



    // Available icons for categories
    const availableIcons = ['folder', 'coffee', 'star', 'shopping-bag', 'package', 'heart', 'bookmark', 'tag'];

    // Load menu items from API - SEPARATE LOGIC FOR ONLINE vs OFFLINE
    // Load menu items from API - SEPARATE LOGIC FOR ONLINE vs OFFLINE
    const loadMenuItems = async () => {
        setLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const API_BASE_URL = await getApiBaseUrl();

            if (API_BASE_URL === 'local') {
                console.log('📱 Loading OFFLINE data (local storage only)...');
                // OFFLINE MODE: Show ONLY local storage items
                const offlineItems = await syncService.getItems();

                const items: MenuItem[] = offlineItems.map(item => ({
                    ...item,
                    isOffline: true // Mark all as offline
                }));

                setMenuItems(items);
                console.log('✅ Loaded OFFLINE items:', items.length, 'items');
                return;
            }

            console.log('🔗 Fetching from SERVER (ONLINE MODE)...');
            const response = await fetch(`${API_BASE_URL}/items.php`);

            if (!response.ok) throw new Error('HTTP error');

            const data: ApiMenuItem[] = await response.json();
            console.log('📦 Server data received:', data.length, 'items');

            // ONLINE MODE: Show ONLY server items (no local storage items)
            const serverItems: MenuItem[] = data.map((item: ApiMenuItem) => ({
                id: String(item.id),
                code: String(item.code),
                name: String(item.name),
                price: Number(item.price),
                category: String(item.category),
                stocks: Number(item.stocks || 0),
                sales: Number(item.sales || 0),
                status: item.status === '1' || item.status === 1 || item.status === true,
                description: item.description ? String(item.description) : '',
                image: item.image || undefined,
                isOffline: false // Mark as online
            }));

            setMenuItems(serverItems);
            console.log('✅ Loaded ONLINE items:', serverItems.length, 'server items');

        } catch (error) {

            // Fallback to OFFLINE mode on error
            const syncService = OfflineSyncService.getInstance();
            const offlineItems = await syncService.getItems();
            setMenuItems(offlineItems);
            setIsOnlineMode(false);
        } finally {
            setLoading(false);
        }
    };

    // Load categories from API
    // Load categories from API - FIXED VERSION
    const loadCategories = async () => {
        setCategoriesLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const API_BASE_URL = await getApiBaseUrl();

            console.log('🔄 [CATEGORY LOAD] Starting categories load process...');
            console.log('🌐 Current Mode:', API_BASE_URL === 'local' ? 'OFFLINE' : 'ONLINE');

            if (API_BASE_URL === 'local') {
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

            console.log('🔗 [CATEGORY LOAD] Fetching categories from server (ONLINE MODE)...');
            const response = await fetch(`${API_BASE_URL}/categories.php`);

            if (!response.ok) {
                console.error('❌ [CATEGORY LOAD] Server response not OK:', response.status);
                throw new Error('HTTP error');
            }

            const data: ApiCategory[] = await response.json();
            console.log('📦 [CATEGORY LOAD] Server categories received:', data.length, 'categories');

            // ONLINE MODE: Show ONLY server categories (NO local storage categories)
            const serverCategories: Category[] = data.map((category: ApiCategory) => ({
                id: String(category.id),
                name: String(category.name),
                icon: category.icon || 'folder',
                items_count: category.items_count || 0,
                created_on: category.created_at || category.created_on || 'Unknown date',
                isOffline: false // Mark as online
            }));

            setCategories(serverCategories);
            console.log('✅ [CATEGORY LOAD] Loaded ONLINE categories:', serverCategories.length, 'server categories ONLY');

        } catch (error) {


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

    // Load cups data - LOCAL STORAGE ONLY
    // Load cups data - LOCAL STORAGE ONLY
    const loadCups = async () => {
        setCupsLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const API_BASE_URL = await getApiBaseUrl();

            if (API_BASE_URL === 'local') {
                // OFFLINE MODE: Load from local storage only
                console.log('📱 Loading cups from local storage (OFFLINE MODE)...');
                const storedCups = await syncService.getCups();

                if (storedCups.length > 0) {
                    setCupItems(storedCups);
                    console.log('✅ Loaded cups from local storage:', storedCups.length, 'cups');
                } else {
                    // Create initial cups in local storage
                    const initialCups: CupItem[] = [
                        { id: '1', name: 'Small Cup', stocks: 100, size: '8oz' },
                        { id: '2', name: 'Medium Cup', stocks: 80, size: '12oz' },
                        { id: '3', name: 'Large Cup', stocks: 60, size: '16oz' },
                    ];
                    await syncService.saveCups(initialCups);
                    setCupItems(initialCups);
                    console.log('✅ Created initial cups in local storage');
                }
                return;
            }

            // ONLINE MODE: Load from server
            console.log('🌐 Loading cups from server (ONLINE MODE)...');
            const response = await fetch(`${API_BASE_URL}/cups.php`);

            if (!response.ok) throw new Error('HTTP error');

            const data = await response.json();
            console.log('📦 Server cups data received:', data.length, 'cups');

            const serverCups: CupItem[] = data.map((cup: any) => ({
                id: String(cup.id),
                name: String(cup.name),
                size: cup.size || '',
                stocks: Number(cup.stocks || 0),
                status: cup.status === '1' || cup.status === 1 || cup.status === true,
                isOffline: false
            }));

            setCupItems(serverCups);
            console.log('✅ Loaded ONLINE cups:', serverCups.length, 'server cups');

        } catch (error) {


            // Fallback to local storage
            const syncService = OfflineSyncService.getInstance();
            const storedCups = await syncService.getCups();

            if (storedCups.length > 0) {
                setCupItems(storedCups);
                console.log('✅ Fallback: Loaded cups from local storage:', storedCups.length, 'cups');
            } else {
                const initialCups: CupItem[] = [
                    { id: '1', name: 'Small Cup', stocks: 100, size: '8oz' },
                    { id: '2', name: 'Medium Cup', stocks: 80, size: '12oz' },
                    { id: '3', name: 'Large Cup', stocks: 60, size: '16oz' },
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
            loadCups(); // Load cups data
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
        router.push('/add-item');
    };

    // Category Functions
    const openAddCategoryModal = () => {
        console.log('➕ [CATEGORY MODAL] Opening ADD category modal');
        setEditingCategory(null);
        setCategoryName('');
        setCategoryIcon('folder');
        setCategoryModalVisible(true);
    };

    const openEditCategoryModal = (category: Category) => {
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

    // Save category - FIXED VERSION with proper icon handling
    const saveCategory = async () => {
        if (!categoryName.trim()) {
            Alert.alert('Error', 'Please enter category name');
            return;
        }

        try {
            const syncService = OfflineSyncService.getInstance();
            const API_BASE_URL = await getApiBaseUrl();

            // Prepare category data with the selected icon
            const categoryData = {
                name: categoryName,
                icon: categoryIcon, // This is the icon selected by user
                items_count: 0,
                created_on: new Date().toLocaleString(),
                ...(editingCategory && { id: editingCategory.id })
            };

            console.log('🔄 [CATEGORY SAVE] Starting category save process...');
            console.log('📝 Category Data:', {
                name: categoryName,
                icon: categoryIcon, // Selected icon
                isEdit: !!editingCategory,
                editingId: editingCategory?.id
            });
            console.log('🎯 Selected Icon:', categoryIcon);
            console.log('🌐 Current Mode:', isOnlineMode ? 'ONLINE' : 'OFFLINE');

            // STEP 1: ALWAYS SAVE TO LOCAL STORAGE FIRST
            console.log('💾 [CATEGORY SAVE] Step 1: Saving to LOCAL storage...');
            const localResult = await syncService.saveCategory(categoryData, false);

            if (!localResult.success) {
                console.error('❌ [CATEGORY SAVE] FAILED to save to local storage');
                Alert.alert('Error', 'Failed to save category to local storage');
                return;
            }

            console.log('✅ [CATEGORY SAVE] Step 1 COMPLETE: Saved to LOCAL storage');
            console.log('📦 Local Storage Result:', {
                success: localResult.success,
                id: localResult.id,
                isOffline: localResult.isOffline,
                icon: categoryIcon // Confirm icon saved locally
            });

            // STEP 2: TRY TO SAVE TO SERVER IF ONLINE
            if (API_BASE_URL !== 'local' && isOnlineMode) {
                console.log('🌐 [CATEGORY SAVE] Step 2: Attempting to save to SERVER...');

                try {
                    // FIX: Ensure icon is properly included in server data
                    const serverData: any = {
                        name: categoryName,
                        icon: categoryIcon // Make sure icon is included
                    };

                    // For updates, include the ID
                    if (editingCategory) {
                        serverData.id = editingCategory.id;
                    }

                    console.log('📤 Sending to Server:', serverData);
                    console.log('🎯 Icon being sent:', serverData.icon);

                    let url: string;
                    let method: string;

                    if (editingCategory) {
                        url = `${API_BASE_URL}/categories.php`;
                        method = 'PUT';
                        console.log('📝 [CATEGORY SAVE] Updating existing category on server');
                    } else {
                        url = `${API_BASE_URL}/categories.php`;
                        method = 'POST';
                        console.log('➕ [CATEGORY SAVE] Creating new category on server');
                    }

                    console.log('🔗 Server Request Details:', {
                        url: url,
                        method: method,
                        data: serverData
                    });

                    const response = await fetch(url, {
                        method: method,
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(serverData),
                    });

                    console.log('📡 Server Response Status:', response.status);

                    // Check if response is JSON
                    const contentType = response.headers.get('content-type');
                    if (!contentType || !contentType.includes('application/json')) {
                        const textResponse = await response.text();
                        console.error('❌ [CATEGORY SAVE] Server returned non-JSON response:', textResponse);
                        throw new Error('Server returned invalid response format');
                    }

                    const result = await response.json();
                    console.log('📄 Server Response Data:', result);

                    if (!response.ok) {
                        throw new Error(result.message || `HTTP error! status: ${response.status}`);
                    }

                    if (result.success) {
                        console.log('✅ [CATEGORY SAVE] Step 2 COMPLETE: Saved to SERVER successfully');
                        console.log('🎯 Server Save Result:', {
                            success: result.success,
                            category_id: result.category_id,
                            id: result.id,
                            message: result.message,
                            icon_sent: categoryIcon
                        });

                        // STEP 3: UPDATE LOCAL STORAGE WITH SERVER INFO
                        console.log('🔄 [CATEGORY SAVE] Step 3: Updating local record with server info...');

                        if (result.category_id || result.id) {
                            const serverId = result.category_id || result.id;
                            console.log('🆕 Updating local category with server ID:', serverId);

                            const updateResult = await syncService.saveCategory({
                                ...categoryData,
                                id: String(serverId),
                                serverId: String(serverId),
                                icon: categoryIcon // Keep the same icon
                            }, true);

                            console.log('✅ [CATEGORY SAVE] Step 3 COMPLETE: Local record updated with server ID');
                            console.log('📦 Local Update Result:', {
                                success: updateResult.success,
                                icon_preserved: categoryIcon
                            });
                        }

                        await loadCategories();
                        Alert.alert(
                            'Success',
                            `Category "${categoryName}" with icon "${categoryIcon}" saved successfully to both local and server!`
                        );

                        console.log('🎉 [CATEGORY SAVE] COMPLETE: Category with icon saved to BOTH LOCAL AND SERVER!');

                    } else {
                        throw new Error(result.message || 'Server returned success: false');
                    }

                } catch (serverError) {
                    console.log('⚠️ [CATEGORY SAVE] Server save failed, but local backup exists');
                    console.log('💾 Local backup has icon:', categoryIcon);

                    await loadCategories();
                    Alert.alert(
                        'Saved Locally',
                        `Category "${categoryName}" with icon "${categoryIcon}" saved to local storage. Server sync will be retried later.`
                    );
                }
            } else {
                // OFFLINE MODE - Only local save was successful
                console.log('📱 [CATEGORY SAVE] Offline mode - Only saved to LOCAL storage');
                console.log('💾 Local storage has icon:', categoryIcon);

                await loadCategories();
                Alert.alert(
                    'Saved Locally',
                    `Category "${categoryName}" with icon "${categoryIcon}" saved to local storage. Will sync when online.`
                );
            }

            console.log('🎉 [CATEGORY SAVE] FINAL: Category with icon saved successfully!');
            closeCategoryModal();

        } catch (error) {
            console.error('❌ [CATEGORY SAVE] Error saving category with icon:', categoryIcon);
            Alert.alert(
                'Error',
                `Failed to save category: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    };
    const deleteCategory = async (id: string) => {
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
                            const API_BASE_URL = await getApiBaseUrl();

                            // Find the category first
                            const categoryToDelete = categories.find(cat => cat.id === id);
                            if (!categoryToDelete) {
                                Alert.alert('Error', 'Category not found');
                                return;
                            }

                            console.log('🗑️ [DUAL-SAVE DELETE] Starting dual-save delete process for category:', categoryToDelete.name);

                            // STEP 1: ALWAYS DELETE FROM LOCAL STORAGE FIRST
                            console.log('💾 [DUAL-SAVE DELETE] Step 1: Deleting from LOCAL storage...');
                            const localSuccess = await syncService.deleteLocalCategory(id);

                            if (!localSuccess) {
                                Alert.alert('Error', 'Failed to delete category from local storage');
                                return;
                            }

                            console.log('✅ [DUAL-SAVE DELETE] Step 1 COMPLETE: Deleted from LOCAL storage');

                            // STEP 2: UPDATE LOCAL ITEMS THAT USE THIS CATEGORY
                            console.log('🔄 [DUAL-SAVE DELETE] Step 2: Updating items with deleted category...');
                            const localItems = await syncService.getItems();
                            const itemsToUpdate = localItems.filter(item => item.category === categoryToDelete.name);

                            if (itemsToUpdate.length > 0) {
                                console.log(`📝 [DUAL-SAVE DELETE] Updating ${itemsToUpdate.length} items to 'Uncategorized'`);

                                const updatedItems = localItems.map(item =>
                                    item.category === categoryToDelete.name
                                        ? { ...item, category: 'Uncategorized' }
                                        : item
                                );

                                await syncService.setItem('localItems', JSON.stringify(updatedItems));
                                console.log('✅ [DUAL-SAVE DELETE] Step 2 COMPLETE: Items updated');
                            }

                            // STEP 3: TRY TO DELETE FROM SERVER IF ONLINE AND IT'S AN ONLINE CATEGORY
                            if (API_BASE_URL !== 'local' && isOnlineMode && !categoryToDelete.isOffline) {
                                console.log('🌐 [DUAL-SAVE DELETE] Step 3: Attempting to delete from SERVER...');

                                try {
                                    const response = await fetch(`${API_BASE_URL}/categories.php?id=${id}`, {
                                        method: 'DELETE',
                                    });

                                    const result = await response.json();

                                    if (result.success) {
                                        console.log('✅ [DUAL-SAVE DELETE] Step 3 COMPLETE: Deleted from SERVER successfully');

                                        // STEP 4: ALSO UPDATE ITEMS ON SERVER IF NEEDED
                                        if (itemsToUpdate.length > 0) {
                                            console.log('🔄 [DUAL-SAVE DELETE] Step 4: Updating items on server...');
                                            for (const item of itemsToUpdate) {
                                                if (!item.isOffline) {
                                                    try {
                                                        await fetch(`${API_BASE_URL}/items.php`, {
                                                            method: 'PUT',
                                                            headers: {
                                                                'Content-Type': 'application/json',
                                                            },
                                                            body: JSON.stringify({
                                                                id: item.id,
                                                                category: 'Uncategorized'
                                                            }),
                                                        });
                                                    } catch (itemError) {
                                                        console.log('⚠️ Failed to update item on server:', item.name);
                                                    }
                                                }
                                            }
                                            console.log('✅ [DUAL-SAVE DELETE] Step 4 COMPLETE: Server items updated');
                                        }

                                        Alert.alert('Success', 'Category deleted successfully from both local and server!');

                                    } else {
                                        throw new Error(result.message || 'Server returned success: false');
                                    }

                                } catch (serverError) {
                                    console.log('⚠️ [DUAL-SAVE DELETE] Server delete failed, but local delete completed:', serverError);

                                    // Add to pending items for later server deletion
                                    const pendingDelete: PendingItem = {
                                        id: id,
                                        type: 'DELETE_CATEGORY',
                                        data: { id: id, name: categoryToDelete.name },
                                        timestamp: Date.now(),
                                        retryCount: 0
                                    };

                                    const pendingItems = await syncService.getPendingItems();
                                    const filteredPendingItems = pendingItems.filter(item => item.id !== id);
                                    filteredPendingItems.push(pendingDelete);
                                    await syncService.setItem('pendingItems', JSON.stringify(filteredPendingItems));

                                    Alert.alert(
                                        'Deleted Locally',
                                        'Category deleted from local storage. Server deletion will be retried later.'
                                    );
                                }
                            } else {
                                // OFFLINE MODE or OFFLINE CATEGORY - Only local delete was successful
                                if (categoryToDelete.isOffline) {
                                    console.log('📱 [DUAL-SAVE DELETE] Offline category - Only deleted from LOCAL storage');
                                } else {
                                    console.log('📡 [DUAL-SAVE DELETE] Offline mode - Only deleted from LOCAL storage');
                                }

                                // Add to pending items for later server deletion (if it was an online category)
                                if (!categoryToDelete.isOffline) {
                                    const pendingDelete: PendingItem = {
                                        id: id,
                                        type: 'DELETE_CATEGORY',
                                        data: { id: id, name: categoryToDelete.name },
                                        timestamp: Date.now(),
                                        retryCount: 0
                                    };

                                    const pendingItems = await syncService.getPendingItems();
                                    const filteredPendingItems = pendingItems.filter(item => item.id !== id);
                                    filteredPendingItems.push(pendingDelete);
                                    await syncService.setItem('pendingItems', JSON.stringify(filteredPendingItems));
                                }

                                Alert.alert(
                                    'Deleted Locally',
                                    'Category deleted from local storage.' +
                                    (!categoryToDelete.isOffline ? ' Will sync deletion when online.' : '')
                                );
                            }

                            // STEP 5: UPDATE UI
                            console.log('🎨 [DUAL-SAVE DELETE] Step 5: Updating UI...');
                            setCategories(prev => prev.filter(cat => cat.id !== id));

                            // Also update menu items in state
                            setMenuItems(prev => prev.map(item =>
                                item.category === categoryToDelete.name
                                    ? { ...item, category: 'Uncategorized' }
                                    : item
                            ));

                            console.log('🎉 [DUAL-SAVE DELETE] DUAL-SAVE DELETE PROCESS COMPLETED!');

                        } catch (error) {
                            console.error('❌ [DUAL-SAVE DELETE] Error in dual-save delete process:', error);
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

    // Update cup stocks - LOCAL STORAGE ONLY
    const updateCupStocks = async (id: string, newStocks: number) => {
        try {
            const syncService = OfflineSyncService.getInstance();
            const API_BASE_URL = await getApiBaseUrl();

            // Find the cup to check if it's offline
            const cupToUpdate = cupItems.find(cup => cup.id === id);
            const isOfflineCup = cupToUpdate?.isOffline;

            if (API_BASE_URL === 'demo' || !isOnlineMode || isOfflineCup) {
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

            // ONLINE MODE: Update server
            console.log('🌐 Updating cup stocks on server...');
            const response = await fetch(`${API_BASE_URL}/cups.php`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: id,
                    stocks: newStocks
                }),
            });

            const result = await response.json();

            if (result.success) {
                // Update local state
                setCupItems(prev => prev.map(cup =>
                    cup.id === id ? { ...cup, stocks: newStocks } : cup
                ));

                // Also update local storage for backup
                const updatedCups = cupItems.map(cup =>
                    cup.id === id ? { ...cup, stocks: newStocks } : cup
                );
                await syncService.saveCups(updatedCups);

                Alert.alert('Success', 'Cup stocks updated on server');
            } else {
                Alert.alert('Error', 'Failed to update cup stocks on server');
            }

        } catch (error) {
            console.error('Error updating cup stocks:', error);
            Alert.alert('Error', 'Failed to update cup stocks');
        }
    };

    // Function to open edit stocks modal
    const openEditStocksModal = (cup: CupItem) => {
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

    const deleteItem = async (id: string) => {
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
                            const API_BASE_URL = await getApiBaseUrl();

                            // Find the item first to check if it's offline
                            const itemToDelete = menuItems.find(item => item.id === id);
                            const isOfflineItem = itemToDelete?.isOffline;

                            // Get current counts before deletion
                            const localItemsBefore = await syncService.getItems();
                            const totalItemsBefore = menuItems.length;

                            console.log('📊 TOTAL ITEMS BEFORE DELETION:');
                            console.log('   UI Items:', totalItemsBefore);
                            console.log('   Local Storage:', localItemsBefore.length);
                            console.log('   Item to delete:', itemToDelete?.name, `(ID: ${id})`);

                            if (API_BASE_URL === 'demo' || !isOnlineMode || isOfflineItem) {
                                // OFFLINE MODE or OFFLINE ITEM: Remove from local storage
                                console.log('📱 DELETING FROM LOCAL STORAGE...');

                                const success = await syncService.deleteLocalItem(id);

                                if (success) {
                                    // Remove from local state
                                    setMenuItems(prev => prev.filter(item => item.id !== id));

                                    // Get counts after deletion
                                    const localItemsAfter = await syncService.getItems();
                                    const totalItemsAfter = menuItems.length - 1;

                                    console.log('🎯 DELETION COMPLETE - LOCAL STORAGE:');
                                    console.log('   UI Items:', totalItemsAfter, `(-1)`);
                                    console.log('   Local Storage:', localItemsAfter.length, `(-${localItemsBefore.length - localItemsAfter.length})`);

                                    Alert.alert(
                                        'Success',
                                        `Item deleted successfully from local storage\n\nRemaining: ${localItemsAfter.length} items in local storage`
                                    );
                                } else {
                                    Alert.alert('Error', 'Failed to delete item from local storage');
                                }
                                return;
                            }

                            // ONLINE MODE + ONLINE ITEM: Delete from server
                            console.log('🌐 DELETING FROM SERVER...');
                            const response = await fetch(`${API_BASE_URL}/items.php?id=${id}`, {
                                method: 'DELETE',
                            });
                            const result = await response.json();

                            if (result.success) {
                                // Remove from local state
                                setMenuItems(prev => prev.filter(item => item.id !== id));

                                // Also remove from local storage if it exists there (for backup)
                                await syncService.deleteLocalItem(id);

                                // Get counts after deletion
                                const localItemsAfter = await syncService.getItems();
                                const totalItemsAfter = menuItems.length - 1;

                                console.log('🎯 DELETION COMPLETE - SERVER:');
                                console.log('   UI Items:', totalItemsAfter, `(-1)`);
                                console.log('   Local Storage:', localItemsAfter.length, `(-${localItemsBefore.length - localItemsAfter.length})`);

                                Alert.alert(
                                    'Success',
                                    `Item deleted successfully from server\n\nRemaining: ${totalItemsAfter} items in list\nLocal storage: ${localItemsAfter.length} items`
                                );
                            } else {
                                Alert.alert('Error', 'Failed to delete item from server');
                            }
                        } catch (error) {
                            console.error('❌ Error deleting item:', error);
                            Alert.alert('Error', 'Failed to delete item');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const toggleStatus = async (id: string) => {
        try {
            const API_BASE_URL = await getApiBaseUrl();
            if (API_BASE_URL === 'demo' || !isOnlineMode) {
                // OFFLINE MODE: Update local state only
                setMenuItems(prev => prev.map(item =>
                    item.id === id ? { ...item, status: !item.status } : item
                ));
                return;
            }

            // ONLINE MODE: Update server
            const item = menuItems.find(item => item.id === id);
            const response = await fetch(`${API_BASE_URL}/items.php`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: id,
                    status: !item?.status
                }),
            });

            const result = await response.json();

            if (result.success) {
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
                                    {isOnlineMode ? 'Connected to server' : 'Using local storage'}
                                </ThemedText>
                            </ThemedView>

                            <ThemedView style={styles.headerActions}>
                                {/* Gi-dugang: Reload button */}
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

                                {activeSidebar === 'cups' && (
                                    <TouchableOpacity style={styles.addNewButton} onPress={() => console.log('Add new cup')}>
                                        <Feather name="plus" size={16} color="#FFFEEA" />
                                        <ThemedText style={styles.addNewButtonText}>Add Cup</ThemedText>
                                    </TouchableOpacity>
                                )}

                                {activeSidebar === 'categories' && (
                                    <TouchableOpacity style={styles.addNewButton} onPress={openAddCategoryModal}>
                                        <Feather name="plus" size={16} color="#FFFEEA" />
                                        <ThemedText style={styles.addNewButtonText}>Add New</ThemedText>
                                    </TouchableOpacity>
                                )}

                                {activeSidebar === 'food-items' && (
                                    <TouchableOpacity style={styles.addNewButton} onPress={handleAddNewItem} disabled={loading}>
                                        <Feather name="plus" size={16} color="#FFFEEA" />
                                        <ThemedText style={styles.addNewButtonText}>
                                            {loading ? 'Loading...' : 'Add New'}
                                        </ThemedText>
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
                                    <ThemedText style={[styles.headerText, styles.actionsHeader]}>Actions</ThemedText>
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
                                                {/* Add this status cell */}
                                                <ThemedView style={[styles.statusCell, item.isOffline ? styles.offlineStatus : styles.onlineStatus]}>
                                                    <ThemedText style={styles.statusText}>
                                                        {item.isOffline ? '📱 Offline' : '🌐 Online'}
                                                    </ThemedText>
                                                </ThemedView>
                                                <ThemedText style={[styles.cellText, styles.categoryCell]}>{item.category}</ThemedText>
                                                <ThemedText style={[styles.cellText, styles.stocksCell]}>{item.stocks}</ThemedText>
                                                <ThemedText style={[styles.cellText, styles.priceCell]}>₱{item.price.toFixed(2)}</ThemedText>
                                                <ThemedText style={[styles.cellText, styles.salesCell]}>{item.sales}</ThemedText>
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
                                                    <TouchableOpacity
                                                        style={styles.editButton}
                                                        onPress={() => console.log('Edit', item.id)}
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
                                    <ThemedText style={[styles.headerText, styles.categoryActionsHeader]}>Actions</ThemedText>
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
                                                <ThemedView style={styles.categoryActionsCell}>
                                                    {/* ADD THIS CHECK INDICATOR */}


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
                                    <ThemedText style={[styles.headerText, styles.cupActionsHeader]}>Actions</ThemedText>
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
                                                <ThemedView style={styles.cupActionsCell}>
                                                    <TouchableOpacity
                                                        style={styles.stockButton}
                                                        onPress={() => openEditStocksModal(cup)}
                                                    >
                                                        <Feather name="edit-2" size={16} color="#874E3B" />
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

                            <ThemedView style={styles.modalContent}>
                                <ThemedText style={styles.inputLabel}>
                                    Current Stocks: {selectedCup.stocks}
                                </ThemedText>

                                <ThemedView style={styles.inputContainer}>
                                    <ThemedText style={styles.inputLabel}>
                                        New Stocks:
                                    </ThemedText>
                                    <TextInput
                                        style={styles.stocksInput}
                                        value={newStocks}
                                        onChangeText={setNewStocks}
                                        keyboardType="numeric"
                                        placeholder="Enter number of stocks"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </ThemedView>
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

                            <ThemedView style={styles.modalContent}>
                                <ThemedView style={styles.inputContainer}>
                                    <ThemedText style={styles.inputLabel}>
                                        Category Name:
                                    </ThemedText>
                                    <TextInput
                                        style={styles.stocksInput}
                                        value={categoryName}
                                        onChangeText={setCategoryName}
                                        placeholder="Enter category name"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                </ThemedView>
                                <ThemedView style={styles.inputContainer}>
                                    <ThemedText style={styles.inputLabel}>
                                        Select Icon: {categoryIcon && `(Selected: ${categoryIcon})`}
                                    </ThemedText>
                                    <ScrollView horizontal style={styles.iconsContainer}>
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
    modalContent: {
        padding: 20,
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