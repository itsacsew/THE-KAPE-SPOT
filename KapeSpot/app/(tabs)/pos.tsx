// app/(tabs)/pos.tsx
import { useState } from 'react';
import { StyleSheet, ScrollView, TextInput, TouchableOpacity, ImageBackground, Alert } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather } from "@expo/vector-icons";
import Navbar from '@/components/Navbar';

interface MenuItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
    category: string;
}

export default function PosScreen() {
    const [searchQuery, setSearchQuery] = useState('');
    const [cart, setCart] = useState<MenuItem[]>([]);

    const menuItems: MenuItem[] = [
        { id: '1', name: 'Veg Cheese Burger', price: 6.50, quantity: 0, category: 'FastFood' },
        { id: '2', name: 'White Source Pasta', price: 10.00, quantity: 0, category: 'Pasta' },
        { id: '3', name: 'Farm Ville Pizza', price: 12.00, quantity: 0, category: 'Pizza' },
        { id: '4', name: 'Cheese Burst Sandwich', price: 8.00, quantity: 0, category: 'Sandwich' },
        { id: '5', name: 'Chicken Sandwich', price: 7.50, quantity: 0, category: 'Sandwich' },
        { id: '6', name: 'Margherita Pizza', price: 11.00, quantity: 0, category: 'Pizza' },
        { id: '7', name: 'Beef Burger', price: 8.50, quantity: 0, category: 'FastFood' },
        { id: '8', name: 'Carbonara Pasta', price: 9.50, quantity: 0, category: 'Pasta' },
    ];

    const filteredItems = menuItems.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal;

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

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(item => item.id !== id));
    };

    const updateQuantity = (id: string, newQuantity: number) => {
        if (newQuantity === 0) {
            removeFromCart(id);
            return;
        }
        setCart(prev => prev.map(item =>
            item.id === id ? { ...item, quantity: newQuantity } : item
        ));
    };

    const clearCart = () => {
        setCart([]);
    };

    const placeOrder = () => {
        if (cart.length === 0) {
            Alert.alert('Empty Cart', 'Please add items to cart first!');
            return;
        }
        Alert.alert('Order Placed', 'Your order has been placed successfully!');
        clearCart();
    };

    return (
        <ThemedView style={styles.container}>
            {/* Navbar Component */}
            <Navbar activeNav="pos" />

            {/* Main Content */}
            <ImageBackground
                source={require('@/assets/images/kape1.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <ThemedView style={styles.content}>
                    {/* Left Side - Order Summary */}
                    <ThemedView style={styles.orderSection}>
                        <ThemedText style={styles.sectionTitle}>Order Summary</ThemedText>

                        {/* Table Header */}
                        <ThemedView style={styles.tableHeader}>
                            <ThemedText style={[styles.headerText, styles.itemHeader]}>Item</ThemedText>
                            <ThemedText style={[styles.headerText, styles.priceHeader]}>Price</ThemedText>
                            <ThemedText style={[styles.headerText, styles.qtyHeader]}>Qnt.</ThemedText>
                            <ThemedText style={[styles.headerText, styles.totalHeader]}>Total ($)</ThemedText>
                        </ThemedView>

                        {/* Order Items */}
                        <ScrollView style={styles.orderList}>
                            {cart.length === 0 ? (
                                <ThemedView style={styles.emptyCart}>
                                    <Feather name="shopping-cart" size={48} color="#D4A574" />
                                    <ThemedText style={styles.emptyCartText}>No items in cart</ThemedText>
                                    <ThemedText style={styles.emptyCartSubText}>Tap on menu items to add them</ThemedText>
                                </ThemedView>
                            ) : (
                                cart.map((item) => (
                                    <ThemedView key={item.id} style={styles.orderRow}>
                                        <ThemedText style={[styles.cellText, styles.itemCell]}>{item.name}</ThemedText>
                                        <ThemedText style={[styles.cellText, styles.priceCell]}>${item.price.toFixed(2)}</ThemedText>
                                        <ThemedView style={styles.qtyCell}>
                                            <TouchableOpacity
                                                style={styles.qtyButton}
                                                onPress={() => updateQuantity(item.id, item.quantity - 1)}
                                            >
                                                <Feather name="minus" size={14} color="#874E3B" />
                                            </TouchableOpacity>
                                            <ThemedText style={styles.qtyText}>{item.quantity}</ThemedText>
                                            <TouchableOpacity
                                                style={styles.qtyButton}
                                                onPress={() => updateQuantity(item.id, item.quantity + 1)}
                                            >
                                                <Feather name="plus" size={14} color="#874E3B" />
                                            </TouchableOpacity>
                                        </ThemedView>
                                        <ThemedText style={[styles.cellText, styles.totalCell]}>
                                            ${(item.price * item.quantity).toFixed(2)}
                                        </ThemedText>
                                    </ThemedView>
                                ))
                            )}
                        </ScrollView>

                        {/* Totals Section */}
                        <ThemedView style={styles.totalsSection}>
                            <ThemedView style={styles.totalRow}>
                                <ThemedText style={styles.totalLabel}>Sub total</ThemedText>
                                <ThemedText style={styles.totalValue}>${subtotal.toFixed(2)}</ThemedText>
                            </ThemedView>
                            <ThemedView style={styles.totalRow}>
                                <ThemedText style={styles.totalLabel}>Other Charge</ThemedText>
                                <ThemedText style={styles.totalValue}>$0.00</ThemedText>
                            </ThemedView>
                            <ThemedView style={[styles.totalRow, styles.grandTotal]}>
                                <ThemedText style={styles.grandTotalLabel}>Amount to Pay</ThemedText>
                                <ThemedText style={styles.grandTotalValue}>${total.toFixed(2)}</ThemedText>
                            </ThemedView>
                        </ThemedView>

                        {/* Action Buttons */}
                        <ThemedView style={styles.actionButtons}>
                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={clearCart}
                            >
                                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.placeOrderButton}
                                onPress={placeOrder}
                            >
                                <ThemedText style={styles.placeOrderButtonText}>Place Order</ThemedText>
                            </TouchableOpacity>
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
                            <ThemedView style={styles.menuGrid}>
                                {filteredItems.map((item) => (
                                    <TouchableOpacity
                                        key={item.id}
                                        style={styles.menuCard}
                                        onPress={() => addToCart(item)}
                                    >
                                        <ThemedView style={styles.cardContent}>
                                            <ThemedView style={styles.cardText}>
                                                <ThemedText style={styles.itemName} numberOfLines={2}>
                                                    {item.name}
                                                </ThemedText>
                                                <ThemedText style={styles.itemPrice}>
                                                    ${item.price.toFixed(2)}
                                                </ThemedText>
                                            </ThemedView>
                                            <TouchableOpacity
                                                style={styles.deleteButton}
                                                onPress={(e) => {
                                                    e.stopPropagation();
                                                    console.log('Delete', item.id);
                                                }}
                                            >
                                                <Feather name="trash-2" size={18} color="#874E3B" />
                                            </TouchableOpacity>
                                        </ThemedView>
                                    </TouchableOpacity>
                                ))}
                            </ThemedView>
                        </ScrollView>
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
        gap: 16,
        backgroundColor: 'transparent',
    },
    orderSection: {
        flex: 1,
        backgroundColor: "rgba(255, 254, 234, 0.95)",
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    menuSection: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#D4A574',
        borderRadius: 12,
        padding: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
    },
    menuHeader: {
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 16,
        textAlign: 'center',
        fontFamily: 'LobsterTwoRegular',
        color: '#874E3B',
    },

    // ORDER SECTION STYLES
    tableHeader: {
        flexDirection: 'row',
        borderBottomWidth: 2,
        borderBottomColor: '#874E3B',
        paddingBottom: 8,
        marginBottom: 8,
    },
    headerText: {
        fontWeight: 'bold',
        color: '#874E3B',
        fontSize: 14,
    },
    itemHeader: {
        flex: 3,
        textAlign: 'left',
    },
    priceHeader: {
        flex: 2,
        textAlign: 'center',
    },
    qtyHeader: {
        flex: 2,
        textAlign: 'center',
    },
    totalHeader: {
        flex: 2,
        textAlign: 'right',
    },
    orderList: {
        flex: 1,
        marginBottom: 16,
    },
    emptyCart: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyCartText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#874E3B',
        marginTop: 16,
        textAlign: 'center',
    },
    emptyCartSubText: {
        fontSize: 14,
        color: '#5A3921',
        marginTop: 8,
        textAlign: 'center',
    },
    orderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#E8D8C8',
    },
    cellText: {
        fontSize: 13,
        color: '#5A3921',
    },
    itemCell: {
        flex: 3,
        textAlign: 'left',
    },
    priceCell: {
        flex: 2,
        textAlign: 'center',
    },
    qtyCell: {
        flex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    qtyButton: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    qtyText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#874E3B',
        minWidth: 20,
        textAlign: 'center',
    },
    totalCell: {
        flex: 2,
        textAlign: 'right',
        fontWeight: 'bold',
    },
    totalsSection: {
        borderTopWidth: 2,
        borderTopColor: '#874E3B',
        paddingTop: 12,
        marginBottom: 16,
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    totalLabel: {
        fontSize: 14,
        color: '#5A3921',
    },
    totalValue: {
        fontSize: 14,
        color: '#5A3921',
        fontWeight: '500',
    },
    grandTotal: {
        borderTopWidth: 1,
        borderTopColor: '#D4A574',
        paddingTop: 8,
        marginTop: 4,
    },
    grandTotalLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    grandTotalValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    cancelButton: {
        flex: 1,
        backgroundColor: '#E8D8C8',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    cancelButtonText: {
        color: '#874E3B',
        fontSize: 16,
        fontWeight: 'bold',
    },
    placeOrderButton: {
        flex: 1,
        backgroundColor: '#874E3B',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    placeOrderButtonText: {
        color: '#FFFEEA',
        fontSize: 16,
        fontWeight: 'bold',
    },

    // MENU STYLES - SQUARE CARDS
    searchInput: {
        borderWidth: 1,
        borderColor: '#D4A574',
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
        backgroundColor: '#FFFFFF',
        marginBottom: 8,
    },
    menuList: {
        flex: 1,
    },
    menuGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        justifyContent: 'space-between',
    },
    menuCard: {
        width: '48%',
        aspectRatio: 1,
        backgroundColor: '#F9F5F0',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E8D8C8',
        padding: 12,
        justifyContent: 'space-between',
    },
    cardContent: {
        flex: 1,
        justifyContent: 'space-between',
    },
    cardText: {
        flex: 1,
    },
    itemName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#5A3921',
        fontFamily: 'LobsterTwoRegular',
        marginBottom: 8,
        lineHeight: 20,
    },
    itemPrice: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#874E3B',
        fontFamily: 'LobsterTwoRegular',
    },
    deleteButton: {
        alignSelf: 'flex-end',
        padding: 8,
        borderRadius: 6,
        backgroundColor: '#F5E6D3',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
});