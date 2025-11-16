import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import React from "react";
import { StrippedPeripheral } from "@/types/bluetooth";
import PeripheralList from "@/components/bluetooth/PeripheralList";
import { Feather } from "@expo/vector-icons";

interface DisconnectedStateProps {
  peripherals: StrippedPeripheral[];
  isScanning: boolean;
  onScanPress: () => void;
  onConnect: (peripheral: StrippedPeripheral) => Promise<void>;
}

const DisconnectedState: React.FunctionComponent<DisconnectedStateProps> = ({
  isScanning,
  onScanPress,
  peripherals,
  onConnect,
}) => {
  return (
    <View style={styles.container}>
      {/* Header Section */}
      <View style={styles.headerSection}>
        <Feather name="bluetooth" size={32} color="#007AFF" />
        <Text style={styles.title}>Bluetooth Device Scanner</Text>
        <Text style={styles.description}>
          Scan for nearby Bluetooth devices. Connect to printers for receipt printing.
        </Text>
      </View>

      {/* Scan Button */}
      <TouchableOpacity
        style={[
          styles.scanButton,
          isScanning && styles.scanningButton
        ]}
        onPress={onScanPress}
        disabled={isScanning}
      >
        <Feather
          name={isScanning ? "refresh-cw" : "search"}
          size={24}
          color="#fff"
        />
        <Text style={styles.scanButtonText}>
          {isScanning ? "Scanning for Devices..." : "Scan Bluetooth Devices"}
        </Text>
      </TouchableOpacity>

      {/* Results Section */}
      <View style={styles.resultsSection}>
        {peripherals.length > 0 ? (
          <View style={styles.devicesContainer}>
            <View style={styles.resultsHeader}>
              <Text style={styles.devicesFound}>
                📱 Found {peripherals.length} device(s)
              </Text>
              <View style={styles.scanStatus}>
                <View style={[styles.statusDot, isScanning ? styles.scanningDot : styles.idleDot]} />
                <Text style={styles.statusText}>
                  {isScanning ? "Scanning..." : "Ready"}
                </Text>
              </View>
            </View>
            <PeripheralList onConnect={onConnect} peripherals={peripherals} />
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Feather name="bluetooth" size={80} color="#E5E7EB" />
            <Text style={styles.emptyTitle}>No Devices Found</Text>
            <Text style={styles.emptyText}>
              {isScanning
                ? "Searching for Bluetooth devices..."
                : "Press the scan button to discover nearby devices"
              }
            </Text>
            {!isScanning && (
              <View style={styles.tipsContainer}>
                <Text style={styles.tipsTitle}>💡 Tips:</Text>
                <Text style={styles.tip}>• Make sure Bluetooth is enabled</Text>
                <Text style={styles.tip}>• Ensure devices are in pairing mode</Text>
                <Text style={styles.tip}>• Move closer to the device</Text>
                <Text style={styles.tip}>• Some devices may not show UUIDs initially</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

export default DisconnectedState;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginTop: 8,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: "#666",
    textAlign: 'center',
    lineHeight: 20,
  },
  scanButton: {
    backgroundColor: "#007AFF",
    padding: 18,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  scanningButton: {
    backgroundColor: "#0056b3",
  },
  scanButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  resultsSection: {
    flex: 1,
  },
  devicesContainer: {
    flex: 1,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  devicesFound: {
    fontSize: 16,
    color: "#333",
    fontWeight: "600",
  },
  scanStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scanningDot: {
    backgroundColor: "#007AFF",
  },
  idleDot: {
    backgroundColor: "#10B981",
  },
  statusText: {
    fontSize: 12,
    color: "#666",
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    color: "#666",
    marginTop: 16,
    marginBottom: 8,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 14,
    color: "#999",
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  tipsContainer: {
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: 8,
    width: '100%',
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  tip: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
    lineHeight: 16,
  },
});