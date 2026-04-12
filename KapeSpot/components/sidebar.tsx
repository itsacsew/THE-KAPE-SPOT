// components/sidebar.tsx
import {
    StyleSheet,
    TouchableOpacity,
    View,
    Alert,
    Modal,
    TouchableWithoutFeedback,
    TextInput,
    useWindowDimensions,
    Animated,
    Dimensions,
    ScrollView,
    Platform
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter, usePathname } from 'expo-router';
import { useEffect, useState, useRef } from 'react';
import { OfflineSyncService } from '@/lib/offline-sync';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    getFirestore,
    collection,
    query,
    where,
    getDocs,
    doc,
    updateDoc,
    getDoc
} from 'firebase/firestore';
import { getAuth, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { app } from '@/lib/firebase-config';
import { NetworkScanner } from '@/lib/network-scanner';
import { LinearGradient } from 'expo-linear-gradient';

const { width: screenWidth } = Dimensions.get('window');

interface SyncStatus {
    isSyncing: boolean;
    lastSync: number | null;
    pendingItems: number;
}

interface User {
    id: string;
    username: string;
    role: 'user' | 'admin';
    name: string;
    firebaseUID?: string;
}

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    onInventorySubMenuChange?: (subMenu: 'food-items' | 'categories' | 'cups') => void;
}

export default function Sidebar({ isOpen, onClose, onInventorySubMenuChange }: SidebarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { width } = useWindowDimensions();
    const [syncStatus, setSyncStatus] = useState<SyncStatus>({
        isSyncing: false,
        lastSync: null,
        pendingItems: 0
    });
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isFirebaseOnline, setIsFirebaseOnline] = useState<boolean>(false);
    const [isCheckingConnection, setIsCheckingConnection] = useState<boolean>(true);
    const [isBluetoothConnected, setIsBluetoothConnected] = useState<boolean>(false);
    const [bluetoothDeviceName, setBluetoothDeviceName] = useState<string>('');
    
    // New state for dropdown
    const [isInventoryOpen, setIsInventoryOpen] = useState(false);
    const [selectedInventorySubMenu, setSelectedInventorySubMenu] = useState<'food-items' | 'categories' | 'cups'>('food-items');

    // Animation values
    const slideAnim = useRef(new Animated.Value(-300)).current;
    const overlayAnim = useRef(new Animated.Value(0)).current;

    const db = getFirestore(app);
    const auth = getAuth(app);

    const sidebarWidth = width < 768 ? width * 0.60 : 240;

    // Handle sidebar animations
    useEffect(() => {
        if (isOpen) {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(overlayAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                })
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: -sidebarWidth,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(overlayAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                })
            ]).start();
        }
    }, [isOpen, sidebarWidth]);

    // Load current user data
    useEffect(() => {
        const loadCurrentUser = async () => {
            try {
                const syncService = OfflineSyncService.getInstance();
                const userData = await syncService.getItem('currentUser');
                if (userData) {
                    setCurrentUser(JSON.parse(userData));
                }
            } catch (error) {
                console.error('Error loading user data:', error);
            }
        };

        loadCurrentUser();
    }, []);

    // Check Bluetooth connection status
    useEffect(() => {
        const checkBluetoothConnection = async () => {
            try {
                const syncService = OfflineSyncService.getInstance();
                const bluetoothInfo = await syncService.getItem('bluetoothConnection');

                if (bluetoothInfo) {
                    const connectionData = JSON.parse(bluetoothInfo);
                    setIsBluetoothConnected(connectionData.connected || false);
                    setBluetoothDeviceName(connectionData.deviceName || 'Bluetooth Device');
                }
            } catch (error) {
                console.error('Error checking Bluetooth connection:', error);
            }
        };

        checkBluetoothConnection();
        const intervalId = setInterval(checkBluetoothConnection, 3000);

        return () => {
            clearInterval(intervalId);
        };
    }, []);

    // Check Firebase connection status
    useEffect(() => {
        let isMounted = true;

        const checkFirebaseConnection = async () => {
            if (!isMounted) return;

            setIsCheckingConnection(true);
            try {
                const connectionMode = await NetworkScanner.getApiBaseUrl();
                const isOnline = connectionMode === 'online';

                if (isMounted) {
                    setIsFirebaseOnline(isOnline);
                }
            } catch (error) {
                console.error('Error checking Firebase connection:', error);
                if (isMounted) {
                    setIsFirebaseOnline(false);
                }
            } finally {
                if (isMounted) {
                    setIsCheckingConnection(false);
                }
            }
        };

        checkFirebaseConnection();

        const connectionListener = (isConnected: boolean, mode: 'online' | 'offline') => {
            if (!isMounted) return;
            setIsFirebaseOnline(isConnected);
        };

        NetworkScanner.addConnectionListener(connectionListener);

        const intervalId = setInterval(() => {
            if (isMounted) {
                checkFirebaseConnection();
            }
        }, 10000);

        return () => {
            isMounted = false;
            NetworkScanner.removeConnectionListener(connectionListener);
            clearInterval(intervalId);
        };
    }, []);

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
            return { name: 'refresh-cw', color: '#FFA500' };
        } else if (syncStatus.pendingItems > 0) {
            return { name: 'wifi-off', color: '#DC2626' };
        } else {
            return { name: 'check-circle', color: '#16A34A' };
        }
    };

    const syncIcon = getSyncIcon();

    const handleManualSync = async () => {
        const syncService = OfflineSyncService.getInstance();
        await syncService.manualSync();
    };

    const handleLogout = async () => {
        Alert.alert(
            'Logout',
            'Are you sure you want to logout?',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                    onPress: () => setShowAccountMenu(false)
                },
                {
                    text: 'Logout',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await auth.signOut();
                            await AsyncStorage.removeItem('currentUser');
                            setCurrentUser(null);
                            setShowAccountMenu(false);
                            onClose();
                            router.replace('/login');
                            Alert.alert('Logged Out', 'You have been successfully logged out.');
                        } catch (error) {
                            console.error('Logout error:', error);
                            Alert.alert('Error', 'Failed to logout. Please try again.');
                        }
                    }
                }
            ]
        );
    };

    // Show profile when avatar is clicked
    const handleAvatarPress = () => {
        Alert.alert(
            'User Profile',
            `Name: ${currentUser?.name || 'User'}\nUsername: ${currentUser?.username || 'username'}\nRole: ${currentUser?.role ? currentUser.role.toUpperCase() : 'Role'}`,
            [{ text: 'OK' }]
        );
    };

    const handleChangePassword = () => {
        setShowChangePassword(true);
    };

    const handleSavePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        if (newPassword !== confirmPassword) {
            Alert.alert('Error', 'New passwords do not match');
            return;
        }

        if (newPassword.length < 6) {
            Alert.alert('Error', 'Password must be at least 6 characters long');
            return;
        }

        try {
            const syncService = OfflineSyncService.getInstance();
            const userData = await syncService.getItem('currentUser');

            if (!userData) {
                Alert.alert('Error', 'User not found');
                return;
            }

            const user = JSON.parse(userData);
            const currentAuthUser = auth.currentUser;

            if (!currentAuthUser) {
                Alert.alert(
                    'Offline Mode',
                    'Cannot change password while offline. Please connect to the internet to change your password.',
                    [{ text: 'OK' }]
                );
                return;
            }

            try {
                const credential = EmailAuthProvider.credential(
                    currentAuthUser.email || `${user.username}@kapespot.com`,
                    currentPassword
                );

                await reauthenticateWithCredential(currentAuthUser, credential);
                await updatePassword(currentAuthUser, newPassword);

                Alert.alert('Success', 'Password changed successfully');
                setShowChangePassword(false);
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');

            } catch (firebaseError: any) {
                console.error('Firebase password change error:', firebaseError);

                if (firebaseError.code === 'auth/wrong-password') {
                    Alert.alert('Error', 'Current password is incorrect');
                } else if (firebaseError.code === 'auth/requires-recent-login') {
                    Alert.alert('Error', 'Please log in again to change your password');
                } else {
                    Alert.alert('Error', 'Failed to change password. Please try again.');
                }
            }

        } catch (error) {
            console.error('Password change error:', error);
            Alert.alert('Error', 'Failed to change password. Please try again.');
        }
    };

    const handleClosePasswordModal = () => {
        setShowChangePassword(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
    };

    const checkFirebaseOnline = () => {
        return isFirebaseOnline;
    };

    const handleRefreshConnection = async () => {
        setIsCheckingConnection(true);
        try {
            const result = await NetworkScanner.refreshConnection();
            setIsFirebaseOnline(result.isConnected);
        } catch (error) {
            console.error('Manual connection refresh failed:', error);
        } finally {
            setIsCheckingConnection(false);
        }
    };

    const handleNavigateToBluetoothSettings = () => {
        onClose();
        router.push('/settings');
    };

    const handleNavigate = (route: string) => {
        onClose();
        router.push(route as any);
    };

    // Handle Inventory item click - toggles dropdown
    const handleInventoryPress = () => {
        setIsInventoryOpen(!isInventoryOpen);
    };

    // Handle sub-menu selection
    const handleInventorySubMenuSelect = (subMenu: 'food-items' | 'categories' | 'cups') => {
        setSelectedInventorySubMenu(subMenu);
        
        // First navigate to items page
        router.push('/items' as any);
        
        // Then notify Items page to change active sidebar
        if (onInventorySubMenuChange) {
            onInventorySubMenuChange(subMenu);
        }
        
        onClose();
    };

    // Check if we're on items page to highlight inventory
    const isOnItemsPage = pathname === '/items';

    // Helper function to check if a nav item is active
    const isNavActive = (key: string) => {
        if (key === 'inventory') {
            return pathname === '/items';
        }
        if (key === 'pos') return pathname === '/pos';
        if (key === 'order-status') return pathname === '/orderStatus';
        if (key === 'log') return pathname === '/log';
        if (key === 'sales') return pathname === '/sales-expense';
        if (key === 'settings') return pathname === '/settings';
        return false;
    };

    // Navigation items configuration
    const mainNavItems = [
        { key: 'pos', route: '/pos', icon: 'shopping-cart', label: 'POS' },
        { key: 'order-status', route: '/orderStatus', icon: 'clipboard', label: 'Order Status' },
        { key: 'log', route: '/log', icon: 'archive', label: 'Log' }, // ADDED LOG BUTTON HERE
        { key: 'sales', route: '/sales-expense', icon: 'bar-chart-2', label: 'Expenses' },
        { key: 'settings', route: '/settings', icon: 'settings', label: 'Settings' },
    ];

    // Inventory submenu items
    const inventorySubItems = [
        { key: 'food-items', icon: 'grid', label: 'Food Items' },
        { key: 'categories', icon: 'folder', label: 'Categories' },
        { key: 'cups', icon: 'coffee', label: 'Cups' },
    ];

    return (
        <>
            {/* Overlay */}
            <Animated.View
                style={[
                    styles.overlay,
                    {
                        opacity: overlayAnim,
                        pointerEvents: isOpen ? 'auto' : 'none'
                    }
                ]}
            >
                <TouchableWithoutFeedback onPress={onClose}>
                    <View style={styles.overlayTouchable} />
                </TouchableWithoutFeedback>
            </Animated.View>

            {/* Sidebar */}
            <Animated.View
                style={[
                    styles.sidebar,
                    {
                        width: sidebarWidth,
                        transform: [{ translateX: slideAnim }]
                    }
                ]}
            >
                <LinearGradient
                    colors={['#dfccaf', '#d4be9a']}
                    style={styles.sidebarGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <ScrollView 
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.scrollContent}
                    >
                        {/* Header Section */}
                        <View style={styles.headerSection}>
                            <View style={styles.logoContainer}>
                                <MaterialCommunityIcons name="coffee" size={40} color="#854442" />
                                <ThemedText style={styles.logoText}>KapeSpot</ThemedText>
                            </View>
                            <View style={styles.divider} />
                        </View>

                        {/* User Info Section - Avatar clickable for profile */}
                        <TouchableOpacity style={styles.userSection} onPress={handleAvatarPress}>
                            <View style={styles.userAvatar}>
                                <Feather name="user" size={28} color="#854442" />
                            </View>
                            <ThemedText style={styles.userName}>{currentUser?.name || 'User'}</ThemedText>
                            <ThemedText style={styles.userRole}>
                                {currentUser?.role ? `${currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)}` : 'Role'}
                            </ThemedText>
                        </TouchableOpacity>

                        <View style={styles.menuSeparator} />

                        {/* Navigation Items - POS, Order Status, LOG, Expenses, Settings */}
                        <View style={styles.navSection}>
                            {mainNavItems.map((item) => (
                                <TouchableOpacity
                                    key={item.key}
                                    style={[
                                        styles.navItem,
                                        isNavActive(item.key) && styles.navItemActive
                                    ]}
                                    onPress={() => handleNavigate(item.route)}
                                >
                                    <Feather
                                        name={item.icon as keyof typeof Feather.glyphMap}
                                        size={20}
                                        color={isNavActive(item.key) ? '#dfccaf' : '#854442'}
                                        style={styles.navIcon}
                                    />
                                    <ThemedText style={[
                                        styles.navText,
                                        isNavActive(item.key) && styles.navTextActive
                                    ]}>
                                        {item.label}
                                    </ThemedText>
                                    {isNavActive(item.key) && <View style={styles.activeNavIndicator} />}
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* INVENTORY DROPDOWN ITEM */}
                        <View style={styles.inventoryContainer}>
                            <TouchableOpacity
                                style={[
                                    styles.navItem,
                                    (isNavActive('inventory') || isInventoryOpen) && styles.navItemActive
                                ]}
                                onPress={handleInventoryPress}
                            >
                                <Feather
                                    name="package"
                                    size={20}
                                    color={(isNavActive('inventory') || isInventoryOpen) ? '#dfccaf' : '#854442'}
                                    style={styles.navIcon}
                                />
                                <ThemedText style={[
                                    styles.navText,
                                    (isNavActive('inventory') || isInventoryOpen) && styles.navTextActive
                                ]}>
                                    Inventory
                                </ThemedText>
                                <Feather
                                    name={isInventoryOpen ? "chevron-up" : "chevron-down"}
                                    size={16}
                                    color={(isNavActive('inventory') || isInventoryOpen) ? '#dfccaf' : '#854442'}
                                    style={styles.dropdownIcon}
                                />
                                {(isNavActive('inventory') && !isInventoryOpen) && <View style={styles.activeNavIndicator} />}
                            </TouchableOpacity>

                            {/* Dropdown Sub-menu */}
                            {isInventoryOpen && (
                                <View style={styles.dropdownMenu}>
                                    {inventorySubItems.map((subItem) => (
                                        <TouchableOpacity
                                            key={subItem.key}
                                            style={[
                                                styles.dropdownItem,
                                                selectedInventorySubMenu === subItem.key && styles.dropdownItemActive
                                            ]}
                                            onPress={() => handleInventorySubMenuSelect(subItem.key as 'food-items' | 'categories' | 'cups')}
                                        >
                                            <Feather
                                                name={subItem.icon as keyof typeof Feather.glyphMap}
                                                size={16}
                                                color={selectedInventorySubMenu === subItem.key ? '#dfccaf' : '#854442'}
                                                style={styles.dropdownItemIcon}
                                            />
                                            <ThemedText style={[
                                                styles.dropdownItemText,
                                                selectedInventorySubMenu === subItem.key && styles.dropdownItemTextActive
                                            ]}>
                                                {subItem.label}
                                            </ThemedText>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>

                        <View style={styles.menuSeparator} />

                        {/* Status Indicators - Sync & Online Status - Below Inventory */}
                        <View style={styles.statusSection}>
                            <View style={styles.statusRow}>
                                <TouchableOpacity style={styles.statusIconButton} onPress={handleManualSync}>
                                    {syncStatus.isSyncing ? (
                                        <Feather name="refresh-cw" size={22} color="#FFA500" />
                                    ) : syncStatus.pendingItems > 0 ? (
                                        <View style={styles.syncIconWithBadge}>
                                            <Feather name="wifi-off" size={22} color="#DC2626" />
                                            <View style={styles.smallBadge}>
                                                <ThemedText style={styles.smallBadgeText}>
                                                    {syncStatus.pendingItems > 9 ? '9+' : syncStatus.pendingItems}
                                                </ThemedText>
                                            </View>
                                        </View>
                                    ) : (
                                        <Feather name="check-circle" size={22} color="#16A34A" />
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.statusIconButton} onPress={handleRefreshConnection}>
                                    {isCheckingConnection ? (
                                        <Feather name="refresh-cw" size={22} color="#FFA500" />
                                    ) : (
                                        <Feather
                                            name={checkFirebaseOnline() ? "wifi" : "wifi-off"}
                                            size={22}
                                            color={checkFirebaseOnline() ? '#16A34A' : '#DC2626'}
                                        />
                                    )}
                                </TouchableOpacity>

                                {isBluetoothConnected && (
                                    <TouchableOpacity style={styles.statusIconButton} onPress={handleNavigateToBluetoothSettings}>
                                        <Feather name="bluetooth" size={22} color="#007AFF" />
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>

                        <View style={styles.menuSeparator} />

                        {/* Footer Actions - Change Password and Logout */}
                        <View style={styles.footerSection}>
                            <TouchableOpacity style={styles.footerItem} onPress={handleChangePassword}>
                                <Feather name="lock" size={18} color="#854442" />
                                <ThemedText style={styles.footerText}>Change Password</ThemedText>
                            </TouchableOpacity>

                            <TouchableOpacity style={[styles.footerItem, styles.logoutItem]} onPress={handleLogout}>
                                <Feather name="log-out" size={18} color="#DC2626" />
                                <ThemedText style={[styles.footerText, styles.logoutText]}>Logout</ThemedText>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </LinearGradient>
            </Animated.View>

            {/* Change Password Modal */}
            <Modal
                visible={showChangePassword}
                transparent={true}
                animationType="slide"
                onRequestClose={handleClosePasswordModal}
            >
                <TouchableWithoutFeedback onPress={handleClosePasswordModal}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback>
                            <ThemedView style={styles.changePasswordModal}>
                                <ThemedText style={styles.changePasswordTitle}>Change Password</ThemedText>

                                <View style={styles.connectionInfo}>
                                    {isCheckingConnection ? (
                                        <Feather name="refresh-cw" size={16} color="#FFA500" />
                                    ) : (
                                        <Feather
                                            name={checkFirebaseOnline() ? "wifi" : "wifi-off"}
                                            size={16}
                                            color={checkFirebaseOnline() ? '#16A34A' : '#DC2626'}
                                        />
                                    )}
                                    <ThemedText style={styles.connectionInfoText}>
                                        {isCheckingConnection ? 'Checking connection...' :
                                            checkFirebaseOnline()
                                                ? 'Connected to Firebase'
                                                : 'Offline Mode - Internet required'
                                        }
                                    </ThemedText>
                                </View>

                                <View style={styles.passwordForm}>
                                    <View style={styles.inputContainer}>
                                        <ThemedText style={styles.inputLabel}>Current Password</ThemedText>
                                        <TextInput
                                            style={styles.textInput}
                                            secureTextEntry
                                            placeholder="Enter current password"
                                            placeholderTextColor="#999"
                                            value={currentPassword}
                                            onChangeText={setCurrentPassword}
                                        />
                                    </View>

                                    <View style={styles.inputContainer}>
                                        <ThemedText style={styles.inputLabel}>New Password</ThemedText>
                                        <TextInput
                                            style={styles.textInput}
                                            secureTextEntry
                                            placeholder="Enter new password"
                                            placeholderTextColor="#999"
                                            value={newPassword}
                                            onChangeText={setNewPassword}
                                        />
                                    </View>

                                    <View style={styles.inputContainer}>
                                        <ThemedText style={styles.inputLabel}>Confirm New Password</ThemedText>
                                        <TextInput
                                            style={styles.textInput}
                                            secureTextEntry
                                            placeholder="Confirm new password"
                                            placeholderTextColor="#999"
                                            value={confirmPassword}
                                            onChangeText={setConfirmPassword}
                                        />
                                    </View>
                                </View>

                                <View style={styles.passwordButtons}>
                                    <TouchableOpacity
                                        style={[styles.passwordButton, styles.cancelButton]}
                                        onPress={handleClosePasswordModal}
                                    >
                                        <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[styles.passwordButton, styles.saveButton]}
                                        onPress={handleSavePassword}
                                        disabled={!checkFirebaseOnline() || isCheckingConnection}
                                    >
                                        <ThemedText style={[
                                            styles.saveButtonText,
                                            (!checkFirebaseOnline() || isCheckingConnection) && styles.saveButtonTextDisabled
                                        ]}>
                                            {isCheckingConnection ? 'Checking...' :
                                                checkFirebaseOnline() ? 'Save Changes' : 'Offline'}
                                        </ThemedText>
                                    </TouchableOpacity>
                                </View>
                            </ThemedView>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 999,
    },
    overlayTouchable: {
        flex: 1,
    },
    sidebar: {
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 1000,
        shadowColor: '#000',
        shadowOffset: {
            width: 2,
            height: 0,
        },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 10,
        borderTopRightRadius: 20,
        borderBottomRightRadius: 20,
        overflow: 'hidden',
    },
    sidebarGradient: {
        flex: 1,
    },
    scrollContent: {
        paddingVertical: 30,
        paddingHorizontal: 20,
        flexGrow: 1,
    },
    headerSection: {
        alignItems: 'center',
        marginBottom: 15,
        marginTop: 5
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 7,
    },
    logoText: {
        fontSize: 32,
        fontFamily: 'GreatVibes',
        color: '#854442',
        textShadowColor: 'rgba(0,0,0,0.1)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 3,
    },
    divider: {
        width: 60,
        height: 2,
        backgroundColor: '#854442',
        borderRadius: 1,
    },
    userSection: {
        alignItems: 'center',
        marginBottom: 20,
    },
    userAvatar: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: '#FFFEEA',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    userName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#5A3921',
    },
    userRole: {
        fontSize: 12,
        color: '#16A34A',
        fontWeight: '600',
    },
    menuSeparator: {
        height: 1,
        backgroundColor: '#854442',
        opacity: 0.3,
        marginVertical: 5,
    },
    navSection: {
        gap: 4,
        marginBottom: 4,
    },
    navItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        position: 'relative',
    },
    navItemActive: {
        backgroundColor: '#854442',
        shadowColor: '#854442',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    navIcon: {
        marginRight: 10,
    },
    navText: {
        fontSize: 16,
        fontWeight: '500',
        color: '#5A3921',
        flex: 1,
    },
    navTextActive: {
        color: '#dfccaf',
        fontWeight: '600',
    },
    activeNavIndicator: {
        position: 'absolute',
        right: 0,
        width: 4,
        height: 24,
        backgroundColor: '#dfccaf',
        borderRadius: 2,
    },
    dropdownIcon: {
        marginLeft: 'auto',
    },
    inventoryContainer: {
        marginBottom: 4,
    },
    dropdownMenu: {
        marginTop: 8,
        marginBottom: 4,
        marginLeft: 36,
        borderLeftWidth: 2,
        borderLeftColor: '#854442',
        paddingLeft: 12,
    },
    dropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        marginVertical: 2,
    },
    dropdownItemActive: {
        backgroundColor: '#854442',
    },
    dropdownItemIcon: {
        marginRight: 10,
    },
    dropdownItemText: {
        fontSize: 14,
        color: '#5A3921',
        fontWeight: '500',
    },
    dropdownItemTextActive: {
        color: '#dfccaf',
    },
    statusSection: {
        marginVertical: 4,
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderRadius: 10,
    },
    statusIconButton: {
        padding: 1,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    syncIconWithBadge: {
        position: 'relative',
    },
    smallBadge: {
        position: 'absolute',
        top: -8,
        right: -12,
        backgroundColor: '#DC2626',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    smallBadgeText: {
        color: '#FFFEEA',
        fontSize: 9,
        fontWeight: 'bold',
    },
    footerSection: {
        gap: 8,
        marginTop: 4,
        marginBottom: 8,
    },
    footerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
    },
    footerText: {
        fontSize: 14,
        color: '#5A3921',
        marginLeft: 10,
    },
    logoutItem: {
        backgroundColor: 'rgba(220, 38, 38, 0.1)',
    },
    logoutText: {
        color: '#DC2626',
        fontWeight: '600',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    changePasswordModal: {
        width: 340,
        backgroundColor: '#FFFEEA',
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#D4A574',
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 8,
    },
    changePasswordTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#874E3B',
        textAlign: 'center',
        marginBottom: 16,
        fontFamily: 'LobsterTwoRegular',
    },
    connectionInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5E6D3',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
    },
    connectionInfoText: {
        fontSize: 12,
        color: '#5A3921',
        marginLeft: 8,
        flex: 1,
    },
    passwordForm: {
        marginBottom: 24,
    },
    inputContainer: {
        marginBottom: 16,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#5A3921',
        marginBottom: 8,
    },
    textInput: {
        backgroundColor: '#F5E6D3',
        borderWidth: 1,
        borderColor: '#D4A574',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: '#5A3921',
    },
    passwordButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    passwordButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: '#E8D8C8',
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    saveButton: {
        backgroundColor: '#874E3B',
    },
    cancelButtonText: {
        color: '#5A3921',
        fontWeight: '600',
    },
    saveButtonText: {
        color: '#FFFEEA',
        fontWeight: '600',
    },
    saveButtonTextDisabled: {
        color: '#A8A29E',
    },
});