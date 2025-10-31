// app/(tabs)/settings.tsx
import { useState, useEffect } from 'react';
import {
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ImageBackground,
    Alert,
    View,
    PermissionsAndroid,
    Platform,
    Linking
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather } from "@expo/vector-icons";
import Navbar from '@/components/Navbar';
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';

interface BluetoothDevice {
    id: string;
    name: string;
    isConnected: boolean;
}

export default function SettingsScreen() {
    const [activeTab, setActiveTab] = useState<'printer' | 'general' | 'about'>('printer');
    const [bluetoothDevices, setBluetoothDevices] = useState<BluetoothDevice[]>([]);
    const [scanning, setScanning] = useState(false);
    const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
    const [bluetoothEnabled, setBluetoothEnabled] = useState<boolean>(false); // Default to false

    // Simulate Bluetooth status - in real app, use react-native-bluetooth-status
    const checkBluetoothStatus = async (): Promise<boolean> => {
        return new Promise((resolve) => {
            // For simulation purposes, let's assume Bluetooth is OFF by default
            // In a real app, you would use:
            // import { BluetoothStatus } from 'react-native-bluetooth-status';
            // const isEnabled = await BluetoothStatus.state();

            // Simulate Bluetooth being OFF (change to true to test enabled state)
            const isEnabled = false; // CHANGE THIS TO true TO TEST ENABLED STATE
            setBluetoothEnabled(isEnabled);
            resolve(isEnabled);
            console.log(`📱 Bluetooth status: ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
        });
    };

    // Toggle Bluetooth status for testing
    const toggleBluetooth = () => {
        const newStatus = !bluetoothEnabled;
        setBluetoothEnabled(newStatus);
        console.log(`🔵 Bluetooth ${newStatus ? 'ENABLED' : 'DISABLED'}`);

        if (newStatus) {
            Alert.alert('Bluetooth Enabled', 'Bluetooth has been turned on for testing');
        } else {
            setBluetoothDevices([]);
            setConnectedDevice(null);
            Alert.alert('Bluetooth Disabled', 'Bluetooth has been turned off for testing');
        }
    };

    // Request Bluetooth permissions
    const requestBluetoothPermission = async (): Promise<boolean> => {
        if (Platform.OS === 'android') {
            try {
                const granted = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                ]);

                return (
                    granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
                    granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
                    granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
                );
            } catch (err) {
                console.warn(err);
                return false;
            }
        }
        return true; // iOS handles permissions differently
    };

    // Scan for Bluetooth devices
    const scanForDevices = async () => {
        // First check if Bluetooth is enabled
        if (!bluetoothEnabled) {
            Alert.alert(
                'Bluetooth is Turned Off',
                'Please turn on Bluetooth to scan for devices',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Turn On Bluetooth',
                        onPress: toggleBluetooth
                    },
                    {
                        text: 'Open Settings',
                        onPress: () => {
                            if (Platform.OS === 'android') {
                                Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
                            } else {
                                Linking.openURL('App-Prefs:Bluetooth');
                            }
                        }
                    }
                ]
            );
            return;
        }

        const hasPermission = await requestBluetoothPermission();
        if (!hasPermission) {
            Alert.alert('Permission Required', 'Bluetooth permission is required to scan for devices');
            return;
        }

        setScanning(true);
        setBluetoothDevices([]);

        console.log('🔍 Starting Bluetooth scan...');

        // Simulate device discovery (only works when Bluetooth is enabled)
        setTimeout(() => {
            if (bluetoothEnabled) {
                const simulatedDevices: BluetoothDevice[] = [
                    { id: '1', name: 'Thermal Printer XP-58', isConnected: false },
                    { id: '2', name: 'BT-Print-001', isConnected: false },
                    { id: '3', name: 'POS Printer', isConnected: false },
                    { id: '4', name: 'Receipt Printer', isConnected: false },
                    { id: '5', name: 'Speaker JBL', isConnected: false },
                    { id: '6', name: 'Wireless Headphones', isConnected: false },
                ];

                setBluetoothDevices(simulatedDevices);
                console.log('✅ Found devices:', simulatedDevices.length);
            } else {
                console.log('❌ Bluetooth is off, no devices found');
            }
            setScanning(false);
        }, 2000);
    };

    // Connect to Bluetooth device
    const connectToDevice = async (device: BluetoothDevice) => {
        // Check Bluetooth status before connecting
        if (!bluetoothEnabled) {
            Alert.alert('Bluetooth Off', 'Please turn on Bluetooth to connect to devices');
            return;
        }

        console.log('🔗 Connecting to device:', device.name);

        // Simulate connection process
        setScanning(true);

        setTimeout(() => {
            if (bluetoothEnabled) {
                setConnectedDevice(device);
                setBluetoothDevices(prev =>
                    prev.map(d =>
                        d.id === device.id
                            ? { ...d, isConnected: true }
                            : d
                    )
                );

                Alert.alert(
                    'Connected Successfully',
                    `Connected to ${device.name}`,
                    [{ text: 'OK' }]
                );

                console.log('✅ Connected to:', device.name);
            } else {
                Alert.alert('Connection Failed', 'Bluetooth was turned off during connection');
            }
            setScanning(false);
        }, 1500);
    };

    // Disconnect from device
    const disconnectDevice = async () => {
        if (!connectedDevice) return;

        console.log('🔌 Disconnecting from device:', connectedDevice.name);

        // Simulate disconnection
        setBluetoothDevices(prev =>
            prev.map(d =>
                d.id === connectedDevice.id
                    ? { ...d, isConnected: false }
                    : d
            )
        );

        setConnectedDevice(null);

        Alert.alert('Disconnected', `Disconnected from ${connectedDevice.name}`);
    };

    // Test print function
    const testPrint = async () => {
        if (!connectedDevice) {
            Alert.alert('No Printer Connected', 'Please connect to a printer first');
            return;
        }

        // Check Bluetooth status before printing
        if (!bluetoothEnabled) {
            Alert.alert('Bluetooth Off', 'Please turn on Bluetooth to print');
            return;
        }

        console.log('🖨️ Testing print...');

        // Simulate printing
        Alert.alert(
            'Test Print',
            'Sending test receipt to printer...',
            [{ text: 'OK' }]
        );
    };

    // Check Bluetooth status on component mount
    useEffect(() => {
        checkBluetoothStatus();
    }, []);

    useFocusEffect(
        React.useCallback(() => {
            // Check Bluetooth status when screen comes into focus
            checkBluetoothStatus();

            // Cleanup when leaving screen
            return () => {
                if (scanning) {
                    setScanning(false);
                }
            };
        }, [scanning])
    );

    return (
        <ThemedView style={styles.container}>
            {/* Navbar Component */}
            <Navbar activeNav="settings" />

            {/* Main Content */}
            <ImageBackground
                source={require('@/assets/images/kape1.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <ThemedView style={styles.content}>
                    {/* Header Section */}
                    <ThemedView style={styles.headerSection}>
                        <ThemedText style={styles.mainTitle}>Settings</ThemedText>
                        <ThemedText style={styles.subtitle}>
                            Configure your KapeSpot system
                        </ThemedText>
                    </ThemedView>

                    {/* Settings Tabs */}
                    <ThemedView style={styles.tabsContainer}>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'printer' && styles.tabActive]}
                            onPress={() => setActiveTab('printer')}
                        >
                            <Feather
                                name="printer"
                                size={20}
                                color={activeTab === 'printer' ? '#FFFEEA' : '#874E3B'}
                            />
                            <ThemedText style={[styles.tabText, activeTab === 'printer' && styles.tabTextActive]}>
                                Printer
                            </ThemedText>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'general' && styles.tabActive]}
                            onPress={() => setActiveTab('general')}
                        >
                            <Feather
                                name="settings"
                                size={20}
                                color={activeTab === 'general' ? '#FFFEEA' : '#874E3B'}
                            />
                            <ThemedText style={[styles.tabText, activeTab === 'general' && styles.tabTextActive]}>
                                General
                            </ThemedText>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'about' && styles.tabActive]}
                            onPress={() => setActiveTab('about')}
                        >
                            <Feather
                                name="info"
                                size={20}
                                color={activeTab === 'about' ? '#FFFEEA' : '#874E3B'}
                            />
                            <ThemedText style={[styles.tabText, activeTab === 'about' && styles.tabTextActive]}>
                                About
                            </ThemedText>
                        </TouchableOpacity>
                    </ThemedView>

                    {/* Content Area */}
                    <ScrollView style={styles.contentArea}>
                        {activeTab === 'printer' && (
                            <ThemedView style={styles.tabContent}>
                                {/* Bluetooth Status Indicator */}
                                <TouchableOpacity
                                    style={[
                                        styles.bluetoothStatusCard,
                                        !bluetoothEnabled && styles.bluetoothStatusCardDisabled
                                    ]}
                                    onPress={toggleBluetooth}
                                >
                                    <ThemedView style={styles.bluetoothStatusHeader}>
                                        <Feather
                                            name="bluetooth"
                                            size={24}
                                            color={bluetoothEnabled ? "#2563EB" : "#6B7280"}
                                        />
                                        <ThemedView style={styles.bluetoothStatusTextContainer}>
                                            <ThemedText style={[
                                                styles.bluetoothStatusText,
                                                !bluetoothEnabled && styles.bluetoothStatusTextDisabled
                                            ]}>
                                                Bluetooth {bluetoothEnabled ? 'Enabled' : 'Disabled'}
                                            </ThemedText>
                                            <ThemedText style={styles.bluetoothStatusHint}>
                                                Tap to {bluetoothEnabled ? 'disable' : 'enable'} for testing
                                            </ThemedText>
                                        </ThemedView>
                                    </ThemedView>
                                    {!bluetoothEnabled && (
                                        <ThemedText style={styles.bluetoothStatusMessage}>
                                            Please turn on Bluetooth to scan and connect to devices
                                        </ThemedText>
                                    )}
                                    <Feather
                                        name={bluetoothEnabled ? "toggle-right" : "toggle-left"}
                                        size={20}
                                        color={bluetoothEnabled ? "#2563EB" : "#6B7280"}
                                        style={styles.bluetoothToggleIcon}
                                    />
                                </TouchableOpacity>

                                {/* Connection Status */}
                                {bluetoothEnabled && (
                                    <ThemedView style={styles.connectionCard}>
                                        <ThemedView style={styles.connectionHeader}>
                                            <Feather
                                                name={connectedDevice ? "check-circle" : "x-circle"}
                                                size={24}
                                                color={connectedDevice ? "#16A34A" : "#DC2626"}
                                            />
                                            <ThemedText style={styles.connectionStatus}>
                                                {connectedDevice ? 'Connected' : 'Not Connected'}
                                            </ThemedText>
                                        </ThemedView>

                                        {connectedDevice && (
                                            <ThemedView style={styles.connectedDevice}>
                                                <ThemedText style={styles.deviceName}>
                                                    {connectedDevice.name}
                                                </ThemedText>
                                                <TouchableOpacity
                                                    style={styles.disconnectButton}
                                                    onPress={disconnectDevice}
                                                >
                                                    <ThemedText style={styles.disconnectButtonText}>
                                                        Disconnect
                                                    </ThemedText>
                                                </TouchableOpacity>
                                            </ThemedView>
                                        )}
                                    </ThemedView>
                                )}

                                {/* Scan Section */}
                                <ThemedView style={styles.scanSection}>
                                    <ThemedText style={styles.sectionTitle}>
                                        Bluetooth Devices
                                    </ThemedText>

                                    <TouchableOpacity
                                        style={[
                                            styles.scanButton,
                                            scanning && styles.scanButtonDisabled,
                                            !bluetoothEnabled && styles.scanButtonDisabled
                                        ]}
                                        onPress={scanForDevices}
                                        disabled={scanning || !bluetoothEnabled}
                                    >
                                        <Feather
                                            name="bluetooth"
                                            size={20}
                                            color="#FFFEEA"
                                        />
                                        <ThemedText style={styles.scanButtonText}>
                                            {scanning ? 'Scanning...' :
                                                !bluetoothEnabled ? 'Bluetooth Off' :
                                                    'Scan for Devices'}
                                        </ThemedText>
                                    </TouchableOpacity>

                                    {/* Device List - Always visible below scan button */}
                                    <ThemedView style={styles.devicesList}>
                                        <ThemedView style={styles.devicesHeader}>
                                            <ThemedText style={styles.devicesTitle}>
                                                Available Devices ({bluetoothDevices.length})
                                            </ThemedText>
                                            {bluetoothDevices.length > 0 && (
                                                <TouchableOpacity onPress={() => setBluetoothDevices([])}>
                                                    <ThemedText style={styles.clearText}>
                                                        Clear
                                                    </ThemedText>
                                                </TouchableOpacity>
                                            )}
                                        </ThemedView>

                                        {!bluetoothEnabled ? (
                                            <ThemedView style={styles.emptyState}>
                                                <Feather name="wifi-off" size={40} color="#6B7280" />
                                                <ThemedText style={styles.emptyStateText}>
                                                    Bluetooth is Turned Off
                                                </ThemedText>
                                                <ThemedText style={styles.emptyStateSubtext}>
                                                    Tap the Bluetooth status card above to enable Bluetooth for testing
                                                </ThemedText>
                                            </ThemedView>
                                        ) : bluetoothDevices.length === 0 ? (
                                            <ThemedView style={styles.emptyState}>
                                                <Feather name="bluetooth" size={40} color="#D4A574" />
                                                <ThemedText style={styles.emptyStateText}>
                                                    No devices found
                                                </ThemedText>
                                                <ThemedText style={styles.emptyStateSubtext}>
                                                    Tap "Scan for Devices" to discover nearby Bluetooth devices
                                                </ThemedText>
                                            </ThemedView>
                                        ) : (
                                            bluetoothDevices.map((device) => (
                                                <TouchableOpacity
                                                    key={device.id}
                                                    style={[
                                                        styles.deviceItem,
                                                        device.isConnected && styles.deviceItemConnected
                                                    ]}
                                                    onPress={() => connectToDevice(device)}
                                                    disabled={device.isConnected || scanning || !bluetoothEnabled}
                                                >
                                                    <Feather
                                                        name={device.name.includes('Printer') ? "printer" : "bluetooth"}
                                                        size={20}
                                                        color={device.isConnected ? "#16A34A" : "#874E3B"}
                                                    />
                                                    <ThemedView style={styles.deviceInfo}>
                                                        <ThemedText style={styles.deviceName}>
                                                            {device.name}
                                                        </ThemedText>
                                                        <ThemedText style={[
                                                            styles.deviceStatus,
                                                            device.isConnected && styles.deviceStatusConnected
                                                        ]}>
                                                            {device.isConnected ? 'Connected' : 'Available'}
                                                        </ThemedText>
                                                    </ThemedView>
                                                    {device.isConnected ? (
                                                        <Feather name="check" size={20} color="#16A34A" />
                                                    ) : (
                                                        <Feather name="link" size={20} color="#874E3B" />
                                                    )}
                                                </TouchableOpacity>
                                            ))
                                        )}
                                    </ThemedView>

                                    {/* Test Print Button */}
                                    {connectedDevice && bluetoothEnabled && (
                                        <TouchableOpacity
                                            style={styles.testPrintButton}
                                            onPress={testPrint}
                                        >
                                            <Feather name="file-text" size={20} color="#FFFEEA" />
                                            <ThemedText style={styles.testPrintButtonText}>
                                                Test Print Receipt
                                            </ThemedText>
                                        </TouchableOpacity>
                                    )}
                                </ThemedView>
                            </ThemedView>
                        )}

                        {activeTab === 'general' && (
                            <ThemedView style={styles.tabContent}>
                                <ThemedView style={styles.comingSoonCard}>
                                    <Feather name="settings" size={48} color="#D4A574" />
                                    <ThemedText style={styles.comingSoonTitle}>
                                        General Settings
                                    </ThemedText>
                                    <ThemedText style={styles.comingSoonText}>
                                        Configuration options for system preferences, notifications, and other general settings will be available here in the next update.
                                    </ThemedText>
                                </ThemedView>
                            </ThemedView>
                        )}

                        {activeTab === 'about' && (
                            <ThemedView style={styles.tabContent}>
                                <ThemedView style={styles.aboutCard}>
                                    <ThemedText style={styles.appName}>KapeSpot POS</ThemedText>
                                    <ThemedText style={styles.version}>Version 1.0.0</ThemedText>
                                    <ThemedText style={styles.description}>
                                        A modern Point of Sale system for coffee shops and restaurants with offline capability and thermal printing support.
                                    </ThemedText>

                                    <ThemedView style={styles.featureList}>
                                        <ThemedText style={styles.featureItem}>• Offline POS Operations</ThemedText>
                                        <ThemedText style={styles.featureItem}>• Thermal Printer Support</ThemedText>
                                        <ThemedText style={styles.featureItem}>• Inventory Management</ThemedText>
                                        <ThemedText style={styles.featureItem}>• Sales Analytics</ThemedText>
                                        <ThemedText style={styles.featureItem}>• Order Status Tracking</ThemedText>
                                    </ThemedView>
                                </ThemedView>
                            </ThemedView>
                        )}
                    </ScrollView>
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
    headerSection: {
        backgroundColor: "rgba(255, 254, 234, 0.95)",
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#D4A574',
        marginBottom: 16,
    },
    mainTitle: {
        fontSize: 28,
        color: '#874E3B',
        fontFamily: 'LobsterTwoItalic',
    },
    subtitle: {
        fontSize: 16,
        color: '#5A3921',
        marginTop: 4,
    },
    tabsContainer: {
        flexDirection: 'row',
        backgroundColor: "rgba(255, 254, 234, 0.95)",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#D4A574',
        marginBottom: 16,
        padding: 8,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderRadius: 8,
        gap: 8,
    },
    tabActive: {
        backgroundColor: '#874E3B',
    },
    tabText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    tabTextActive: {
        color: '#FFFEEA',
    },
    contentArea: {
        flex: 1,
    },
    tabContent: {
        gap: 16,
    },
    // Bluetooth Status Card
    bluetoothStatusCard: {
        backgroundColor: "rgba(255, 254, 234, 0.95)",
        borderRadius: 12,
        padding: 16,
        borderWidth: 2,
        borderColor: '#2563EB',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    bluetoothStatusCardDisabled: {
        borderColor: '#6B7280',
        backgroundColor: '#F3F4F6',
    },
    bluetoothStatusHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    bluetoothStatusTextContainer: {
        flex: 1,
    },
    bluetoothStatusText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#2563EB',
    },
    bluetoothStatusTextDisabled: {
        color: '#6B7280',
    },
    bluetoothStatusHint: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    bluetoothStatusMessage: {
        fontSize: 14,
        color: '#6B7280',
        marginTop: 4,
    },
    bluetoothToggleIcon: {
        marginLeft: 8,
    },
    connectionCard: {
        backgroundColor: "rgba(255, 254, 234, 0.95)",
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    connectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    connectionStatus: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    connectedDevice: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#E8D8C8',
    },
    deviceName: {
        fontSize: 16,
        color: '#5A3921',
        fontWeight: '500',
    },
    disconnectButton: {
        backgroundColor: '#DC2626',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
    },
    disconnectButtonText: {
        color: '#FFFEEA',
        fontSize: 12,
        fontWeight: 'bold',
    },
    scanSection: {
        backgroundColor: "rgba(255, 254, 234, 0.95)",
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#874E3B',
        marginBottom: 12,
        fontFamily: 'LobsterTwoRegular',
    },
    scanButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#874E3B',
        paddingVertical: 12,
        borderRadius: 8,
        gap: 8,
        marginBottom: 16,
    },
    scanButtonDisabled: {
        backgroundColor: '#A8A29E',
    },
    scanButtonText: {
        color: '#FFFEEA',
        fontSize: 16,
        fontWeight: 'bold',
    },
    devicesList: {
        marginTop: 8,
    },
    devicesHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    devicesTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
    },
    clearText: {
        fontSize: 14,
        color: '#DC2626',
        fontWeight: '500',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 40,
        paddingHorizontal: 20,
    },
    emptyStateText: {
        fontSize: 16,
        color: '#874E3B',
        fontWeight: 'bold',
        marginTop: 12,
        marginBottom: 8,
    },
    emptyStateSubtext: {
        fontSize: 14,
        color: '#5A3921',
        textAlign: 'center',
        lineHeight: 20,
    },
    deviceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderWidth: 1,
        borderColor: '#D4A574',
        borderRadius: 8,
        marginBottom: 8,
        backgroundColor: '#F5E6D3',
        gap: 12,
    },
    deviceItemConnected: {
        backgroundColor: '#DCFCE7',
        borderColor: '#16A34A',
    },
    deviceInfo: {
        flex: 1,
    },
    deviceStatus: {
        fontSize: 12,
        color: '#8B7355',
        marginTop: 2,
    },
    deviceStatusConnected: {
        color: '#16A34A',
        fontWeight: 'bold',
    },
    testPrintButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#16A34A',
        paddingVertical: 12,
        borderRadius: 8,
        gap: 8,
        marginTop: 16,
    },
    testPrintButtonText: {
        color: '#FFFEEA',
        fontSize: 16,
        fontWeight: 'bold',
    },
    comingSoonCard: {
        backgroundColor: "rgba(255, 254, 234, 0.95)",
        borderRadius: 12,
        padding: 30,
        borderWidth: 1,
        borderColor: '#D4A574',
        alignItems: 'center',
    },
    comingSoonTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#874E3B',
        marginTop: 16,
        marginBottom: 8,
    },
    comingSoonText: {
        fontSize: 14,
        color: '#5A3921',
        textAlign: 'center',
        lineHeight: 20,
    },
    aboutCard: {
        backgroundColor: "rgba(255, 254, 234, 0.95)",
        borderRadius: 12,
        padding: 20,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    appName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#874E3B',
        textAlign: 'center',
        marginBottom: 8,
        fontFamily: 'LobsterTwoItalic',
    },
    version: {
        fontSize: 16,
        color: '#5A3921',
        textAlign: 'center',
        marginBottom: 16,
    },
    description: {
        fontSize: 14,
        color: '#5A3921',
        lineHeight: 20,
        marginBottom: 16,
        textAlign: 'center',
    },
    featureList: {
        marginTop: 8,
    },
    featureItem: {
        fontSize: 14,
        color: '#5A3921',
        marginBottom: 4,
    },
});