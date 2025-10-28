// app/(tabs)/sales-expense.tsx
import { useState, useEffect } from 'react';
import {
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ImageBackground,
    Alert,
    View
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather } from "@expo/vector-icons";
import Navbar from '@/components/Navbar';
import { NetworkScanner } from '@/lib/network-scanner';
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';
import { OfflineSyncService } from '@/lib/offline-sync';

interface SalesData {
    date: string;
    revenue: number;
    orders: number;
}

interface ExpenseData {
    category: string;
    amount: number;
    date: string;
    description: string;
}

interface SummaryData {
    totalRevenue: number;
    totalOrders: number;
    totalExpenses: number;
    netProfit: number;
    todayRevenue: number;
    todayOrders: number;
    todayItems: number;
}

export default function SalesExpenseScreen() {
    const [activeTab, setActiveTab] = useState<'sales' | 'expense'>('sales');
    const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('week');
    const [salesData, setSalesData] = useState<SalesData[]>([]);
    const [expenseData, setExpenseData] = useState<ExpenseData[]>([]);
    const [summaryData, setSummaryData] = useState<SummaryData>({
        totalRevenue: 0,
        totalOrders: 0,
        totalExpenses: 0,
        netProfit: 0,
        todayRevenue: 0,
        todayOrders: 0,
        todayItems: 0
    });
    const [loading, setLoading] = useState(false);
    const [isOnlineMode, setIsOnlineMode] = useState<boolean>(false);

    // Function to get dynamic API URL
    const getApiBaseUrl = async (): Promise<string> => {
        try {
            const serverIP = await NetworkScanner.findServerIP();
            if (serverIP === 'demo') {
                console.log('🔄 Sales & Expense Running in demo mode');
                setIsOnlineMode(false);
                return 'demo';
            }
            const baseUrl = `http://${serverIP}/backend/api`;
            console.log(`🌐 Sales & Expense Using server: ${baseUrl}`);
            setIsOnlineMode(true);
            return baseUrl;
        } catch (error) {
            console.log('❌ Sales & Expense Error detecting server, using demo mode');
            setIsOnlineMode(false);
            return 'demo';
        }
    };

    // Load sales data
    const loadSalesData = async () => {
        setLoading(true);
        try {
            const API_BASE_URL = await getApiBaseUrl();

            if (API_BASE_URL === 'demo') {
                // Demo data for sales - exact match sa screenshot
                const demoSalesData: SalesData[] = [
                    { date: '12 Jan', revenue: 45, orders: 45 },
                    { date: '13 Jan', revenue: 85, orders: 68 },
                    { date: '14 Jan', revenue: 65, orders: 52 },
                    { date: '15 Jan', revenue: 120, orders: 85 },
                    { date: '16 Jan', revenue: 95, orders: 72 },
                    { date: '17 Jan', revenue: 110, orders: 78 },
                    { date: '18 Jan', revenue: 130, orders: 92 },
                ];
                setSalesData(demoSalesData);

                // Demo summary data - exact match sa screenshot
                setSummaryData({
                    totalRevenue: 1800,
                    totalOrders: 128,
                    totalExpenses: 3200,
                    netProfit: 9900,
                    todayRevenue: 658.50,
                    todayOrders: 68,
                    todayItems: 224
                });
                return;
            }

            // TODO: Implement actual API calls for sales data
            console.log('🔗 Fetching sales data from server...');

        } catch (error) {
            console.error('❌ Error loading sales data:', error);
            // Fallback to demo data
            const demoSalesData: SalesData[] = [
                { date: '12 Jan', revenue: 45, orders: 45 },
                { date: '13 Jan', revenue: 85, orders: 68 },
                { date: '14 Jan', revenue: 65, orders: 52 },
                { date: '15 Jan', revenue: 120, orders: 85 },
                { date: '16 Jan', revenue: 95, orders: 72 },
                { date: '17 Jan', revenue: 110, orders: 78 },
                { date: '18 Jan', revenue: 130, orders: 92 },
            ];
            setSalesData(demoSalesData);
        } finally {
            setLoading(false);
        }
    };

    // Load expense data
    const loadExpenseData = async () => {
        try {
            const API_BASE_URL = await getApiBaseUrl();

            if (API_BASE_URL === 'demo') {
                // Demo data for expenses
                const demoExpenseData: ExpenseData[] = [
                    { category: 'Ingredients', amount: 1200, date: '2024-01-18', description: 'Weekly grocery' },
                    { category: 'Utilities', amount: 450, date: '2024-01-17', description: 'Electricity bill' },
                    { category: 'Staff', amount: 800, date: '2024-01-16', description: 'Weekly payroll' },
                    { category: 'Equipment', amount: 350, date: '2024-01-15', description: 'Coffee machine maintenance' },
                    { category: 'Marketing', amount: 200, date: '2024-01-14', description: 'Social media ads' },
                    { category: 'Rent', amount: 1200, date: '2024-01-10', description: 'Monthly rent' },
                ];
                setExpenseData(demoExpenseData);
                return;
            }

            // TODO: Implement actual API calls for expense data
            console.log('🔗 Fetching expense data from server...');

        } catch (error) {
            console.error('❌ Error loading expense data:', error);
        }
    };

    useFocusEffect(
        React.useCallback(() => {
            loadSalesData();
            loadExpenseData();
        }, [timeRange])
    );

    // Calculate chart dimensions and data - fixed para match sa screenshot
    const maxRevenue = 150; // Fixed maximum para match sa Y-axis
    const chartHeight = 150;

    const getBarHeight = (revenue: number) => {
        return (revenue / maxRevenue) * chartHeight;
    };

    const formatCurrency = (amount: number) => {
        if (amount >= 1000) {
            return `$${(amount / 1000).toFixed(1)}k`;
        }
        return `$${amount.toFixed(2)}`;
    };

    return (
        <ThemedView style={styles.container}>
            {/* Navbar Component */}
            <Navbar activeNav="sales" />

            {/* Main Content */}
            <ImageBackground
                source={require('@/assets/images/kape1.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <ThemedView style={styles.content}>
                    {/* Mode Indicator */}
                    <ThemedView style={styles.modeIndicatorContainer}>
                        <ThemedText style={[
                            styles.modeText,
                            isOnlineMode ? styles.onlineModeText : styles.offlineModeText
                        ]}>
                            {isOnlineMode ? '🌐 ONLINE MODE' : '📱 OFFLINE MODE'}
                        </ThemedText>
                    </ThemedView>

                    {/* Header Section - Exact match sa screenshot */}
                    <ThemedView style={styles.headerSection}>
                        <ThemedView>
                            <ThemedText style={styles.mainTitle}>SUIZLON RESTRO</ThemedText>
                        </ThemedView>

                        <ThemedView style={styles.headerActions}>
                            <TouchableOpacity style={styles.viewStatusButton}>
                                <ThemedText style={styles.viewStatusText}>View Status</ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.addOrderButton}>
                                <Feather name="plus" size={16} color="#FFFEEA" />
                                <ThemedText style={styles.addOrderButtonText}>Add Order</ThemedText>
                            </TouchableOpacity>
                        </ThemedView>
                    </ThemedView>

                    {/* Main Content Area */}
                    <ThemedView style={styles.mainContent}>
                        {/* Left Side - Stats and Charts */}
                        <ThemedView style={styles.leftSection}>
                            {/* Realtime Orders Card - Exact match */}
                            <ThemedView style={styles.card}>
                                <ThemedView style={styles.cardHeader}>
                                    <ThemedText style={styles.cardTitle}>Realtime Orders</ThemedText>
                                </ThemedView>
                                <ThemedText style={styles.orderCount}>(39 items)</ThemedText>
                            </ThemedView>

                            {/* Sales Revenue Chart - Exact match sa screenshot */}
                            <ThemedView style={styles.card}>
                                <ThemedView style={styles.cardHeader}>
                                    <ThemedText style={styles.cardTitle}>Sales Revenue Orders</ThemedText>
                                </ThemedView>

                                {/* Chart Container */}
                                <ThemedView style={styles.chartContainer}>
                                    <ThemedView style={styles.chart}>
                                        {/* Y-axis labels - Exact match */}
                                        <ThemedView style={styles.yAxis}>
                                            <ThemedText style={styles.yAxisLabel}>150</ThemedText>
                                            <ThemedText style={styles.yAxisLabel}>125</ThemedText>
                                            <ThemedText style={styles.yAxisLabel}>100</ThemedText>
                                            <ThemedText style={styles.yAxisLabel}>75</ThemedText>
                                            <ThemedText style={styles.yAxisLabel}>50</ThemedText>
                                            <ThemedText style={styles.yAxisLabel}>25</ThemedText>
                                            <ThemedText style={styles.yAxisLabel}>0</ThemedText>
                                        </ThemedView>

                                        {/* Bars Container */}
                                        <ThemedView style={styles.barsContainer}>
                                            {salesData.map((item, index) => (
                                                <ThemedView key={index} style={styles.barWrapper}>
                                                    <ThemedView
                                                        style={[
                                                            styles.bar,
                                                            { height: getBarHeight(item.revenue) }
                                                        ]}
                                                    />
                                                    <ThemedText style={styles.barLabel}>{item.date}</ThemedText>
                                                </ThemedView>
                                            ))}
                                        </ThemedView>
                                    </ThemedView>
                                </ThemedView>

                                {/* Sales & Expense Settings Section */}
                                <ThemedView style={styles.settingsSection}>
                                    <ThemedText style={styles.settingsTitle}>Sales & Expense Settings</ThemedText>
                                    <ThemedView style={styles.settingsOptions}>
                                        <ThemedText style={styles.settingsOption}>• Order Status</ThemedText>
                                        <ThemedText style={styles.settingsOption}>• This Week</ThemedText>
                                    </ThemedView>
                                </ThemedView>
                            </ThemedView>
                        </ThemedView>

                        {/* Right Side - Summary Cards - Exact match sa screenshot */}
                        <ThemedView style={styles.rightSection}>
                            {/* Tablets Occupied Card */}
                            <ThemedView style={styles.summaryCard}>
                                <ThemedText style={styles.summaryCardTitle}>Tablets Occupied</ThemedText>
                                <ThemedText style={styles.salesAmount}>$658.50</ThemedText>
                                <ThemedText style={styles.salesDetails}>68 orders / 224 items</ThemedText>
                                <ThemedText style={styles.salesLabel}>SALES TODAY</ThemedText>
                            </ThemedView>

                            {/* Total Order Card */}
                            <ThemedView style={styles.summaryCard}>
                                <ThemedText style={styles.summaryCardTitle}>Total Order</ThemedText>
                                <ThemedText style={styles.orderCountLarge}>128</ThemedText>
                            </ThemedView>

                            {/* Revenue Card */}
                            <ThemedView style={styles.summaryCard}>
                                <ThemedText style={styles.summaryCardTitle}>Revenue</ThemedText>
                                <ThemedText style={styles.revenueAmount}>$1.8k</ThemedText>
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
        padding: 16,
        backgroundColor: 'transparent',
    },
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
    headerSection: {
        backgroundColor: "rgba(255, 254, 234, 0.95)",
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#D4A574',
        marginBottom: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    mainTitle: {
        fontSize: 28,
        color: '#874E3B',
        fontFamily: 'LobsterTwoItalic',
        fontWeight: 'bold',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    viewStatusButton: {
        backgroundColor: '#874E3B',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 6,
    },
    viewStatusText: {
        color: '#FFFEEA',
        fontSize: 14,
        fontWeight: 'bold',
    },
    addOrderButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#874E3B',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 8,
    },
    addOrderButtonText: {
        color: '#FFFEEA',
        fontSize: 14,
        fontWeight: 'bold',
    },
    mainContent: {
        flex: 1,
        flexDirection: 'row',
        gap: 16,
    },
    leftSection: {
        flex: 2,
        gap: 16,
    },
    rightSection: {
        flex: 1,
        gap: 16,
    },
    card: {
        backgroundColor: "rgba(255, 254, 234, 0.95)",
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    cardHeader: {
        marginBottom: 8,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#874E3B',
        fontFamily: 'LobsterTwoRegular',
    },
    orderCount: {
        fontSize: 14,
        color: '#5A3921',
        fontStyle: 'italic',
    },
    chartContainer: {
        marginTop: 16,
    },
    chart: {
        flexDirection: 'row',
        height: 180,
        alignItems: 'flex-end',
    },
    yAxis: {
        justifyContent: 'space-between',
        marginRight: 12,
        height: 150,
        paddingVertical: 8,
    },
    yAxisLabel: {
        fontSize: 12,
        color: '#5A3921',
        fontWeight: '500',
        height: 20,
        textAlign: 'right',
    },
    barsContainer: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        height: 150,
        paddingVertical: 8,
    },
    barWrapper: {
        alignItems: 'center',
        flex: 1,
        justifyContent: 'flex-end',
    },
    bar: {
        width: 16,
        backgroundColor: '#874E3B',
        borderRadius: 3,
        marginBottom: 4,
        minHeight: 2,
    },
    barLabel: {
        fontSize: 11,
        color: '#5A3921',
        marginTop: 4,
    },
    settingsSection: {
        marginTop: 20,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#D4A574',
    },
    settingsTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
        marginBottom: 8,
        fontFamily: 'LobsterTwoRegular',
    },
    settingsOptions: {
        marginLeft: 8,
    },
    settingsOption: {
        fontSize: 14,
        color: '#5A3921',
        marginBottom: 4,
    },
    summaryCard: {
        backgroundColor: "rgba(255, 254, 234, 0.95)",
        borderRadius: 12,
        padding: 20,
        borderWidth: 1,
        borderColor: '#D4A574',
        alignItems: 'center',
        justifyContent: 'center',
        height: 140,
    },
    summaryCardTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
        fontFamily: 'LobsterTwoRegular',
        textAlign: 'center',
        marginBottom: 12,
    },
    salesAmount: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#874E3B',
        marginBottom: 4,
    },
    salesDetails: {
        fontSize: 12,
        color: '#5A3921',
        marginBottom: 6,
        textAlign: 'center',
    },
    salesLabel: {
        fontSize: 11,
        color: '#874E3B',
        fontWeight: 'bold',
        textAlign: 'center',
    },
    orderCountLarge: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    revenueAmount: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#874E3B',
    },
});