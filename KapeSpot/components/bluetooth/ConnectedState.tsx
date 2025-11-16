import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import React from "react";
import { PeripheralServices } from "@/types/bluetooth";
import { Feather } from "@expo/vector-icons";

interface ConnectedStateProps {
  bleService: PeripheralServices;
  onRead: () => void;
  onWrite: () => void;
  onDisconnect: (id: string) => void;
}

const ConnectedState: React.FunctionComponent<ConnectedStateProps> = ({
  bleService,
  onDisconnect,
  onRead,
  onWrite,
}) => {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Connection Status Card */}
      <View style={styles.connectedCard}>
        <View style={styles.statusHeader}>
          <View style={styles.statusIcon}>
            <Feather name="check-circle" size={32} color="#16A34A" />
          </View>
          <View style={styles.statusTexts}>
            <Text style={styles.connectedTitle}>Printer Connected</Text>
            <Text style={styles.readyText}>Auto-detected and ready for printing</Text>
          </View>
        </View>

        {/* Auto-detected Service Details */}
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>Auto-detected Service</Text>

          <View style={styles.detailRow}>
            <Feather name="cpu" size={16} color="#007AFF" />
            <Text style={styles.detailLabel}>Service UUID:</Text>
            <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="middle">
              {bleService.serviceId}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Feather name="send" size={16} color="#007AFF" />
            <Text style={styles.detailLabel}>Transfer Characteristic:</Text>
            <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="middle">
              {bleService.transfer}
            </Text>
          </View>

          {bleService.receive && bleService.receive !== bleService.transfer && (
            <View style={styles.detailRow}>
              <Feather name="download" size={16} color="#007AFF" />
              <Text style={styles.detailLabel}>Receive Characteristic:</Text>
              <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="middle">
                {bleService.receive}
              </Text>
            </View>
          )}

          <View style={styles.autoDetectedBadge}>
            <Feather name="zap" size={14} color="#F59E0B" />
            <Text style={styles.autoDetectedText}>Auto-detected</Text>
          </View>
        </View>
      </View>

      {/* Action Buttons Section */}
      <View style={styles.actionsSection}>
        <Text style={styles.sectionTitle}>Printer Actions</Text>

        <View style={styles.actionsGrid}>
          {/* Test Print Button */}
          <TouchableOpacity
            onPress={onWrite}
            style={styles.actionButton}
          >
            <View style={[styles.buttonIcon, styles.printIcon]}>
              <Feather name="printer" size={24} color="#fff" />
            </View>
            <Text style={styles.actionButtonText}>Test Print</Text>
            <Text style={styles.actionDescription}>
              Send test receipt using auto-detected service
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Disconnect Section */}
      <View style={styles.disconnectSection}>
        <TouchableOpacity
          onPress={() => onDisconnect(bleService.peripheralId)}
          style={styles.disconnectButton}
        >
          <Feather name="x" size={20} color="#fff" />
          <Text style={styles.disconnectButtonText}>Disconnect Printer</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default ConnectedState;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  connectedCard: {
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusIcon: {
    marginRight: 16,
  },
  statusTexts: {
    flex: 1,
  },
  connectedTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#16A34A',
    marginBottom: 4,
  },
  readyText: {
    fontSize: 14,
    color: '#666',
  },
  detailsSection: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
    marginLeft: 8,
    marginRight: 8,
    width: 160,
  },
  detailValue: {
    fontSize: 12,
    color: "#333",
    flex: 1,
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  autoDetectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  autoDetectedText: {
    fontSize: 12,
    color: '#D97706',
    fontWeight: '600',
    marginLeft: 6,
  },
  actionsSection: {
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  actionsGrid: {
    gap: 16,
  },
  actionButton: {
    backgroundColor: '#F8FAFC',
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  buttonIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  printIcon: {
    backgroundColor: "#16A34A",
  },
  actionButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 4,
  },
  actionDescription: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
  disconnectSection: {
    alignItems: 'center',
    padding: 20,
  },
  disconnectButton: {
    backgroundColor: "#DC2626",
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
    width: '100%',
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  disconnectButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});