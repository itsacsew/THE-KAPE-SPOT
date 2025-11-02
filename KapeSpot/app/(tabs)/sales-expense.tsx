// app/(tabs)/sales-expense.tsx
import { useState, useEffect } from 'react';
import {
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ImageBackground,
    Dimensions,
    View,
    Modal,
    TextInput,
    Alert,
    KeyboardAvoidingView,
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
import { Svg, Line, Rect, Text as SvgText, G } from 'react-native-svg';
import {
    getFirestore,
    collection,
    getDocs,
    query,
    where,
    orderBy,
    addDoc,
    serverTimestamp,
    deleteDoc,
    doc
} from 'firebase/firestore';
import { app } from '@/lib/firebase-config';
import * as FileSystem from 'expo-file-system';

interface OrderData {
    orderId: string;
    customerName: string;
    items: any[];
    subtotal: number;
    total: number;
    timestamp: string;
    status: 'unpaid' | 'paid' | 'cancelled';
    firebaseId?: string;
}

interface SalesData {
    date: string;
    sales: number;
    orders: number;
    customers: string[];
}

interface ExpenseItem {
    id?: string;
    description: string;
    cost: number;
    timestamp: any;
    createdAt?: string;
}
interface ExpenseEntry {
    description: string;
    cost: number;
}

interface ExpenseDocument {
    id?: string;
    expenses: ExpenseEntry[];
    total: number;
    timestamp: any;
    createdAt?: string;
}

const { width } = Dimensions.get('window');
const CHART_WIDTH = (width - 100) / 2;
const CHART_HEIGHT = 180;

// Simple Bar Chart Component
const SimpleBarChart = ({ data, labels, color = '#874E3B', title }: { data: number[], labels: string[], color?: string, title: string }) => {
    const maxValue = Math.max(...data, 1);
    const barWidth = (CHART_WIDTH - 40) / data.length;

    return (
        <View style={styles.chartWrapper}>
            <ThemedText style={styles.chartMiniTitle}>{title}</ThemedText>
            <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                <SvgText x="10" y="15" fontSize="8" fill="#5A3921">₱{maxValue}</SvgText>
                <SvgText x="10" y={CHART_HEIGHT / 2} fontSize="8" fill="#5A3921">₱{Math.round(maxValue / 2)}</SvgText>
                <SvgText x="10" y={CHART_HEIGHT - 5} fontSize="8" fill="#5A3921">₱0</SvgText>

                <Line
                    x1="30"
                    y1="0"
                    x2="30"
                    y2={CHART_HEIGHT}
                    stroke="#E8D8C8"
                    strokeWidth="1"
                />

                {data.map((value, index) => {
                    const barHeight = (value / maxValue) * (CHART_HEIGHT - 40);
                    const x = 40 + (index * barWidth);
                    const y = CHART_HEIGHT - 20 - barHeight;

                    return (
                        <G key={index}>
                            <Rect
                                x={x}
                                y={y}
                                width={barWidth - 6}
                                height={barHeight}
                                fill={color}
                                rx={3}
                            />
                            <SvgText
                                x={x + (barWidth - 6) / 2}
                                y={y - 5}
                                fontSize="8"
                                fill="#5A3921"
                                textAnchor="middle"
                            >
                                {value}
                            </SvgText>
                            <SvgText
                                x={x + (barWidth - 6) / 2}
                                y={CHART_HEIGHT - 5}
                                fontSize="8"
                                fill="#5A3921"
                                textAnchor="middle"
                            >
                                {labels[index]}
                            </SvgText>
                        </G>
                    );
                })}
            </Svg>
        </View>
    );
};

// Add these missing SVG components
const Polyline = ({ points, ...props }: any) => (
    <SvgText as="polyline" points={points} {...props} />
);

const Circle = (props: any) => (
    <SvgText as="circle" {...props} />
);

// Recent Sales List Component
const RecentSalesList = ({ orders }: { orders: OrderData[] }) => {
    return (
        <ScrollView
            style={styles.activityList}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
        >
            {orders.slice(0, 10).map((order, index) => (
                <ThemedView key={order.orderId} style={styles.activityItem}>
                    <ThemedView style={styles.activityIcon}>
                        <Feather name="shopping-bag" size={16} color="#874E3B" />
                    </ThemedView>
                    <ThemedView style={styles.activityDetails}>
                        <ThemedText style={styles.activityCustomer}>
                            {order.customerName}
                        </ThemedText>
                        <ThemedText style={styles.activityTime}>
                            {new Date(order.timestamp).toLocaleDateString()} •
                            {new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </ThemedText>
                    </ThemedView>
                    <ThemedText style={styles.activityAmount}>
                        ₱{order.total.toFixed(2)}
                    </ThemedText>
                </ThemedView>
            ))}
            {orders.length === 0 && (
                <ThemedView style={styles.noDataContainer}>
                    <ThemedText style={styles.noDataText}>No recent sales</ThemedText>
                </ThemedView>
            )}
        </ScrollView>
    );
};

export default function SalesExpenseScreen() {
    const [orders, setOrders] = useState<OrderData[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOnlineMode, setIsOnlineMode] = useState<boolean>(false);
    const [timeFilter, setTimeFilter] = useState<'day' | 'week' | 'month' | 'year'>('week');
    const [salesData, setSalesData] = useState<SalesData[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [savingExpense, setSavingExpense] = useState(false);
    const [expenseRows, setExpenseRows] = useState([{ description: '', cost: '' }]);
    const [expensesModalVisible, setExpensesModalVisible] = useState(false);
    const [allExpenses, setAllExpenses] = useState<ExpenseDocument[]>([]);
    const [loadingExpenses, setLoadingExpenses] = useState(false);

    // Initialize Firebase
    const db = getFirestore(app);

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
    const loadAllExpenses = async () => {
        setLoadingExpenses(true);
        try {
            const connectionMode = await getConnectionMode();

            if (connectionMode === 'offline') {
                // Load from local storage for expenses
                const syncService = OfflineSyncService.getInstance();
                // You might need to implement getPendingExpenses() in your OfflineSyncService
                // For now, we'll show empty for offline mode
                setAllExpenses([]);
            } else {
                // Load from Firebase Firestore
                const expensesCollection = collection(db, 'expenses');
                const expensesQuery = query(
                    expensesCollection,
                    orderBy('timestamp', 'desc')
                );

                const expensesSnapshot = await getDocs(expensesQuery);

                const expensesData: ExpenseDocument[] = expensesSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        expenses: data.expenses || [],
                        total: data.total || 0,
                        timestamp: data.timestamp,
                        createdAt: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString()
                    };
                });

                setAllExpenses(expensesData);
            }
        } catch (error) {
            console.error('❌ Error loading expenses:', error);
            Alert.alert('Error', 'Failed to load expenses');
            setAllExpenses([]);
        } finally {
            setLoadingExpenses(false);
        }
    };

    // Function to open expenses view modal
    const openExpensesModal = async () => {
        await loadAllExpenses();
        setExpensesModalVisible(true);
    };

    // Function to close expenses view modal
    const closeExpensesModal = () => {
        setExpensesModalVisible(false);
    };

    // Calculate total of all expenses
    const getAllExpensesTotal = () => {
        return allExpenses.reduce((total, doc) => total + doc.total, 0);
    };

    const loadOrders = async () => {
        setLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            let allOrders: OrderData[] = [];

            if (connectionMode === 'offline') {
                // Load from local storage only - ONLY PAID ORDERS
                console.log('📱 Loading sales data from local storage...');
                const localOrders = await syncService.getPendingReceipts();
                allOrders = localOrders.filter(order => order.status === 'paid');
                console.log('📱 Local sales data loaded:', allOrders.length);
            } else {
                // Load from Firebase Firestore - ONLY PAID ORDERS
                try {
                    console.log('🔥 Loading sales data from Firebase...');

                    // Query orders collection where status is 'paid'
                    const ordersCollection = collection(db, 'orders');
                    const ordersQuery = query(
                        ordersCollection,
                        where('status', '==', 'paid'),
                        orderBy('timestamp', 'desc')
                    );

                    const ordersSnapshot = await getDocs(ordersQuery);

                    const firebaseOrders: OrderData[] = ordersSnapshot.docs.map(doc => {
                        const data = doc.data();
                        return {
                            orderId: data.orderId || doc.id,
                            customerName: data.customerName || 'Unknown Customer',
                            items: data.items || [],
                            subtotal: Number(data.subtotal) || 0,
                            total: Number(data.total) || 0,
                            timestamp: data.timestamp || data.created_at || new Date().toISOString(),
                            status: data.status || 'paid',
                            firebaseId: doc.id
                        };
                    });

                    allOrders = firebaseOrders;
                    console.log('🔥 Firebase sales data loaded:', allOrders.length, 'paid orders');

                } catch (firebaseError) {
                    console.log('⚠️ Failed to load from Firebase, falling back to local storage:', firebaseError);

                    // Fallback to local storage - ONLY PAID ORDERS
                    const localOrders = await syncService.getPendingReceipts();
                    allOrders = localOrders.filter(order => order.status === 'paid');
                    console.log('📱 Fallback to local sales data:', allOrders.length);
                }
            }

            allOrders.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setOrders(allOrders);
            processSalesData(allOrders);
            console.log('✅ Final loaded sales data:', allOrders.length);

        } catch (error) {
            console.error('❌ Error loading sales data:', error);
            // Final fallback - try to get from local storage and filter only paid orders
            const syncService = OfflineSyncService.getInstance();
            const localOrders = await syncService.getPendingReceipts();
            const filteredOrders = localOrders.filter(order => order.status === 'paid');
            filteredOrders.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setOrders(filteredOrders);
            processSalesData(filteredOrders);
            console.log('📱 Emergency fallback to local sales data:', filteredOrders.length);
        } finally {
            setLoading(false);
        }
    };

    const processSalesData = (ordersData: OrderData[]) => {
        const now = new Date();
        let filteredOrders: OrderData[] = [];

        switch (timeFilter) {
            case 'day':
                filteredOrders = ordersData.filter(order => {
                    const orderDate = new Date(order.timestamp);
                    return orderDate.toDateString() === now.toDateString();
                });
                break;
            case 'week':
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                filteredOrders = ordersData.filter(order => new Date(order.timestamp) >= weekAgo);
                break;
            case 'month':
                const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                filteredOrders = ordersData.filter(order => new Date(order.timestamp) >= monthAgo);
                break;
            case 'year':
                const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
                filteredOrders = ordersData.filter(order => new Date(order.timestamp) >= yearAgo);
                break;
        }

        const groupedData: { [key: string]: SalesData } = {};

        filteredOrders.forEach(order => {
            const date = new Date(order.timestamp);
            let dateKey = '';

            switch (timeFilter) {
                case 'day':
                    dateKey = date.toLocaleTimeString('en-US', { hour: '2-digit', hour12: true });
                    break;
                case 'week':
                    dateKey = date.toLocaleDateString('en-US', { weekday: 'short' });
                    break;
                case 'month':
                    dateKey = `Week ${Math.ceil(date.getDate() / 7)}`;
                    break;
                case 'year':
                    dateKey = date.toLocaleDateString('en-US', { month: 'short' });
                    break;
            }

            if (!groupedData[dateKey]) {
                groupedData[dateKey] = {
                    date: dateKey,
                    sales: 0,
                    orders: 0,
                    customers: []
                };
            }

            groupedData[dateKey].sales += order.total;
            groupedData[dateKey].orders += 1;
            if (!groupedData[dateKey].customers.includes(order.customerName)) {
                groupedData[dateKey].customers.push(order.customerName);
            }
        });

        const sortedData = Object.values(groupedData).sort((a, b) => {
            switch (timeFilter) {
                case 'day':
                    return new Date('1970/01/01 ' + a.date).getTime() - new Date('1970/01/01 ' + b.date).getTime();
                case 'week':
                    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                    return days.indexOf(a.date) - days.indexOf(b.date);
                case 'month':
                    return parseInt(a.date.split(' ')[1]) - parseInt(b.date.split(' ')[1]);
                case 'year':
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    return months.indexOf(a.date) - months.indexOf(b.date);
                default:
                    return 0;
            }
        });

        setSalesData(sortedData);
    };

    const addNewRow = () => {
        setExpenseRows([...expenseRows, { description: '', cost: '' }]);
    };

    const removeRow = (index: number) => {
        if (expenseRows.length > 1) {
            const newRows = expenseRows.filter((_, i) => i !== index);
            setExpenseRows(newRows);
        }
    };

    const updateRow = (index: number, field: 'description' | 'cost', value: string) => {
        const newRows = [...expenseRows];
        newRows[index][field] = value;
        setExpenseRows(newRows);
    };

    const saveExpensesToFirebase = async () => {
        // Validate all rows
        const validRows = expenseRows.filter(row =>
            row.description.trim() && row.cost.trim() && !isNaN(parseFloat(row.cost)) && parseFloat(row.cost) > 0
        );

        if (validRows.length === 0) {
            Alert.alert('Error', 'Please enter at least one valid expense with description and cost');
            return;
        }

        if (!isOnlineMode) {
            Alert.alert('Offline Mode', 'Cannot save expenses while offline. Please connect to internet.');
            return;
        }

        setSavingExpense(true);
        try {
            // Convert to ExpenseEntry format
            const expenseEntries: ExpenseEntry[] = validRows.map(row => ({
                description: row.description.trim(),
                cost: parseFloat(row.cost)
            }));

            // Calculate total
            const total = expenseEntries.reduce((sum, entry) => sum + entry.cost, 0);

            // Create single document with all expenses
            const expenseDocument: ExpenseDocument = {
                expenses: expenseEntries,
                total: total,
                timestamp: serverTimestamp()
            };

            // Save to Firebase Firestore collection named "expenses"
            const expensesCollection = collection(db, 'expenses');
            await addDoc(expensesCollection, expenseDocument);

            Alert.alert('Success', `Expense document saved successfully!\nTotal: ₱${total.toFixed(2)}`);
            setExpenseRows([{ description: '', cost: '' }]);
            setModalVisible(false);

        } catch (error) {
            console.error('❌ Error saving expenses:', error);
            Alert.alert('Error', 'Failed to save expenses. Please try again.');
        } finally {
            setSavingExpense(false);
        }
    };

    const openExpenseModal = () => {
        setExpenseRows([{ description: '', cost: '' }]);
        setModalVisible(true);
    };

    const closeExpenseModal = () => {
        setExpenseRows([{ description: '', cost: '' }]);
        setModalVisible(false);
    };

    const getTotalExpenses = () => {
        return expenseRows.reduce((total, row) => {
            const cost = parseFloat(row.cost);
            return total + (isNaN(cost) ? 0 : cost);
        }, 0);
    };

    useFocusEffect(
        React.useCallback(() => {
            loadOrders();
        }, [timeFilter])
    );

    const getTotalSales = () => {
        return salesData.reduce((total, item) => total + item.sales, 0);
    };

    const getTotalOrders = () => {
        return salesData.reduce((total, item) => total + item.orders, 0);
    };

    const getTotalCustomers = () => {
        const allCustomers = new Set();
        salesData.forEach(item => {
            item.customers.forEach(customer => allCustomers.add(customer));
        });
        return allCustomers.size;
    };

    const getAverageOrderValue = () => {
        const totalOrders = getTotalOrders();
        return totalOrders > 0 ? getTotalSales() / totalOrders : 0;
    };
    // Function to export expenses to txt file
    const exportExpensesToTxt = async () => {
        try {
            if (allExpenses.length === 0) {
                Alert.alert('No Data', 'There are no expenses to export.');
                return;
            }

            // Create the content for the txt file
            let content = 'EXPENSES REPORT\n';
            content += 'Generated on: ' + new Date().toLocaleString() + '\n';
            content += '='.repeat(50) + '\n\n';

            allExpenses.forEach((expenseDoc, docIndex) => {
                content += `BATCH ${docIndex + 1}\n`;
                content += `Date: ${expenseDoc.createdAt ?
                    new Date(expenseDoc.createdAt).toLocaleDateString() + ' ' +
                    new Date(expenseDoc.createdAt).toLocaleTimeString([], {
                        hour: '2-digit', minute: '2-digit'
                    }) : 'Unknown Date'}\n`;
                content += '-'.repeat(30) + '\n';

                expenseDoc.expenses.forEach((expense, expenseIndex) => {
                    content += `${expenseIndex + 1}. ${expense.description}: ₱${expense.cost.toFixed(2)}\n`;
                });

                content += `Batch Total: ₱${expenseDoc.total.toFixed(2)}\n\n`;
            });

            content += '='.repeat(50) + '\n';
            content += `GRAND TOTAL: ₱${getAllExpensesTotal().toFixed(2)}\n`;
            content += `Total Batches: ${allExpenses.length}\n`;
            content += `Total Items: ${allExpenses.reduce((total, doc) => total + doc.expenses.length, 0)}`;

            // Create file name with timestamp
            const timestamp = new Date().toISOString().split('T')[0];
            const fileName = `expenses_report_${timestamp}.txt`;

            // For now, just show the content in alert since file system has issues
            // You can copy this to clipboard or show in a larger modal
            Alert.alert(
                'Expenses Report',
                `File: ${fileName}\n\n${content}`,
                [
                    {
                        text: 'Copy to Clipboard',
                        onPress: () => {
                            // You can implement clipboard functionality here if needed
                            Alert.alert('Copied', 'Report content copied to clipboard!');
                        }
                    },
                    { text: 'OK', style: 'default' }
                ]
            );

            console.log('Expenses Report Content:', content); // For debugging

        } catch (error) {
            console.error('❌ Error exporting expenses:', error);
            Alert.alert('Export Failed', 'Failed to export expenses report.');
        }
    };
    // Function to delete a single expense batch
    const deleteExpenseBatch = async (expenseId: string) => {
        try {
            if (!isOnlineMode) {
                Alert.alert('Offline Mode', 'Cannot delete expenses while offline. Please connect to internet.');
                return;
            }

            Alert.alert(
                'Delete Expense Batch',
                'Are you sure you want to delete this expense batch?',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                            try {
                                await deleteDoc(doc(db, 'expenses', expenseId));
                                Alert.alert('Success', 'Expense batch deleted successfully!');
                                loadAllExpenses(); // Reload the list
                            } catch (error) {
                                console.error('❌ Error deleting expense batch:', error);
                                Alert.alert('Error', 'Failed to delete expense batch.');
                            }
                        }
                    }
                ]
            );
        } catch (error) {
            console.error('❌ Error deleting expense batch:', error);
            Alert.alert('Error', 'Failed to delete expense batch.');
        }
    };

    // Function to delete all expenses
    const deleteAllExpenses = async () => {
        try {
            if (!isOnlineMode) {
                Alert.alert('Offline Mode', 'Cannot delete expenses while offline. Please connect to internet.');
                return;
            }

            if (allExpenses.length === 0) {
                Alert.alert('No Data', 'There are no expenses to delete.');
                return;
            }

            Alert.alert(
                'Delete All Expenses',
                `Are you sure you want to delete ALL ${allExpenses.length} expense batches? This action cannot be undone.`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete All',
                        style: 'destructive',
                        onPress: async () => {
                            try {
                                setLoadingExpenses(true);
                                // Delete all expenses one by one
                                const deletePromises = allExpenses.map(expense =>
                                    deleteDoc(doc(db, 'expenses', expense.id!))
                                );

                                await Promise.all(deletePromises);
                                Alert.alert('Success', 'All expenses deleted successfully!');
                                setAllExpenses([]); // Clear the list
                            } catch (error) {
                                console.error('❌ Error deleting all expenses:', error);
                                Alert.alert('Error', 'Failed to delete all expenses.');
                            } finally {
                                setLoadingExpenses(false);
                            }
                        }
                    }
                ]
            );
        } catch (error) {
            console.error('❌ Error deleting all expenses:', error);
            Alert.alert('Error', 'Failed to delete all expenses.');
        }
    };

    return (
        <ThemedView style={styles.container}>
            <Navbar activeNav="sales-expense" />

            <ImageBackground
                source={require('@/assets/images/kape1.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                {/* Main Scroll Container */}
                <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
                    <ThemedView style={styles.content}>
                        {/* Header Container */}
                        <ThemedView style={styles.headerContainer}>
                            <ThemedView style={styles.headerSection}>
                                <ThemedView style={styles.headerTop}>
                                    <ThemedText style={styles.mainTitle}>Sales & Revenue</ThemedText>
                                    <ThemedView style={styles.headerButtons}>
                                        <TouchableOpacity
                                            style={styles.listButton}
                                            onPress={openExpenseModal}
                                        >
                                            <Feather name="dollar-sign" size={18} color="#874E3B" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.listButton}
                                            onPress={openExpensesModal}
                                        >
                                            <Feather name="list" size={18} color="#874E3B" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.reloadButton}
                                            onPress={loadOrders}
                                        >
                                            <Feather name="refresh-cw" size={18} color="#874E3B" />
                                        </TouchableOpacity>
                                    </ThemedView>
                                </ThemedView>

                                <ThemedText style={styles.modeInfo}>
                                    {isOnlineMode ? '🔥 Connected to Firebase - Showing online data' : '📱 Using local storage - Showing local data'}
                                </ThemedText>

                                {/* Time Filter Buttons */}
                                <ThemedView style={styles.filterContainer}>
                                    <TouchableOpacity
                                        style={[styles.filterButton, timeFilter === 'day' && styles.filterButtonActive]}
                                        onPress={() => setTimeFilter('day')}
                                    >
                                        <ThemedText style={[styles.filterButtonText, timeFilter === 'day' && styles.filterButtonTextActive]}>
                                            TODAY
                                        </ThemedText>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.filterButton, timeFilter === 'week' && styles.filterButtonActive]}
                                        onPress={() => setTimeFilter('week')}
                                    >
                                        <ThemedText style={[styles.filterButtonText, timeFilter === 'week' && styles.filterButtonTextActive]}>
                                            THIS WEEK
                                        </ThemedText>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.filterButton, timeFilter === 'month' && styles.filterButtonActive]}
                                        onPress={() => setTimeFilter('month')}
                                    >
                                        <ThemedText style={[styles.filterButtonText, timeFilter === 'month' && styles.filterButtonTextActive]}>
                                            THIS MONTH
                                        </ThemedText>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.filterButton, timeFilter === 'year' && styles.filterButtonActive]}
                                        onPress={() => setTimeFilter('year')}
                                    >
                                        <ThemedText style={[styles.filterButtonText, timeFilter === 'year' && styles.filterButtonTextActive]}>
                                            THIS YEAR
                                        </ThemedText>
                                    </TouchableOpacity>
                                </ThemedView>
                            </ThemedView>
                        </ThemedView>
                        {/* All Expenses View Modal */}
                        <Modal
                            animationType="slide"
                            transparent={true}
                            visible={expensesModalVisible}
                            onRequestClose={closeExpensesModal}
                        >
                            <KeyboardAvoidingView
                                style={styles.modalOverlay}
                                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                            >
                                <ScrollView
                                    contentContainerStyle={styles.modalScrollContainer}
                                    showsVerticalScrollIndicator={false}
                                >
                                    <ThemedView style={styles.modalContent}>
                                        <ThemedView style={styles.modalHeader}>
                                            <ThemedView style={styles.modalHeaderLeft}>
                                                <ThemedText style={styles.modalTitle}>All Expenses</ThemedText>
                                                <ThemedText style={styles.expensesCount}>
                                                    {allExpenses.length} batch{allExpenses.length !== 1 ? 'es' : ''}
                                                </ThemedText>
                                            </ThemedView>
                                            <ThemedView style={styles.modalHeaderRight}>
                                                <TouchableOpacity
                                                    style={styles.exportButton}
                                                    onPress={exportExpensesToTxt}
                                                    disabled={allExpenses.length === 0}
                                                >
                                                    <Feather name="download" size={20} color={allExpenses.length === 0 ? "#C4A484" : "#16A34A"} />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={styles.deleteAllButton}
                                                    onPress={deleteAllExpenses}
                                                    disabled={allExpenses.length === 0}
                                                >
                                                    <Feather name="trash-2" size={18} color={allExpenses.length === 0 ? "#C4A484" : "#DC2626"} />
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={closeExpensesModal} style={styles.closeButton}>
                                                    <Feather name="x" size={24} color="#874E3B" />
                                                </TouchableOpacity>
                                            </ThemedView>
                                        </ThemedView>
                                        {loadingExpenses ? (
                                            <ThemedView style={styles.loadingContainer}>
                                                <ThemedText>Loading expenses...</ThemedText>
                                            </ThemedView>
                                        ) : allExpenses.length === 0 ? (
                                            <ThemedView style={styles.noDataContainer}>
                                                <Feather name="file-text" size={32} color="#D4A574" />
                                                <ThemedText style={styles.noDataText}>No expenses recorded</ThemedText>
                                            </ThemedView>
                                        ) : (
                                            <>
                                                {/* Export Summary */}
                                                <ThemedView style={styles.exportSummary}>
                                                    <ThemedText style={styles.exportSummaryText}>
                                                        Total: ₱{getAllExpensesTotal().toFixed(2)} • {allExpenses.length} batches
                                                    </ThemedText>
                                                </ThemedView>

                                                {/* Expenses List */}
                                                <ScrollView
                                                    style={styles.expensesListContainer}
                                                    showsVerticalScrollIndicator={false}
                                                >
                                                    {allExpenses.map((expenseDoc, docIndex) => (
                                                        <ThemedView key={expenseDoc.id || docIndex} style={styles.expenseDocument}>
                                                            <ThemedView style={styles.expenseDocHeader}>
                                                                <ThemedText style={styles.expenseDocDate}>
                                                                    {expenseDoc.createdAt ?
                                                                        new Date(expenseDoc.createdAt).toLocaleDateString() + ' ' +
                                                                        new Date(expenseDoc.createdAt).toLocaleTimeString([], {
                                                                            hour: '2-digit', minute: '2-digit'
                                                                        })
                                                                        : 'Unknown Date'
                                                                    }
                                                                </ThemedText>
                                                                <ThemedText style={styles.expenseDocTotal}>
                                                                    ₱{expenseDoc.total.toFixed(2)}
                                                                </ThemedText>
                                                            </ThemedView>

                                                            {expenseDoc.expenses.map((expense, expenseIndex) => (
                                                                <ThemedView key={expenseIndex} style={styles.expenseItem}>
                                                                    <ThemedView style={styles.expenseDescription}>
                                                                        <ThemedText style={styles.expenseText}>
                                                                            {expense.description}
                                                                        </ThemedText>
                                                                    </ThemedView>
                                                                    <ThemedView style={styles.expenseCost}>
                                                                        <ThemedText style={styles.expenseText}>
                                                                            ₱{expense.cost.toFixed(2)}
                                                                        </ThemedText>
                                                                    </ThemedView>
                                                                </ThemedView>
                                                            ))}
                                                        </ThemedView>
                                                    ))}
                                                </ScrollView>
                                            </>
                                        )}

                                        <ThemedView style={styles.modalButtons}>
                                            <TouchableOpacity
                                                style={[styles.modalButton, styles.closeExpenseButton]}
                                                onPress={closeExpensesModal}
                                            >
                                                <ThemedText style={styles.closeExpenseButtonText}>Close</ThemedText>
                                            </TouchableOpacity>
                                        </ThemedView>
                                    </ThemedView>
                                </ScrollView>
                            </KeyboardAvoidingView>
                        </Modal>

                        {/* Summary Cards - 1x4 Single Row */}
                        <ThemedView style={styles.summaryRow}>
                            <ThemedView style={styles.summaryCard}>
                                <ThemedView style={styles.summaryIconContainer}>
                                    <Feather name="dollar-sign" size={20} color="#16A34A" />
                                </ThemedView>
                                <ThemedText style={styles.summaryValue}>₱{getTotalSales().toFixed(2)}</ThemedText>
                                <ThemedText style={styles.summaryLabel}>Total Sales</ThemedText>
                            </ThemedView>

                            <ThemedView style={styles.summaryCard}>
                                <ThemedView style={styles.summaryIconContainer}>
                                    <Feather name="shopping-bag" size={20} color="#874E3B" />
                                </ThemedView>
                                <ThemedText style={styles.summaryValue}>{getTotalOrders()}</ThemedText>
                                <ThemedText style={styles.summaryLabel}>Total Orders</ThemedText>
                            </ThemedView>

                            <ThemedView style={styles.summaryCard}>
                                <ThemedView style={styles.summaryIconContainer}>
                                    <Feather name="users" size={20} color="#D97706" />
                                </ThemedView>
                                <ThemedText style={styles.summaryValue}>{getTotalCustomers()}</ThemedText>
                                <ThemedText style={styles.summaryLabel}>Customers</ThemedText>
                            </ThemedView>

                            <ThemedView style={styles.summaryCard}>
                                <ThemedView style={styles.summaryIconContainer}>
                                    <Feather name="trending-up" size={20} color="#2563EB" />
                                </ThemedView>
                                <ThemedText style={styles.summaryValue}>₱{getAverageOrderValue().toFixed(2)}</ThemedText>
                                <ThemedText style={styles.summaryLabel}>Avg. Order Value</ThemedText>
                            </ThemedView>
                        </ThemedView>

                        {/* Charts Section - Side by Side */}
                        <ThemedView style={styles.chartsRow}>
                            {/* Sales Chart */}
                            <ThemedView style={styles.chartSection}>
                                <ThemedView style={styles.chartHeader}>
                                    <ThemedText style={styles.chartTitle}>Sales</ThemedText>
                                    <ThemedText style={styles.chartSubtitle}>
                                        {timeFilter === 'day' ? 'Today' :
                                            timeFilter === 'week' ? 'This Week' :
                                                timeFilter === 'month' ? 'This Month' : 'This Year'}
                                    </ThemedText>
                                </ThemedView>

                                {salesData.length > 0 ? (
                                    <SimpleBarChart
                                        data={salesData.map(item => item.sales)}
                                        labels={salesData.map(item => item.date)}
                                        color="#874E3B"
                                        title="Sales Trend"
                                    />
                                ) : (
                                    <ThemedView style={styles.noDataContainer}>
                                        <Feather name="bar-chart-2" size={32} color="#D4A574" />
                                        <ThemedText style={styles.noDataText}>No sales data</ThemedText>
                                    </ThemedView>
                                )}
                            </ThemedView>

                            {/* Orders Chart */}
                            <ThemedView style={styles.chartSection}>
                                <ThemedView style={styles.chartHeader}>
                                    <ThemedText style={styles.chartTitle}>Orders</ThemedText>
                                    <ThemedText style={styles.chartSubtitle}>Order Count</ThemedText>
                                </ThemedView>

                                {salesData.length > 0 ? (
                                    <SimpleBarChart
                                        data={salesData.map(item => item.orders)}
                                        labels={salesData.map(item => item.date)}
                                        color="#D4A574"
                                        title="Orders Trend"
                                    />
                                ) : (
                                    <ThemedView style={styles.noDataContainer}>
                                        <Feather name="bar-chart-2" size={32} color="#D4A574" />
                                        <ThemedText style={styles.noDataText}>No orders data</ThemedText>
                                    </ThemedView>
                                )}
                            </ThemedView>
                        </ThemedView>

                        {/* Recent Activity - With Scrollable Content */}
                        <ThemedView style={styles.recentActivitySection}>
                            <ThemedView style={styles.activityHeader}>
                                <ThemedText style={styles.sectionTitle}>Recent Sales</ThemedText>
                                <ThemedText style={styles.activitySubtitle}>Latest transactions</ThemedText>
                            </ThemedView>

                            {/* Scrollable Recent Sales List */}
                            <RecentSalesList orders={orders} />
                        </ThemedView>
                    </ThemedView>
                </ScrollView>
            </ImageBackground>

            {/* Expense Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={closeExpenseModal}
            >
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <ScrollView
                        contentContainerStyle={styles.modalScrollContainer}
                        showsVerticalScrollIndicator={false}
                    >
                        <ThemedView style={styles.modalContent}>
                            <ThemedView style={styles.modalHeader}>
                                <ThemedText style={styles.modalTitle}>Add Expenses</ThemedText>
                                <TouchableOpacity onPress={closeExpenseModal} style={styles.closeButton}>
                                    <Feather name="x" size={24} color="#874E3B" />
                                </TouchableOpacity>
                            </ThemedView>

                            {/* Table Header */}
                            <ThemedView style={styles.tableHeader}>
                                <ThemedView style={[styles.tableCell, styles.headerCell, { flex: 2 }]}>
                                    <ThemedText style={styles.headerText}>Expenses</ThemedText>
                                </ThemedView>
                                <ThemedView style={[styles.tableCell, styles.headerCell, { flex: 1 }]}>
                                    <ThemedText style={styles.headerText}>Cost</ThemedText>
                                </ThemedView>
                                <ThemedView style={[styles.tableCell, styles.headerCell, { flex: 0.5 }]}>
                                    <TouchableOpacity style={styles.addButton} onPress={addNewRow}>
                                        <Feather name="plus" size={20} color="#16A34A" />
                                    </TouchableOpacity>
                                </ThemedView>
                            </ThemedView>

                            {/* Expense Rows */}
                            <View style={styles.tableContainer}>
                                {expenseRows.map((row, index) => (
                                    <ThemedView key={index} style={styles.tableRow}>
                                        <ThemedView style={[styles.tableCell, { flex: 2 }]}>
                                            <TextInput
                                                style={styles.textInput}
                                                placeholder="Enter expense..."
                                                placeholderTextColor="#8B7355"
                                                value={row.description}
                                                onChangeText={(value) => updateRow(index, 'description', value)}
                                                returnKeyType="next"
                                            />
                                        </ThemedView>
                                        <ThemedView style={[styles.tableCell, { flex: 1 }]}>
                                            <TextInput
                                                style={styles.textInput}
                                                placeholder="0.00"
                                                placeholderTextColor="#8B7355"
                                                value={row.cost}
                                                onChangeText={(value) => updateRow(index, 'cost', value)}
                                                keyboardType="decimal-pad"
                                                returnKeyType="done"
                                            />
                                        </ThemedView>
                                        <ThemedView style={[styles.tableCell, { flex: 0.5 }]}>
                                            {expenseRows.length > 1 && (
                                                <TouchableOpacity
                                                    style={styles.removeButton}
                                                    onPress={() => removeRow(index)}
                                                >
                                                    <Feather name="trash-2" size={16} color="#DC2626" />
                                                </TouchableOpacity>
                                            )}
                                        </ThemedView>
                                    </ThemedView>
                                ))}
                            </View>

                            {/* Total Row */}
                            <ThemedView style={styles.totalRow}>
                                <ThemedView style={[styles.tableCell, { flex: 2 }]}>
                                    <ThemedText style={styles.totalLabel}>Total</ThemedText>
                                </ThemedView>
                                <ThemedView style={[styles.tableCell, { flex: 1 }]}>
                                    <ThemedText style={styles.totalValue}>
                                        ₱{getTotalExpenses().toFixed(2)}
                                    </ThemedText>
                                </ThemedView>
                                <ThemedView style={[styles.tableCell, { flex: 0.5 }]} />
                            </ThemedView>

                            <ThemedView style={styles.modalButtons}>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.cancelButton]}
                                    onPress={closeExpenseModal}
                                >
                                    <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.saveButton, savingExpense && styles.saveButtonDisabled]}
                                    onPress={saveExpensesToFirebase}
                                    disabled={savingExpense}
                                >
                                    <ThemedText style={styles.saveButtonText}>
                                        {savingExpense ? 'Saving...' : 'Save Expenses'}
                                    </ThemedText>
                                </TouchableOpacity>
                            </ThemedView>
                        </ThemedView>
                    </ScrollView>
                </KeyboardAvoidingView>
            </Modal>
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
    scrollContainer: {
        flex: 1,
    },
    content: {
        flex: 1,
        padding: 16,
        backgroundColor: 'transparent',
    },
    headerContainer: {
        marginBottom: 16,
    },
    headerSection: {
        backgroundColor: "#fffecaF2",
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    // Add these to your styles
    loadingContainer: {
        padding: 20,
        alignItems: 'center',
    },
    expensesListContainer: {
        maxHeight: 400,
        marginBottom: 16,
    },
    expenseDocument: {
        backgroundColor: '#F5E6D3',
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    expenseDocHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#D4A574',
    },
    expenseDocDate: {
        fontSize: 12,
        fontWeight: '600',
        color: '#5A3921',
    },
    expenseDocTotal: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    expenseItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4,
    },
    expenseDescription: {
        flex: 2,
    },
    expenseCost: {
        flex: 1,
        alignItems: 'flex-end',
    },
    expenseText: {
        fontSize: 12,
        color: '#5A3921',
    },
    grandTotalContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderTopWidth: 2,
        borderTopColor: '#874E3B',
        marginTop: 8,
    },
    grandTotalLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    grandTotalValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#16A34A',
    },
    closeExpenseButton: {
        backgroundColor: '#874E3B',
        borderWidth: 1,
        borderColor: '#874E3B',
    },
    closeExpenseButtonText: {
        color: '#FFFEEA',
        fontWeight: 'bold',
        fontSize: 16,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    headerButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    listButton: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    mainTitle: {
        fontSize: 28,
        color: '#874E3B',
        fontFamily: 'LobsterTwoItalic',
    },
    deleteAllButton: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: '#FEF2F2',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#DC2626',
    },
    modalHeaderLeft: {
        flex: 1,
    }, expensesCount: {
        fontSize: 12,
        color: '#8B7355',
        marginTop: 2,
    }, modalHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    }, exportButton: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: '#F0FDF4',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#16A34A',
    }, exportSummary: {
        backgroundColor: '#F5E6D3',
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    exportSummaryText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#874E3B',
        textAlign: 'center',
    },
    modeInfo: {
        fontSize: 12,
        color: '#874E3B',
        fontStyle: 'italic',
        marginBottom: 12,
    },
    filterContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    filterButton: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: '#F5E6D3',
        borderWidth: 1,
        borderColor: '#D4A574',
        alignItems: 'center',
    },
    filterButtonActive: {
        backgroundColor: '#874E3B',
        borderColor: '#874E3B',
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
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    // Summary Cards - 1x4 Single Row
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    summaryCard: {
        flex: 1,
        backgroundColor: "#FFFEEA",
        borderRadius: 12,
        padding: 12,
        marginHorizontal: 4,
        borderWidth: 1,
        borderColor: '#D4A574',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },
    summaryIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 6,
    },
    summaryValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
        marginBottom: 2,
    },
    summaryLabel: {
        fontSize: 10,
        color: '#5A3921',
        textAlign: 'center',
    },
    // Charts Section - Side by Side
    chartsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },

    chartSection: {
        flex: 1,
        backgroundColor: "#fffecaF2",
        borderRadius: 12,
        padding: 12,
        marginHorizontal: 6,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    chartHeader: {
        marginBottom: 12,
        alignItems: 'center',
    },
    chartTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
        marginBottom: 2,
        textAlign: 'center',
    },
    chartSubtitle: {
        fontSize: 10,
        color: '#5A3921',
        textAlign: 'center',
    },
    chartWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    chartMiniTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#874E3B',
        marginBottom: 8,
        textAlign: 'center',
    },
    noDataContainer: {
        height: 180,
        justifyContent: 'center',
        alignItems: 'center',
    },
    noDataText: {
        fontSize: 12,
        color: '#8B7355',
        marginTop: 8,
        textAlign: 'center',
    },
    // Recent Activity - Fixed height with scroll
    recentActivitySection: {
        backgroundColor: "#fffecaF2",
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#D4A574',
        height: 350, // Fixed height for the container
    },
    activityHeader: {
        marginBottom: 12,
        alignItems: 'center',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#874E3B',
        marginBottom: 4,
        textAlign: 'center',
    },
    activitySubtitle: {
        fontSize: 12,
        color: '#5A3921',
        textAlign: 'center',
    },
    activityList: {
        flex: 1, // Takes remaining space in the container
    },
    activityItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#E8D8C8',
    },
    activityIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    activityDetails: {
        flex: 1,
    },
    activityCustomer: {
        fontSize: 14,
        fontWeight: '600',
        color: '#5A3921',
        marginBottom: 2,
    },
    activityTime: {
        fontSize: 11,
        color: '#8B7355',
    },
    activityAmount: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalScrollContainer: {
        flexGrow: 1,
        justifyContent: 'flex-end',
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    modalContent: {
        backgroundColor: '#FFFEEA',
        borderRadius: 16,
        padding: 20,
        borderWidth: 2,
        borderColor: '#D4A574',
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    // Table Styles
    tableHeader: {
        flexDirection: 'row',
        borderBottomWidth: 2,
        borderBottomColor: '#874E3B',
        marginBottom: 8,
        paddingBottom: 8,
    },
    tableContainer: {
        maxHeight: 200,
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#E8D8C8',
        paddingVertical: 8,
        alignItems: 'center',
    },
    totalRow: {
        flexDirection: 'row',
        borderTopWidth: 2,
        borderTopColor: '#874E3B',
        paddingVertical: 12,
        marginTop: 8,
    },
    tableCell: {
        paddingHorizontal: 8,
        justifyContent: 'center',
    },
    headerCell: {
        paddingVertical: 8,
    },
    headerText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
        textAlign: 'center',
    },
    textInput: {
        borderWidth: 1,
        borderColor: '#D4A574',
        borderRadius: 4,
        padding: 8,
        fontSize: 14,
        color: '#5A3921',
        backgroundColor: '#FFFEEA',
        textAlign: 'center',
    },
    totalLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
        textAlign: 'center',
    },
    totalValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#16A34A',
        textAlign: 'center',
    },
    addButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F0FDF4',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#16A34A',
    },
    removeButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#FEF2F2',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#DC2626',
    },
    closeButton: {
        padding: 4,
    },

    modalButtons: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 20,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: {
        backgroundColor: '#F5E6D3',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    saveButton: {
        backgroundColor: '#874E3B',
        borderWidth: 1,
        borderColor: '#874E3B',
    },
    saveButtonDisabled: {
        backgroundColor: '#C4A484',
        borderColor: '#C4A484',
    },
    cancelButtonText: {
        color: '#874E3B',
        fontWeight: 'bold',
        fontSize: 16,
    },
    saveButtonText: {
        color: '#FFFEEA',
        fontWeight: 'bold',
        fontSize: 16,
    },
});