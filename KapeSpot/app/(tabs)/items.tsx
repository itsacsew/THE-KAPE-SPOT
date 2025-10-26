// app/(tabs)/items.tsx
import { useState } from 'react';
import { StyleSheet, ScrollView, TextInput, TouchableOpacity, ImageBackground, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather } from "@expo/vector-icons";
import Navbar from '@/components/Navbar';

interface MenuItem {
    id: string;
    code: string;
    name: string;
    price: number;
    category: string;
    options: number;
    sales: number;
    status: boolean;
}

export default function ItemsScreen() {
    const [searchQuery, setSearchQuery] = useState('');
    const [menuItems, setMenuItems] = useState<MenuItem[]>([
        { id: '1', code: '18754', name: 'Cheese Burst Sandwich', price: 12.00, category: 'Fast Food', options: 3, sales: 112, status: true },
        { id: '2', code: '18755', name: 'Red Source Pasta', price: 12.00, category: 'Fast Food', options: 2, sales: 214, status: true },
        { id: '3', code: '18756', name: 'Sugar Free Coke', price: 12.00, category: 'Beverages', options: 4, sales: 98, status: true },
        { id: '4', code: '18757', name: 'Cassata Vanilla Ice Cream', price: 12.00, category: 'Dessert', options: 2, sales: 102, status: true },
        { id: '5', code: '18758', name: 'Hamm Burger', price: 12.00, category: 'Fast Food', options: 2, sales: 221, status: true },
        { id: '6', code: '18759', name: 'Rosted Chicken Legs', price: 12.00, category: 'Main Course', options: 0, sales: 99, status: true },
        { id: '7', code: '18760', name: 'Red Rose Juice', price: 12.00, category: 'Beverages', options: 0, sales: 121, status: true },
    ]);

    const [activeSidebar, setActiveSidebar] = useState('food-items');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const filteredItems = menuItems.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.code.includes(searchQuery)
    );

    // Pagination
    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedItems = filteredItems.slice(startIndex, startIndex + itemsPerPage);

    const addNewItem = () => {
        Alert.alert('Add New', 'Add new item functionality');
    };

    const deleteItem = (id: string) => {
        Alert.alert(
            'Delete Item',
            'Are you sure you want to delete this item?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        setMenuItems(prev => prev.filter(item => item.id !== id));
                    }
                }
            ]
        );
    };

    const toggleStatus = (id: string) => {
        setMenuItems(prev => prev.map(item =>
            item.id === id ? { ...item, status: !item.status } : item
        ));
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
                    </ThemedView>

                    {/* Main Content Area */}
                    <ThemedView style={styles.mainContent}>
                        {/* Header Section */}
                        <ThemedView style={styles.headerSection}>
                            <ThemedText style={styles.mainTitle}>Food Items</ThemedText>

                            <ThemedView style={styles.headerActions}>
                                <TouchableOpacity style={styles.addNewButton} onPress={addNewItem}>
                                    <Feather name="plus" size={16} color="#FFFEEA" />
                                    <ThemedText style={styles.addNewButtonText}>Add New</ThemedText>
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
                                <ThemedText style={[styles.headerText, styles.optionsHeader]}>Options</ThemedText>
                                <ThemedText style={[styles.headerText, styles.priceHeader]}>Price</ThemedText>
                                <ThemedText style={[styles.headerText, styles.salesHeader]}>Sales</ThemedText>
                                <ThemedText style={[styles.headerText, styles.actionsHeader]}>Actions</ThemedText>
                            </ThemedView>

                            <ScrollView style={styles.tableContent}>
                                {paginatedItems.map((item) => (
                                    <ThemedView key={item.id} style={styles.tableRow}>
                                        <ThemedText style={[styles.cellText, styles.codeCell]}>{item.code}</ThemedText>
                                        <ThemedText style={[styles.cellText, styles.nameCell]}>{item.name}</ThemedText>
                                        <ThemedText style={[styles.cellText, styles.categoryCell]}>{item.category}</ThemedText>
                                        <ThemedText style={[styles.cellText, styles.optionsCell]}>{item.options}</ThemedText>
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
                                ))}
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
        marginBottom: 8,
    },
    sidebarTitle: {
        fontSize: 16,
        fontWeight: 'bold',
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
    },
    headerSection: {
        backgroundColor: "rgba(255, 254, 234, 0.95)",
        borderRadius: 12,
        padding: 20,
        borderWidth: 1,
        borderColor: '#D4A574',
        marginBottom: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    mainTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#874E3B',
        fontFamily: 'LobsterTwoRegular',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
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
        minWidth: 200,
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
        backgroundColor: "rgba(255, 254, 234, 0.95)",
        borderRadius: 12,
        borderWidth: 1,
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
    optionsHeader: {
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
        backgroundColor: '#F9F5F0',
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
    optionsCell: {
        flex: 1,
        textAlign: 'center',
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
    },
    itemsPerPage: {
        flexDirection: 'row',
        alignItems: 'center',
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
});