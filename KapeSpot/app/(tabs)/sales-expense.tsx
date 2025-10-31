// app/(tabs)/sales-expense.tsx
import { useState, useEffect } from 'react';
import {
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ImageBackground,
    Dimensions,
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
import { Svg, Line, Rect, Text as SvgText, G } from 'react-native-svg';

interface OrderData {
    orderId: string;
    customerName: string;
    items: any[];
    subtotal: number;
    total: number;
    timestamp: string;
    status: 'unpaid' | 'paid' | 'cancelled';
}

interface SalesData {
    date: string;
    sales: number;
    orders: number;
    customers: string[];
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

    const getApiBaseUrl = async (): Promise<string> => {
        try {
            const serverIP = await NetworkScanner.findServerIP();
            if (serverIP === 'demo' || serverIP === 'local') {
                setIsOnlineMode(false);
                return 'local';
            }
            const baseUrl = `http://${serverIP}/backend/api`;
            setIsOnlineMode(true);
            return baseUrl;
        } catch (error) {
            setIsOnlineMode(false);
            return 'local';
        }
    };

    const loadOrders = async () => {
        setLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const API_BASE_URL = await getApiBaseUrl();

            let allOrders: OrderData[] = [];

            if (API_BASE_URL === 'local') {
                console.log('📱 Loading sales data from local storage...');
                const localOrders = await syncService.getPendingReceipts();
                allOrders = localOrders.filter(order => order.status === 'paid');
                console.log('📱 Local sales data loaded:', allOrders.length);
            } else {
                try {
                    console.log('🌐 Loading sales data from server...');
                    const response = await fetch(`${API_BASE_URL}/orders.php`);

                    if (response.ok) {
                        const serverOrders = await response.json();
                        console.log('🌐 Server sales data response:', serverOrders);

                        allOrders = serverOrders
                            .map((order: any) => ({
                                orderId: order.order_id || order.orderId,
                                customerName: order.customer_name || order.customerName,
                                items: order.items || [],
                                subtotal: parseFloat(order.subtotal) || 0,
                                total: parseFloat(order.total) || 0,
                                timestamp: order.created_at || order.timestamp,
                                status: order.status || 'unpaid'
                            }))
                            .filter((order: OrderData) => order.status === 'paid');

                        console.log('🌐 Server sales data loaded:', allOrders.length);
                    } else {
                        throw new Error('Server response not OK');
                    }
                } catch (serverError) {
                    console.log('⚠️ Failed to load from server, falling back to local storage:', serverError);
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
                                    <TouchableOpacity
                                        style={styles.reloadButton}
                                        onPress={loadOrders}
                                    >
                                        <Feather name="refresh-cw" size={18} color="#874E3B" />
                                    </TouchableOpacity>
                                </ThemedView>

                                <ThemedText style={styles.modeInfo}>
                                    {isOnlineMode ? '🌐 Connected to server' : '📱 Using local storage'}
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

                        {/* Summary Cards - 2x2 Grid */}
                        <ThemedView style={styles.summaryGrid}>
                            {/* Row 1 */}
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
                            </ThemedView>

                            {/* Row 2 */}
                            <ThemedView style={styles.summaryRow}>
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
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    mainTitle: {
        fontSize: 28,
        color: '#874E3B',
        fontFamily: 'LobsterTwoItalic',
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
    // Summary Cards - 2x2 Grid
    summaryGrid: {
        marginBottom: 16,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    summaryCard: {
        flex: 1,
        backgroundColor: "#FFFEEA",
        borderRadius: 12,
        padding: 16,
        marginHorizontal: 6,
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
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    summaryValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#874E3B',
        marginBottom: 4,
    },
    summaryLabel: {
        fontSize: 12,
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
    },
    chartTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
        marginBottom: 2,
    },
    chartSubtitle: {
        fontSize: 10,
        color: '#5A3921',
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
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#874E3B',
        marginBottom: 4,
    },
    activitySubtitle: {
        fontSize: 12,
        color: '#5A3921',
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
});