import { StrippedPeripheral } from "@/types/bluetooth";
import React from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
import { Feather } from "@expo/vector-icons";

interface PeripheralListProps {
  peripherals: StrippedPeripheral[];
  onConnect: (peripheral: StrippedPeripheral) => Promise<void>;
}

const PeripheralList: React.FC<PeripheralListProps> = ({
  peripherals,
  onConnect,
}) => {
  const formatUUIDs = (peripheral: StrippedPeripheral): { text: string, source: string } => {
    if (!peripheral.serviceUUIDs || peripheral.serviceUUIDs.length === 0) {
      return {
        text: "No UUIDs detected",
        source: "❌ Not advertised"
      };
    }

    const uuidText = peripheral.serviceUUIDs.slice(0, 3).join("\n");
    const source = peripheral.retrievedServices ? "✅ Retrieved" : "📡 Advertised";

    return { text: uuidText, source };
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={peripherals}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const uuidInfo = formatUUIDs(item);

          return (
            <TouchableOpacity onPress={() => onConnect(item)} style={styles.card}>
              {/* Device Header */}
              <View style={styles.deviceHeader}>
                <Text style={styles.deviceName}>{item.name ?? "Unknown Device"}</Text>
                <View style={styles.statusContainer}>
                  {item.connecting && <Text style={styles.connectingBadge}>🟡 Connecting</Text>}
                  {item.connected && <Text style={styles.connectedBadge}>🟢 Connected</Text>}
                </View>
              </View>

              {/* UUID Information */}
              <View style={styles.uuidSection}>
                <View style={styles.uuidHeader}>
                  <Feather name="hash" size={14} color="#007AFF" />
                  <Text style={styles.uuidTitle}>Service UUIDs:</Text>
                  <Text style={[styles.uuidSource,
                  uuidInfo.source.includes("✅") ? styles.uuidRetrieved : styles.uuidAdvertised
                  ]}>
                    {uuidInfo.source}
                  </Text>
                </View>
                <Text style={styles.uuidText}>{uuidInfo.text}</Text>
              </View>

              {/* Other Details */}
              <View style={styles.detailsGrid}>
                <View style={styles.detailItem}>
                  <Feather name="wifi" size={12} color="#666" />
                  <Text style={styles.detailLabel}>Signal:</Text>
                  <Text style={styles.detailValue}>{item.rssi ?? "N/A"} dBm</Text>
                </View>

                <View style={styles.detailItem}>
                  <Feather name="type" size={12} color="#666" />
                  <Text style={styles.detailLabel}>Local:</Text>
                  <Text style={styles.detailValue}>{item.localName ?? "N/A"}</Text>
                </View>
              </View>

              {/* Device ID */}
              <Text style={styles.deviceId}>ID: {item.id}</Text>

              {/* Connect Button */}
              <TouchableOpacity
                style={[
                  styles.connectButton,
                  (item.connecting || item.connected) && styles.connectButtonDisabled
                ]}
                onPress={() => onConnect(item)}
                disabled={item.connecting || item.connected}
              >
                <Feather
                  name={item.connected ? "check" : item.connecting ? "refresh-cw" : "link"}
                  size={16}
                  color="#fff"
                />
                <Text style={styles.connectButtonText}>
                  {item.connected ? "Connected" : item.connecting ? "Connecting..." : "Connect & Get UUIDs"}
                </Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    backgroundColor: "#fff",
    padding: 16,
    marginVertical: 8,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    flex: 1,
  },
  statusContainer: {
    alignItems: 'flex-end',
  },
  connectingBadge: {
    fontSize: 10,
    color: "#F59E0B",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    fontWeight: "500",
  },
  connectedBadge: {
    fontSize: 10,
    color: "#16A34A",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    fontWeight: "500",
  },
  uuidSection: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  uuidHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  uuidTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#007AFF",
    marginLeft: 6,
    marginRight: 8,
  },
  uuidSource: {
    fontSize: 10,
    fontWeight: "500",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  uuidRetrieved: {
    backgroundColor: "#DCFCE7",
    color: "#16A34A",
  },
  uuidAdvertised: {
    backgroundColor: "#DBEAFE",
    color: "#1D4ED8",
  },
  uuidText: {
    fontSize: 10,
    color: "#334155",
    fontFamily: 'monospace',
    lineHeight: 14,
  },
  detailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  detailLabel: {
    fontSize: 10,
    color: "#666",
    fontWeight: "500",
    marginLeft: 4,
    marginRight: 2,
  },
  detailValue: {
    fontSize: 10,
    color: "#333",
    fontWeight: "500",
  },
  deviceId: {
    fontSize: 9,
    color: "#888",
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  connectButton: {
    backgroundColor: "#007AFF",
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  connectButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  connectButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default PeripheralList;