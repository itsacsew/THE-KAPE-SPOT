import { useState } from 'react';
import { StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

interface MenuItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
}

export default function PosScreen() {
    const [searchQuery, setSearchQuery] = useState('');
    const [cart, setCart] = useState<MenuItem[]>([
        { id: '1', name: 'Farm Ville Pizza', price: 11.00, quantity: 2 },
        { id: '2', name: 'Cheese Burst Sandwich', price: 12.00, quantity: 3 },
        { id: '3', name: 'White Source Pasta', price: 12.00, quantity: 3 },
        { id: '4', name: 'Veg Cheese Burger', price: 12.00, quantity: 2 },
    ]);

    const menuItems: MenuItem[] = [
        { id: '1', name: 'Veg Cheese Burger', price: 12.00, quantity: 0 },
        { id: '2', name: 'White Source Pasta', price: 12.00, quantity: 0 },
        { id: '3', name: 'Farm Ville Pizza', price: 11.00, quantity: 0 },
        { id: '4', name: 'Cheese Burst Sandwich', price: 12.00, quantity: 0 },
    ];

    const filteredItems = menuItems.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * 0.1;
    const total = subtotal + tax;

    const addToCart = (item: MenuItem) => {
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

    return (
        <ThemedView style={styles.container}>
            {/* Navbar */}
            <ThemedView style={styles.navbar}>
                <ThemedText style={styles.navbarTitle}>SUZLON RESTRO</ThemedText>

                <TouchableOpacity style={[styles.navLink, styles.activeNavLink]}>
                    <ThemedText style={[styles.navLinkText, styles.activeNavLinkText]}>POS</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navLink}>
                    <ThemedText style={styles.navLinkText}>Items</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navLink}>
                    <ThemedText style={styles.navLinkText}>People</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navLink}>
                    <ThemedText style={styles.navLinkText}>Sales & Expense</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navLink}>
                    <ThemedText style={styles.navLinkText}>Settings</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.navLink}>
                    <ThemedText style={styles.navLinkText}>Order Status</ThemedText>
                </TouchableOpacity>

            </ThemedView>

            {/* Main Content */}
            <ThemedView style={styles.content}>
                {/* Left Side - Order Summary */}
                <ThemedView style={styles.orderSection}>
                    <ThemedText style={styles.sectionTitle}>Order Summary</ThemedText>

                    <ThemedView style={styles.orderHeader}>
                        <ThemedText style={styles.orderHeaderText}>Item</ThemedText>
                        <ThemedText style={styles.orderHeaderText}>Qty</ThemedText>
                        <ThemedText style={styles.orderHeaderText}>Price</ThemedText>
                    </ThemedView>

                    <ScrollView style={styles.orderList}>
                        {cart.map((item) => (
                            <ThemedView key={item.id} style={styles.orderRow}>
                                <ThemedText style={styles.itemName}>{item.name}</ThemedText>
                                <ThemedText style={styles.itemQty}>{item.quantity}</ThemedText>
                                <ThemedText style={styles.itemPrice}>${item.price.toFixed(2)}</ThemedText>
                            </ThemedView>
                        ))}
                    </ScrollView>

                    <ThemedView style={styles.totals}>
                        <ThemedView style={styles.totalRow}>
                            <ThemedText>Sub total</ThemedText>
                            <ThemedText>${subtotal.toFixed(2)}</ThemedText>
                        </ThemedView>
                        <ThemedView style={styles.totalRow}>
                            <ThemedText>Tax</ThemedText>
                            <ThemedText>${tax.toFixed(2)}</ThemedText>
                        </ThemedView>
                        <ThemedView style={styles.totalRow}>
                            <ThemedText>Other Charge</ThemedText>
                            <ThemedText>$0.00</ThemedText>
                        </ThemedView>
                        <ThemedView style={[styles.totalRow, styles.amountToPay]}>
                            <ThemedText style={styles.amountText}>Amount to Pay</ThemedText>
                            <ThemedText style={styles.amountText}>${total.toFixed(2)}</ThemedText>
                        </ThemedView>
                    </ThemedView>
                </ThemedView>

                {/* Right Side - Menu Items */}
                <ThemedView style={styles.menuSection}>
                    <ThemedView style={styles.menuHeader}>
                        <ThemedText style={styles.sectionTitle}>Menu</ThemedText>
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search Items"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </ThemedView>

                    <ScrollView style={styles.menuList}>
                        {filteredItems.map((item) => (
                            <TouchableOpacity key={item.id} style={styles.menuItem} onPress={() => addToCart(item)}>
                                <ThemedText style={styles.menuItemName}>{item.name}</ThemedText>
                                <ThemedText style={styles.menuItemPrice}>${item.price.toFixed(2)}</ThemedText>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </ThemedView>
            </ThemedView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    navbar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#1a1a1a',
        borderBottomWidth: 2,
        borderBottomColor: '#333',
    },
    navbarTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
    },
    navbarLinks: {
        flexDirection: 'row',
        gap: 15,
    },
    navLink: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
    },
    activeNavLink: {
        backgroundColor: '#007AFF',
    },
    navLinkText: {
        color: 'blue',
        fontSize: 12,
        fontWeight: '500',
    },
    activeNavLinkText: {
        fontWeight: 'bold',
    },
    content: {
        flex: 1,
        flexDirection: 'row',
        padding: 16,
        gap: 16,
    },
    orderSection: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 12,
    },
    menuSection: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 12,
    },
    menuHeader: {
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 12,
        textAlign: 'center',
    },
    orderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#ccc',
        marginBottom: 8,
    },
    orderHeaderText: {
        fontWeight: 'bold',
        flex: 1,
        textAlign: 'center',
    },
    orderList: {
        flex: 1,
        marginBottom: 12,
    },
    orderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    itemName: {
        flex: 2,
        fontSize: 12,
    },
    itemQty: {
        flex: 1,
        textAlign: 'center',
        fontSize: 12,
    },
    itemPrice: {
        flex: 1,
        textAlign: 'right',
        fontSize: 12,
    },
    totals: {
        borderTopWidth: 1,
        borderTopColor: '#ccc',
        paddingTop: 8,
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    amountToPay: {
        borderTopWidth: 1,
        borderTopColor: '#ccc',
        paddingTop: 4,
        marginTop: 4,
    },
    amountText: {
        fontWeight: 'bold',
    },
    searchInput: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 4,
        padding: 8,
        fontSize: 14,
    },
    menuList: {
        flex: 1,
    },
    menuItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        backgroundColor: '#f9f9f9',
        marginBottom: 4,
        borderRadius: 4,
    },
    menuItemName: {
        fontSize: 14,
        fontWeight: '500',
    },
    menuItemPrice: {
        fontSize: 14,
        fontWeight: 'bold',
    },
});