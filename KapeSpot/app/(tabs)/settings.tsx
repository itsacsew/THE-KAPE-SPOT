import ConnectedState from "@/components/bluetooth/ConnectedState";
import DisconnectedState from "@/components/bluetooth/DisconnectedState";
import { PeripheralServices, StrippedPeripheral } from "@/types/bluetooth";
import { handleAndroidPermissions } from "@/utils/permission";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Platform, Alert, Linking, Modal, TouchableOpacity, ScrollView } from "react-native";
import BleManager, {
    BleDisconnectPeripheralEvent,
    Peripheral,
} from "react-native-ble-manager";
import { OfflineSyncService } from "@/lib/offline-sync";
import { Feather } from "@expo/vector-icons";

const SECONDS_TO_SCAN_FOR = 10;
const SERVICE_UUIDS: string[] = [];
const ALLOW_DUPLICATES = true;

// Common Printer Service UUIDs
const COMMON_PRINTER_SERVICES = [
    "49535343-fe7d-4ae5-8fa9-9fafd205e455", // KPrinter service
    "000018f0-0000-1000-8000-00805f9b34fb", // Standard Printer Service
    "00001101-0000-1000-8000-00805f9b34fb", // SPP Service
    "f0ff", // KPrinter short UUID
    "18f0", // Common printer service
];

// Create a custom type that includes our additional properties
interface CustomPeripheral extends Peripheral {
    connected?: boolean;
    connecting?: boolean;
    serviceUUIDs?: string[];
    retrievedServices?: boolean;
}

const BluetoothDemoScreen: React.FC = () => {
    const [isScanning, setIsScanning] = useState(false);
    const [peripherals, setPeripherals] = useState(
        new Map<Peripheral["id"], CustomPeripheral>()
    );
    const [isConnected, setIsConnected] = useState(false);
    const [bleService, setBleService] = useState<PeripheralServices | undefined>(undefined);
    const [showServiceModal, setShowServiceModal] = useState(false);
    const [availableServices, setAvailableServices] = useState<any[]>([]);
    const [selectedPeripheral, setSelectedPeripheral] = useState<StrippedPeripheral | null>(null);

    useEffect(() => {
        BleManager.start({ showAlert: false })
            .then(() => console.debug("BleManager started."))
            .catch((error: any) =>
                console.error("BeManager could not be started.", error)
            );

        const listeners: any[] = [
            BleManager.onDiscoverPeripheral(handleDiscoverPeripheral),
            BleManager.onStopScan(handleStopScan),
            BleManager.onDisconnectPeripheral(handleDisconnectedPeripheral),
        ];

        handleAndroidPermissions();

        return () => {
            for (const listener of listeners) {
                listener.remove();
            }
        };
    }, []);

    const handleDisconnectedPeripheral = (
        event: BleDisconnectPeripheralEvent
    ) => {
        console.debug(`Device disconnected: ${event.peripheral}`);
        setPeripherals((map) => {
            let p = map.get(event.peripheral);
            if (p) {
                p.connected = false;
                p.connecting = false;
                return new Map(map.set(event.peripheral, p));
            }
            return map;
        });

        // Clear stored connection
        clearBluetoothStorage();
        setBleService(undefined);
        setIsConnected(false);
    };

    const handleDiscoverPeripheral = async (peripheral: Peripheral) => {
        console.debug("Discovered device:", peripheral.name || "Unknown");

        // Try to get more detailed information
        let serviceUUIDs: string[] = [];

        // Method 1: Check advertising data (this is the main source)
        if (peripheral.advertising?.serviceUUIDs) {
            serviceUUIDs = peripheral.advertising.serviceUUIDs;
            console.debug("Found UUIDs in advertising:", serviceUUIDs);
        }

        // Convert to CustomPeripheral
        const customPeripheral: CustomPeripheral = {
            ...peripheral,
            connected: false,
            connecting: false,
            name: peripheral.name || "Unknown Device",
            serviceUUIDs: serviceUUIDs,
            retrievedServices: serviceUUIDs.length > 0
        };

        setPeripherals((map) => {
            return new Map(map.set(peripheral.id, customPeripheral));
        });

        // Try to retrieve services for printer-like devices
        if (isLikelyPrinter(peripheral) && !serviceUUIDs.length) {
            console.debug("Attempting to retrieve services for:", peripheral.name);
            setTimeout(() => attemptServiceRetrieval(peripheral.id), 1000);
        }
    };

    // Function to attempt service retrieval without connecting
    const attemptServiceRetrieval = async (peripheralId: string) => {
        try {
            console.debug("Attempting service retrieval for:", peripheralId);

            const services = await BleManager.retrieveServices(peripheralId);
            console.debug("Retrieved services:", services);

            if (services?.services) {
                // Convert Service[] to string[] (extract UUIDs)
                const serviceUUIDs = (services.services as any[]).map(service => service.uuid);

                setPeripherals((map) => {
                    let p = map.get(peripheralId);
                    if (p) {
                        p.serviceUUIDs = serviceUUIDs;
                        p.retrievedServices = true;
                        return new Map(map.set(peripheralId, p));
                    }
                    return map;
                });
            }
        } catch (error) {
            console.debug("Service retrieval failed (expected without connection):", error);
        }
    };

    // Enhanced printer detection
    const isLikelyPrinter = (peripheral: Peripheral): boolean => {
        const name = peripheral.name?.toLowerCase() || '';
        const localName = peripheral.advertising?.localName?.toLowerCase() || '';

        const printerKeywords = [
            'print', 'prt', 'pos', 'receipt', 'bt', 'bluetooth',
            '58mm', '80mm', 'tsc', 'zebra', 'epson', 'star', 'bixolon',
            'rt', 'rp', 'pm', 'pt', 'thermal', 'kprint'
        ];

        return printerKeywords.some(keyword =>
            name.includes(keyword) || localName.includes(keyword)
        );
    };

    const handleStopScan = () => {
        setIsScanning(false);
        console.debug("Scan stopped.");

        // After scan, try to get services for all devices
        peripherals.forEach((peripheral, id) => {
            if (!peripheral.serviceUUIDs || peripheral.serviceUUIDs.length === 0) {
                setTimeout(() => attemptServiceRetrieval(id), 500);
            }
        });
    };

    // Convert CustomPeripheral to StrippedPeripheral for the component
    const convertToStrippedPeripheral = (peripheral: CustomPeripheral): StrippedPeripheral => {
        // Get all possible UUID sources
        let allUUIDs: string[] = [];

        // Source 1: Advertising UUIDs (main source)
        if (peripheral.advertising?.serviceUUIDs) {
            allUUIDs = [...allUUIDs, ...peripheral.advertising.serviceUUIDs];
        }

        // Source 2: Direct serviceUUIDs property (from retrieval)
        if (peripheral.serviceUUIDs) {
            allUUIDs = [...allUUIDs, ...peripheral.serviceUUIDs];
        }

        // Remove duplicates
        const uniqueUUIDs = Array.from(new Set(allUUIDs));

        return {
            id: peripheral.id,
            name: peripheral.name || null,
            rssi: peripheral.rssi || null,
            connected: peripheral.connected,
            connecting: peripheral.connecting,
            localName: peripheral.advertising?.localName || peripheral.name || undefined,
            serviceUUIDs: uniqueUUIDs.length > 0 ? uniqueUUIDs : undefined,
            retrievedServices: peripheral.retrievedServices
        };
    };

    // Auto-detect printer service and characteristics
    const detectPrinterService = (services: any[]): PeripheralServices | null => {
        console.debug("🔍 Detecting printer services from:", services);

        // Check ALL services for characteristics
        for (const service of services) {
            const serviceUUID = service.uuid;
            console.debug(`🔍 Checking service: ${serviceUUID}`);

            if (service.characteristics && service.characteristics.length > 0) {
                // Log all characteristics for debugging
                service.characteristics.forEach((char: any, index: number) => {
                    console.debug(`   Characteristic ${index}: ${char.uuid}, Properties:`, char.properties);
                });

                const transferChar = findTransferCharacteristic(service.characteristics);

                if (transferChar) {
                    console.debug("✅ Found service with transfer characteristic:", service.uuid);

                    return {
                        peripheralId: "",
                        serviceId: service.uuid,
                        transfer: transferChar,
                        receive: transferChar,
                        allServices: services.map(s => s.uuid)
                    };
                }
            }
        }

        console.debug("❌ No service with transfer characteristics found");
        return null;
    };

    // Find transfer/write characteristic
    const findTransferCharacteristic = (characteristics: any[]): string | null => {
        console.debug("🔍 Looking for transfer characteristic in:", characteristics.length, "characteristics");

        // Look for characteristics with write properties
        for (const char of characteristics) {
            const props = char.properties as any;
            console.debug(`   Checking characteristic: ${char.uuid}, Properties:`, props);

            if (props?.Write || props?.WriteWithoutResponse) {
                console.debug("✅ Found write characteristic:", char.uuid);
                return char.uuid;
            }
        }

        // Use first characteristic as fallback
        if (characteristics.length > 0) {
            console.debug("🟡 Using first available characteristic:", characteristics[0].uuid);
            return characteristics[0].uuid;
        }

        console.debug("❌ No transfer characteristic found");
        return null;
    };

    const connectPeripheral = async (strippedPeripheral: StrippedPeripheral) => {
        try {
            // Find the full peripheral from our map
            const peripheral = peripherals.get(strippedPeripheral.id);
            if (!peripheral) {
                throw new Error("Peripheral not found");
            }

            // Show connecting state
            setPeripherals((map) => {
                let p = map.get(peripheral.id);
                if (p) {
                    p.connecting = true;
                    p.connected = false;
                    return new Map(map.set(p.id, p));
                }
                return map;
            });

            await BleManager.connect(peripheral.id);
            console.debug(`✅ Connected to: ${peripheral.id}`);

            // Wait for connection to stabilize
            await sleep(2000);

            // Get services
            console.debug("🔄 Retrieving services...");
            const peripheralData = await BleManager.retrieveServices(peripheral.id);
            console.debug("📋 Retrieved services:", peripheralData);

            if (!peripheralData.services || peripheralData.services.length === 0) {
                throw new Error("No services found on this device.");
            }

            // Update UUIDs with retrieved services
            const serviceUUIDs = (peripheralData.services as any[]).map(service => service.uuid);

            setPeripherals((map) => {
                let p = map.get(peripheral.id);
                if (p) {
                    p.serviceUUIDs = serviceUUIDs;
                    p.retrievedServices = true;
                    return new Map(map.set(p.id, p));
                }
                return map;
            });

            // Check if services have characteristics
            const servicesWithChars = (peripheralData.services as any[]).filter(service =>
                service.characteristics && service.characteristics.length > 0
            );

            if (servicesWithChars.length > 0) {
                // Auto-detect if services have characteristics
                const detectedService = detectPrinterService(peripheralData.services as any[]);

                if (detectedService) {
                    detectedService.peripheralId = peripheral.id;
                    setBleService(detectedService);
                    setIsConnected(true);
                    await storeBluetoothConnection(peripheral, detectedService);

                    Alert.alert("Printer Connected ✅", "Auto-detected printer service!");

                    // Update peripheral state
                    setPeripherals((map) => {
                        let p = map.get(peripheral.id);
                        if (p) {
                            p.connecting = false;
                            p.connected = true;
                            return new Map(map.set(p.id, p));
                        }
                        return map;
                    });
                } else {
                    throw new Error("Services found but no suitable printer service detected.");
                }
            } else {
                // No characteristics found - show manual service selection
                console.debug("🔄 No characteristics found, showing manual selection");
                setSelectedPeripheral(strippedPeripheral);
                setAvailableServices(peripheralData.services as any[]);
                setShowServiceModal(true);

                // Keep connecting state until user selects service
                return;
            }

        } catch (error) {
            console.error("Connection error:", error);

            // Disconnect if connection failed
            try {
                await BleManager.disconnect(strippedPeripheral.id);
            } catch (disconnectError) {
                // Ignore disconnect errors
            }

            Alert.alert("Connection Failed ❌", error instanceof Error ? error.message : "Could not connect to device");

            // Reset connection state
            setPeripherals((map) => {
                let p = map.get(strippedPeripheral.id);
                if (p) {
                    p.connecting = false;
                    p.connected = false;
                    return new Map(map.set(p.id, p));
                }
                return map;
            });
        }
    };

    // Manual service selection for KPrinter
    const handleServiceSelect = async (service: any) => {
        if (!selectedPeripheral) return;

        try {
            console.debug("🔄 Selecting service for KPrinter:", service.uuid);

            // For KPrinter with no characteristics, use common thermal printer settings
            const serviceConfig: PeripheralServices = {
                peripheralId: selectedPeripheral.id,
                serviceId: service.uuid,
                transfer: "49535343-8841-43f4-a8d4-ecbe34729bb3", // Common write characteristic for thermal printers
                receive: "49535343-1e4d-4bd9-ba61-23c647249616", // Common read characteristic
                allServices: availableServices.map(s => s.uuid)
            };

            setBleService(serviceConfig);
            setIsConnected(true);

            // Find the full peripheral
            const peripheral = peripherals.get(selectedPeripheral.id);
            if (peripheral) {
                await storeBluetoothConnection(peripheral, serviceConfig);
            }

            setShowServiceModal(false);
            setSelectedPeripheral(null);

            Alert.alert(
                "Service Selected ✅",
                `Using service: ${service.uuid}\n\nKPrinter connected! Try test printing.`
            );

            // Update peripheral state
            setPeripherals((map) => {
                let p = map.get(selectedPeripheral.id);
                if (p) {
                    p.connecting = false;
                    p.connected = true;
                    return new Map(map.set(p.id, p));
                }
                return map;
            });

        } catch (error) {
            console.error("Service selection error:", error);
            Alert.alert("Error", "Failed to select service. Please try another one.");
        }
    };

    const storeBluetoothConnection = async (peripheral: CustomPeripheral, service: PeripheralServices) => {
        try {
            const syncService = OfflineSyncService.getInstance();
            await syncService.setItem('bluetoothConnection', JSON.stringify({
                connected: true,
                deviceName: peripheral.name || 'Bluetooth Device',
                peripheralId: peripheral.id,
                serviceId: service.serviceId,
                transferChar: service.transfer,
                receiveChar: service.receive,
                connectedAt: new Date().toISOString(),
                serviceUUIDs: peripheral.serviceUUIDs || [],
                autoDetected: true
            }));

            await syncService.setItem('bluetoothService', JSON.stringify({
                peripheralId: peripheral.id,
                serviceId: service.serviceId,
                transfer: service.transfer,
                receive: service.receive,
                allServices: service.allServices || []
            }));

            console.debug('✅ Bluetooth connection stored');
        } catch (error) {
            console.error('Storage error:', error);
        }
    };

    const clearBluetoothStorage = async () => {
        try {
            const syncService = OfflineSyncService.getInstance();
            await syncService.setItem('bluetoothConnection', JSON.stringify({
                connected: false,
                deviceName: '',
                peripheralId: '',
                serviceId: '',
                connectedAt: null,
                serviceUUIDs: [],
                autoDetected: false
            }));
            await syncService.setItem('bluetoothService', '');
            console.debug('Bluetooth connection cleared');
        } catch (error) {
            console.error('Clear storage error:', error);
        }
    };

    const disconnectPeripheral = async (peripheralId: string) => {
        try {
            await BleManager.disconnect(peripheralId);
            await clearBluetoothStorage();
            setBleService(undefined);
            setPeripherals(new Map());
            setIsConnected(false);
            Alert.alert("Disconnected", "Device disconnected successfully");
        } catch (error) {
            console.error("Disconnection error:", error);
        }
    };

    function sleep(ms: number) {
        return new Promise<void>((resolve) => setTimeout(resolve, ms));
    }

    const startScan = async () => {
        if (!isScanning) {
            setPeripherals(new Map<Peripheral["id"], CustomPeripheral>());
            try {
                console.debug("Starting scan with latest method...");
                setIsScanning(true);

                // LATEST VERSION METHOD - Single options object
                await BleManager.scan({
                    serviceUUIDs: SERVICE_UUIDS,
                    seconds: SECONDS_TO_SCAN_FOR,
                    allowDuplicates: ALLOW_DUPLICATES,
                    scanMode: 2, // SCAN_MODE_LOW_LATENCY
                    matchMode: 1, // MATCH_MODE_AGGRESSIVE
                    callbackType: 1, // CALLBACK_TYPE_ALL_MATCHES
                });

                console.debug("Scan started successfully with latest method");

                // Auto stop after timeout (as backup)
                setTimeout(() => {
                    BleManager.stopScan().then(() => {
                        console.debug("Scan stopped automatically");
                        setIsScanning(false);
                    });
                }, SECONDS_TO_SCAN_FOR * 1000);

            } catch (error) {
                console.error("Scan error:", error);
                setIsScanning(false);

                // Show specific error message
                if (error instanceof Error) {
                    Alert.alert("Scan Failed", error.message);
                } else {
                    Alert.alert("Scan Failed", "Could not start Bluetooth scan");
                }
            }
        }
    };

    // Enhanced test print for KPrinter
    const testPrint = async () => {
        if (!bleService) {
            Alert.alert("No Connection", "Please connect to a device first");
            return;
        }

        try {
            console.log('🖨️ Starting KPrinter test print...');

            // Thermal printer ESC/POS commands
            const esc = 0x1B;
            const gs = 0x1D;
            const fs = 0x1C;

            let printData: number[] = [];

            // Initialize printer
            printData.push(esc, 0x40); // Initialize

            // Set alignment to center
            printData.push(esc, 0x61, 0x01); // Center alignment

            // Title with larger text
            printData.push(gs, 0x21, 0x22); // Double height and width
            printData.push(...stringToBytes("THE KAPE SPOT"));
            printData.push(0x0A); // Line feed

            // Reset text size
            printData.push(gs, 0x21, 0x00);

            printData.push(...stringToBytes("------------"));
            printData.push(0x0A);

            printData.push(esc, 0x61, 0x01); // Center alignment
            printData.push(...stringToBytes("TEST RECEIPT"));
            printData.push(0x0A);

            printData.push(...stringToBytes("------------"));
            printData.push(0x0A);

            // Left alignment for items
            printData.push(esc, 0x61, 0x00); // Left alignment
            printData.push(...stringToBytes("Item: Test Coffee"));
            printData.push(0x0A);
            printData.push(...stringToBytes("Qty: 1"));
            printData.push(0x0A);
            printData.push(...stringToBytes("Price: ₱100.00"));
            printData.push(0x0A);

            printData.push(...stringToBytes("------------"));
            printData.push(0x0A);

            // Bold for total
            printData.push(esc, 0x45, 0x01); // Bold on
            printData.push(...stringToBytes("TOTAL: ₱100.00"));
            printData.push(esc, 0x45, 0x00); // Bold off
            printData.push(0x0A);

            printData.push(...stringToBytes("------------"));
            printData.push(0x0A);

            // Center alignment for thank you
            printData.push(esc, 0x61, 0x01); // Center alignment
            printData.push(...stringToBytes("Thank you!"));
            printData.push(0x0A);

            // Feed paper and cut
            printData.push(0x0A, 0x0A, 0x0A); // Multiple line feeds
            printData.push(gs, 0x56, 0x41, 0x10); // Paper cut

            console.log('📤 Sending print data to KPrinter...');
            console.log('Service:', bleService.serviceId);
            console.log('Data length:', printData.length);

            // Try different write methods for KPrinter
            try {
                // Method 1: Standard write
                await BleManager.write(
                    bleService.peripheralId,
                    bleService.serviceId,
                    bleService.transfer,
                    printData
                );
                console.log('✅ Print sent successfully!');
                Alert.alert("Print Test ✅", "Test receipt sent to KPrinter!");
            } catch (error1) {
                console.log('🔄 Method 1 failed, trying Method 2...', error1);

                // Method 2: Try without response
                try {
                    await BleManager.writeWithoutResponse(
                        bleService.peripheralId,
                        bleService.serviceId,
                        bleService.transfer,
                        printData
                    );
                    console.log('✅ Print sent successfully (Method 2)!');
                    Alert.alert("Print Test ✅", "Test receipt sent to KPrinter!");
                } catch (error2) {
                    console.log('🔄 Method 2 failed, trying Method 3...', error2);

                    // Method 3: Try in chunks
                    const chunkSize = 20;
                    for (let i = 0; i < printData.length; i += chunkSize) {
                        const chunk = printData.slice(i, i + chunkSize);
                        await BleManager.writeWithoutResponse(
                            bleService.peripheralId,
                            bleService.serviceId,
                            bleService.transfer,
                            chunk
                        );
                        await sleep(50); // Small delay between chunks
                    }
                    console.log('✅ Print sent successfully (Method 3)!');
                    Alert.alert("Print Test ✅", "Test receipt sent to KPrinter!");
                }
            }

        } catch (error) {
            console.error('❌ Print error:', error);
            Alert.alert("Print Failed ❌", "Could not send print command to KPrinter");
        }
    };

    // Helper function to convert string to bytes
    const stringToBytes = (str: string): number[] => {
        const bytes: number[] = [];
        for (let i = 0; i < str.length; i++) {
            bytes.push(str.charCodeAt(i));
        }
        return bytes;
    };

    // Simple read function
    const testRead = async () => {
        if (bleService) {
            try {
                const value = await BleManager.read(
                    bleService.peripheralId,
                    bleService.serviceId,
                    bleService.receive
                );
                console.log('Read value:', value);
                Alert.alert("Read Test", "Read operation completed");
            } catch (error) {
                console.error('Read error:', error);
            }
        }
    };

    // Convert all peripherals to StrippedPeripheral for the component
    const strippedPeripherals: StrippedPeripheral[] = Array.from(peripherals.values()).map(
        convertToStrippedPeripheral
    );

    return (
        <View style={styles.container}>
            <Text style={styles.header}>Printer Connection</Text>
            <Text style={styles.subtitle}>KPrinter Manual Selection Supported</Text>

            {!isConnected ? (
                <DisconnectedState
                    peripherals={strippedPeripherals}
                    isScanning={isScanning}
                    onScanPress={startScan}
                    onConnect={connectPeripheral}
                />
            ) : (
                bleService && (
                    <ConnectedState
                        onRead={testRead}
                        onWrite={testPrint}
                        bleService={bleService}
                        onDisconnect={disconnectPeripheral}
                    />
                )
            )}

            {/* Manual Service Selection Modal */}
            <Modal
                visible={showServiceModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowServiceModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Feather name="printer" size={24} color="#007AFF" />
                            <Text style={styles.modalTitle}>Select Printer Service</Text>
                        </View>

                        <Text style={styles.modalSubtitle}>
                            Select a service to use for KPrinter printing:
                        </Text>

                        <ScrollView style={styles.servicesList}>
                            {availableServices.map((service, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[
                                        styles.serviceItem,
                                        COMMON_PRINTER_SERVICES.includes(service.uuid.toLowerCase()) && styles.recommendedService
                                    ]}
                                    onPress={() => handleServiceSelect(service)}
                                >
                                    <View style={styles.serviceHeader}>
                                        <Text style={styles.serviceUUID}>{service.uuid}</Text>
                                        {COMMON_PRINTER_SERVICES.includes(service.uuid.toLowerCase()) && (
                                            <View style={styles.recommendedBadge}>
                                                <Feather name="star" size={12} color="#FFFFFF" />
                                                <Text style={styles.recommendedText}>Recommended</Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.serviceInfo}>
                                        {service.characteristics && service.characteristics.length > 0
                                            ? `📊 ${service.characteristics.length} characteristics`
                                            : '📝 No characteristics (KPrinter)'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => {
                                setShowServiceModal(false);
                                setSelectedPeripheral(null);
                                // Disconnect since user cancelled
                                if (selectedPeripheral) {
                                    disconnectPeripheral(selectedPeripheral.id);
                                }
                            }}
                        >
                            <Text style={styles.cancelButtonText}>Cancel Connection</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f5f5f5",
        padding: 20,
    },
    header: {
        fontSize: 24,
        fontWeight: "bold",
        marginBottom: 8,
        color: "#333",
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: "#666",
        marginBottom: 20,
        textAlign: 'center',
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        maxHeight: '80%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 8,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginLeft: 12,
        color: '#333',
        flex: 1,
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#666',
        marginBottom: 20,
        lineHeight: 20,
    },
    servicesList: {
        maxHeight: 300,
        marginBottom: 20,
    },
    serviceItem: {
        backgroundColor: '#f8f9fa',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 2,
        borderColor: '#e9ecef',
    },
    recommendedService: {
        borderColor: '#007AFF',
        backgroundColor: '#F0F8FF',
    },
    serviceHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    serviceUUID: {
        fontSize: 12,
        fontFamily: 'monospace',
        color: '#333',
        flex: 1,
    },
    recommendedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#007AFF',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginLeft: 8,
    },
    recommendedText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '600',
        marginLeft: 4,
    },
    serviceInfo: {
        fontSize: 12,
        color: '#666',
    },
    cancelButton: {
        backgroundColor: '#6c757d',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default BluetoothDemoScreen;