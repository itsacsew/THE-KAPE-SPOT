// app/(tabs)/items.tsx
import { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, TextInput, TouchableOpacity, ImageBackground, Alert } from 'react-native';
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

export default function ItemsScreen() {
    const [searchQuery, setSearchQuery] = useState('');
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [activeSidebar, setActiveSidebar] = useState('food-items');
    const [currentPage, setCurrentPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [isOnlineMode, setIsOnlineMode] = useState<boolean>(false);
    const itemsPerPage = 10;

    // Function to get dynamic API URL
    const getApiBaseUrl = async (): Promise<string> => {
        try {
            const serverIP = await NetworkScanner.findServerIP();

            if (serverIP === 'demo') {
                console.log('🔄 Running in demo mode');
                setIsOnlineMode(false);
                return 'demo';
            }

            const baseUrl = `http://${serverIP}/backend/api`;
            console.log(`🌐 Using server: ${baseUrl}`);
            setIsOnlineMode(true);
            return baseUrl;

        } catch (error) {
            console.log('❌ Error detecting server, using demo mode');
            setIsOnlineMode(false);
            return 'demo';
        }
    };

    // Demo data
    const demoData: MenuItem[] = [
        { id: '1', code: '18754', name: 'Cheese Burst Sandwich', price: 12.00, category: 'Sandwich', stocks: 50, sales: 112, status: true, description: 'Delicious cheese burst sandwich' },
    ];

    // Load menu items from API - SEPARATE LOGIC FOR ONLINE vs OFFLINE
    const loadMenuItems = async () => {
        setLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const API_BASE_URL = await getApiBaseUrl();

            if (API_BASE_URL === 'demo') {
                console.log('📱 Loading OFFLINE data (demo + local storage)...');
                // OFFLINE MODE: Show ONLY local storage items + demo data
                const offlineItems = await syncService.getItems();
                const allOfflineItems = [...demoData, ...offlineItems];

                const items: MenuItem[] = allOfflineItems.map(item => ({
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
            console.error('❌ Error loading items:', error);
            // Fallback to OFFLINE mode on error
            const syncService = OfflineSyncService.getInstance();
            const offlineItems = await syncService.getItems();
            setMenuItems([...demoData, ...offlineItems]);
            setIsOnlineMode(false);
        } finally {
            setLoading(false);
        }
    };

    // Load categories from API
    const loadCategories = async () => {
        try {
            const API_BASE_URL = await getApiBaseUrl();
            if (API_BASE_URL === 'demo') return;

            const response = await fetch(`${API_BASE_URL}/categories.php`);
            const data = await response.json();
            setCategories(data);
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    };

    useFocusEffect(
        React.useCallback(() => {
            loadMenuItems();
            loadCategories();
        }, [])
    );

    const filteredItems = menuItems.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.code.includes(searchQuery)
    );

    // Pagination
    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedItems = filteredItems.slice(startIndex, startIndex + itemsPerPage);

    const handleAddNewItem = () => {
        router.push('/add-item');
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
                    {/* Mode Indicator */}


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
                    </ThemedView>

                    {/* Main Content Area */}
                    <ThemedView style={styles.mainContent}>
                        {/* Header Section */}
                        <ThemedView style={styles.headerSection}>
                            <ThemedView>
                                <ThemedText style={styles.mainTitle}>Food Items</ThemedText>
                                <ThemedText style={styles.modeInfo}>
                                    {isOnlineMode
                                        ? 'Connected to server'
                                        : 'Using local storage'
                                    }
                                </ThemedText>
                            </ThemedView>

                            <ThemedView style={styles.headerActions}>
                                <TouchableOpacity style={styles.addNewButton} onPress={handleAddNewItem} disabled={loading}>
                                    <Feather name="plus" size={16} color="#FFFEEA" />
                                    <ThemedText style={styles.addNewButtonText}>
                                        {loading ? 'Loading...' : 'Add New'}
                                    </ThemedText>
                                </TouchableOpacity>

                                <ThemedView style={styles.searchContainer}>
                                    <Feather name="search" size={18} color="#874E3B" style={styles.searchIcon} />
                                    <TextInput
                                        style={styles.searchInput}
                                        placeholder="Search Item"
                                        value={searchQuery}
                                        onChangeText={setSearchQuery}
                                    />
                                </ThemedView>
                            </ThemedView>
                        </ThemedView>

                        {/* Items Table Section */}
                        <ThemedView style={styles.tableSection}>
                            <ThemedView style={styles.tableHeader}>
                                <ThemedText style={[styles.headerText, styles.codeHeader]}>Code</ThemedText>
                                <ThemedText style={[styles.headerText, styles.nameHeader]}>Item Name</ThemedText>
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
                                    paginatedItems.map((item) => (
                                        <ThemedView key={item.id} style={styles.tableRow}>
                                            <ThemedText style={[styles.cellText, styles.codeCell]}>
                                                {item.code} {item.isOffline && '📱'}
                                            </ThemedText>
                                            <ThemedText style={[styles.cellText, styles.nameCell]}>{item.name}</ThemedText>
                                            <ThemedText style={[styles.cellText, styles.categoryCell]}>{item.category}</ThemedText>
                                            <ThemedText style={[styles.cellText, styles.stocksCell]}>{item.stocks}</ThemedText>
                                            <ThemedText style={[styles.cellText, styles.priceCell]}>${item.price.toFixed(2)}</ThemedText>
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
                    </ThemedView>
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
    },
    onlineModeText: {
        color: '#16A34A',
        borderColor: '#16A34A',
    },
    offlineModeText: {
        color: '#DC2626',
        borderColor: '#DC2626',
    },
    modeInfo: {
        fontSize: 12,
        color: '#874E3B',
        fontStyle: 'italic',
        marginTop: 4,
    },
    sidebar: {
        width: 200,
        backgroundColor: "rgba(255, 254, 234, 0.95)",
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
        backgroundColor: "rgba(255, 254, 234, 0.95)",
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
        backgroundColor: "rgba(255, 254, 234, 0.95)",
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
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        backgroundColor: "rgba(255, 254, 234, 0.95)",
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
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D4A574',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
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
        backgroundColor: "rgba(255, 254, 250, 0.95)",
        borderRadius: 12,
        borderWidth: 1,
        borderBottomLeftRadius: 12,
        borderColor: '#D4A574',
        overflow: 'hidden',
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
        flex: 2.5,
        textAlign: 'left',
        paddingLeft: 8,
    },
    categoryHeader: {
        flex: 1.5,
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
        flex: 2.5,
        textAlign: 'left',
        paddingLeft: 8,
    },
    categoryCell: {
        flex: 1.5,
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
    salesCell: {
        flex: 1,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    actionsCell: {
        flex: 1.5,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
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
    },
    emptyContainer: {
        padding: 20,
        alignItems: 'center',
    },
});