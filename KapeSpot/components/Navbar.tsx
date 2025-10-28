// components/Navbar.tsx
import { StyleSheet, ScrollView, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather } from "@expo/vector-icons";
import { useRouter, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { OfflineSyncService } from '@/lib/offline-sync';

interface NavbarProps {
    activeNav?: string;
}

interface SyncStatus {
    isSyncing: boolean;
    lastSync: number | null;
    pendingItems: number;
}

export default function Navbar({ activeNav }: NavbarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [syncStatus, setSyncStatus] = useState<SyncStatus>({
        isSyncing: false,
        lastSync: null,
        pendingItems: 0
    });

    // Determine active nav based on current route
    const currentActiveNav = activeNav || (pathname === '/pos' ? 'pos' :
        pathname === '/items' ? 'items' : 'pos');

    const navigateTo = (route: '/' | '/pos' | '/items' | '/sales-expense', nav: string) => {
        if (route !== pathname) {
            router.push(route as any);
        }
    };

    useEffect(() => {
        const syncService = OfflineSyncService.getInstance();

        const handleSyncStatusChange = (status: SyncStatus) => {
            setSyncStatus(status);
        };

        syncService.addSyncListener(handleSyncStatusChange);

        return () => {
            syncService.removeSyncListener(handleSyncStatusChange);
        };
    }, []);

    const getSyncIcon = (): { name: keyof typeof Feather.glyphMap; color: string } => {
        if (syncStatus.isSyncing) {
            return { name: 'refresh-cw', color: '#FFA500' }; // Orange for syncing
        } else if (syncStatus.pendingItems > 0) {
            return { name: 'wifi-off', color: '#DC2626' }; // Red for pending items
        } else {
            return { name: 'check-circle', color: '#16A34A' }; // Green for synced
        }
    };

    const syncIcon = getSyncIcon();

    const handleManualSync = async () => {
        const syncService = OfflineSyncService.getInstance();
        await syncService.manualSync();
    };

    return (
        <ThemedView style={styles.navbar}>
            <ThemedText style={styles.navbarTitle}>
                THE <ThemedText style={styles.sectionTitle1}>KAPE </ThemedText> SPOT
            </ThemedText>

            <View style={styles.navbarContent}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.navbarScroll}
                    contentContainerStyle={styles.scrollContent}
                >
                </ScrollView>

                <TouchableOpacity
                    style={styles.navLink}
                    onPress={() => navigateTo('/pos', 'pos')}
                >
                    <Feather
                        name="shopping-cart"
                        size={20}
                        color={currentActiveNav === 'pos' ? '#FFFEEA' : '#FFFEEA'}
                        style={styles.navIcon}
                    />
                    <ThemedText style={[
                        styles.navLinkText,
                        currentActiveNav === 'pos' && styles.activeNavLinkText
                    ]}>
                        POS
                    </ThemedText>
                    {currentActiveNav === 'pos' && <ThemedView style={styles.activeIndicator} />}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navLink}
                    onPress={() => navigateTo('/items', 'items')}
                >
                    <Feather
                        name="package"
                        size={20}
                        color={currentActiveNav === 'items' ? '#FFFEEA' : '#FFFEEA'}
                        style={styles.navIcon}
                    />
                    <ThemedText style={[
                        styles.navLinkText,
                        currentActiveNav === 'items' && styles.activeNavLinkText
                    ]}>
                        Items
                    </ThemedText>
                    {currentActiveNav === 'items' && <ThemedView style={styles.activeIndicator} />}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navLink}
                    onPress={() => console.log('People clicked')}
                >
                    <Feather
                        name="users"
                        size={20}
                        color={currentActiveNav === 'people' ? '#FFFEEA' : '#FFFEEA'}
                        style={styles.navIcon}
                    />
                    <ThemedText style={[
                        styles.navLinkText,
                        currentActiveNav === 'people' && styles.activeNavLinkText
                    ]}>
                        People
                    </ThemedText>
                    {currentActiveNav === 'people' && <ThemedView style={styles.activeIndicator} />}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navLink}
                    onPress={() => navigateTo('/sales-expense', 'sales')}
                >
                    <Feather
                        name="bar-chart-2"
                        size={20}
                        color={currentActiveNav === 'sales' ? '#FFFEEA' : '#FFFEEA'}
                        style={styles.navIcon}
                    />
                    <ThemedText style={[
                        styles.navLinkText,
                        currentActiveNav === 'sales' && styles.activeNavLinkText
                    ]}>
                        Sales & Expense
                    </ThemedText>
                    {currentActiveNav === 'sales' && <ThemedView style={styles.activeIndicator} />}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navLink}
                    onPress={() => console.log('Settings clicked')}
                >
                    <Feather
                        name="settings"
                        size={20}
                        color={currentActiveNav === 'settings' ? '#FFFEEA' : '#FFFEEA'}
                        style={styles.navIcon}
                    />
                    <ThemedText style={[
                        styles.navLinkText,
                        currentActiveNav === 'settings' && styles.activeNavLinkText
                    ]}>
                        Settings
                    </ThemedText>
                    {currentActiveNav === 'settings' && <ThemedView style={styles.activeIndicator} />}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navLink}
                    onPress={() => console.log('Order Status clicked')}
                >
                    <Feather
                        name="clipboard"
                        size={20}
                        color={currentActiveNav === 'order-status' ? '#FFFEEA' : '#FFFEEA'}
                        style={styles.navIcon}
                    />
                    <ThemedText style={[
                        styles.navLinkText,
                        currentActiveNav === 'order-status' && styles.activeNavLinkText
                    ]}>
                        Order Status
                    </ThemedText>
                    {currentActiveNav === 'order-status' && <ThemedView style={styles.activeIndicator} />}
                </TouchableOpacity>

                {/* Sync Indicator */}
                <TouchableOpacity
                    style={styles.syncIndicator}
                    onPress={handleManualSync}
                >
                    <Feather
                        name={syncIcon.name}
                        size={16}
                        color={syncIcon.color}
                    />
                    {syncStatus.pendingItems > 0 && (
                        <ThemedView style={styles.pendingBadge}>
                            <ThemedText style={styles.pendingText}>
                                {syncStatus.pendingItems > 9 ? '9+' : syncStatus.pendingItems}
                            </ThemedText>
                        </ThemedView>
                    )}
                </TouchableOpacity>

                {/* Account Circle - Fixed on the right side */}
                <TouchableOpacity
                    style={styles.accountCircle}
                    onPress={() => console.log('Account clicked')}
                >
                    <Feather
                        name="user"
                        size={20}
                        color="#874E3B"
                    />
                    {currentActiveNav === 'account' && <ThemedView style={styles.activeIndicator} />}
                </TouchableOpacity>
            </View>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    navbar: {
        marginTop: 20,
        flexDirection: 'row',
        paddingHorizontal: 25,
        paddingVertical: 15,
        backgroundColor: 'rgba(135, 78, 59, 0.9)',
        borderBottomColor: '#C77357',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        borderBottomRightRadius: 20,
        borderBottomLeftRadius: 20,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        marginLeft: 5,
        marginRight: 5,
        alignItems: 'center',
    },
    navbarTitle: {
        fontSize: 30,
        fontFamily: 'LobsterTwoRegular',
        color: '#FFFEEA',
        marginRight: 20,
        marginLeft: 30,
        lineHeight: 40
    },
    navbarContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    navbarScroll: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        alignItems: 'center',
    },
    navLink: {
        paddingHorizontal: 15,
        paddingVertical: 10,
        position: 'relative',
        alignItems: 'center',
        flexDirection: 'row',
    },
    navIcon: {
        marginRight: 8,
    },
    navLinkText: {
        fontSize: 17,
        fontFamily: 'LobsterTwoRegular',
        color: '#FFFEEA',
    },
    activeNavLinkText: {
        color: '#FFFEEA',
        fontFamily: 'LobsterTwoRegular',
        textShadowColor: 'rgba(255, 255, 255, 0.8)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    activeIndicator: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: '#FFFEEA',
        borderTopLeftRadius: 2,
        borderTopRightRadius: 2,
    },
    accountCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#FFFEEA',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
        position: 'relative',
    },
    sectionTitle1: {
        fontSize: 35,
        fontFamily: 'LobsterTwoItalic',
        color: '#FFFEEA',
        textShadowColor: 'rgba(255, 215, 0, 0.8)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
        shadowColor: '#FFFEEA',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
        elevation: 10,
    },
    syncIndicator: {
        padding: 8,
        position: 'relative',
        marginLeft: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 20,
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pendingBadge: {
        position: 'absolute',
        top: 2,
        right: 2,
        backgroundColor: '#DC2626',
        borderRadius: 8,
        minWidth: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#FFFEEA',
    },
    pendingText: {
        color: '#FFFEEA',
        fontSize: 8,
        fontWeight: 'bold',
    },
});