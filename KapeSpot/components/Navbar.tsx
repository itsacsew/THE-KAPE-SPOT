// components/Navbar.tsx
import {
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    View,
    Alert,
    Modal,
    TouchableWithoutFeedback,
    TextInput,
    useWindowDimensions
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather } from "@expo/vector-icons";
import { useRouter, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
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

interface NavbarProps {
    activeNav?: string;
}

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

export default function Navbar({ activeNav }: NavbarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { width: screenWidth } = useWindowDimensions();
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

    // Determine if we should use compact layout
    const isSmallScreen = screenWidth < 768; // Tablet breakpoint
    const isVerySmallScreen = screenWidth < 480; // Phone breakpoint

    // Initialize Firebase
    const db = getFirestore(app);
    const auth = getAuth(app);

    // Determine active nav based on current route
    const currentActiveNav = activeNav || (pathname === '/pos' ? 'pos' :
        pathname === '/items' ? 'items' :
            pathname === '/log' ? 'log' :
                pathname === '/sales-expense' ? 'sales' :
                    pathname === '/orderStatus' ? 'order-status' :
                        pathname === '/settings' ? 'settings' : 'pos');

    const navigateTo = (route: '/' | '/pos' | '/items' | '/log' | '/sales-expense' | '/orderStatus' | '/settings', nav: string) => {
        if (route !== pathname) {
            router.push(route as any);
        }
    };

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

    // Listen for Bluetooth connection changes
    useEffect(() => {
        const syncService = OfflineSyncService.getInstance();

        const handleStorageChange = async (key: string, value: string | null) => {
            if (key === 'bluetoothConnection') {
                if (value) {
                    try {
                        const connectionData = JSON.parse(value);
                        setIsBluetoothConnected(connectionData.connected || false);
                        setBluetoothDeviceName(connectionData.deviceName || 'Bluetooth Device');
                    } catch (error) {
                        console.error('Error parsing Bluetooth connection data:', error);
                    }
                } else {
                    setIsBluetoothConnected(false);
                    setBluetoothDeviceName('');
                }
            }
        };

        const checkBluetoothStorage = async () => {
            const bluetoothInfo = await syncService.getItem('bluetoothConnection');
            handleStorageChange('bluetoothConnection', bluetoothInfo);
        };

        checkBluetoothStorage();
        const intervalId = setInterval(checkBluetoothStorage, 2000);

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
                console.log('🔍 Navbar: Checking Firebase connection...');
                const connectionMode = await NetworkScanner.getApiBaseUrl();
                const isOnline = connectionMode === 'online';

                if (isMounted) {
                    setIsFirebaseOnline(isOnline);
                    console.log('🔥 Navbar Firebase connection:', isOnline ? 'ONLINE' : 'OFFLINE');
                }
            } catch (error) {
                console.error('❌ Navbar: Error checking Firebase connection:', error);
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

            console.log('🔄 Navbar connection status changed:', isConnected ? 'ONLINE' : 'OFFLINE', 'Mode:', mode);
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

    // Force refresh connection when component becomes visible
    useEffect(() => {
        const handleFocus = () => {
            console.log('🎯 Navbar focused - refreshing connection status');
            NetworkScanner.refreshConnection().then(result => {
                setIsFirebaseOnline(result.isConnected);
            });
        };

        const timeoutId = setTimeout(() => {
            handleFocus();
        }, 1000);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [pathname]);

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

    const handleAccountPress = () => {
        setShowAccountMenu(!showAccountMenu);
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

    const handleViewProfile = () => {
        setShowAccountMenu(false);
        Alert.alert(
            'User Profile',
            `Name: ${currentUser?.name || 'User'}\nUsername: ${currentUser?.username || 'username'}\nRole: ${currentUser?.role ? currentUser.role.toUpperCase() : 'Role'}`,
            [{ text: 'OK' }]
        );
    };

    const handleChangePassword = () => {
        setShowAccountMenu(false);
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

                console.log('✅ Password updated successfully in Firebase Auth');

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

    const handleCloseMenu = () => {
        setShowAccountMenu(false);
    };

    const checkFirebaseOnline = () => {
        return isFirebaseOnline;
    };

    const handleRefreshConnection = async () => {
        console.log('🔄 Manually refreshing connection...');
        setIsCheckingConnection(true);
        try {
            const result = await NetworkScanner.refreshConnection();
            setIsFirebaseOnline(result.isConnected);
            console.log('✅ Manual connection refresh:', result.isConnected ? 'ONLINE' : 'OFFLINE');
        } catch (error) {
            console.error('❌ Manual connection refresh failed:', error);
        } finally {
            setIsCheckingConnection(false);
        }
    };

    const handleNavigateToBluetoothSettings = () => {
        setShowAccountMenu(false);
        router.push('/settings');
    };

    // Render navigation items with responsive layout
    const renderNavItems = () => {
        const navItems = [
            { key: 'pos', route: '/pos', icon: 'shopping-cart', label: 'POS' },
            { key: 'order-status', route: '/orderStatus', icon: 'clipboard', label: 'Order' },
            { key: 'items', route: '/items', icon: 'package', label: 'Inventory' },
            { key: 'log', route: '/log', icon: 'users', label: 'Log' },
            { key: 'sales', route: '/sales-expense', icon: 'bar-chart-2', label: 'Expenses' },
            { key: 'settings', route: '/settings', icon: 'settings', label: 'Settings' },
        ];

        return navItems.map((item) => (
            <TouchableOpacity
                key={item.key}
                style={[
                    styles.navLink,
                    isVerySmallScreen && styles.navLinkCompact
                ]}
                onPress={() => navigateTo(item.route as any, item.key)}
            >
                <Feather
                    name={item.icon as keyof typeof Feather.glyphMap}
                    size={isVerySmallScreen ? 16 : 20}
                    color="#FFFEEA"
                    style={styles.navIcon}
                />
                {(!isVerySmallScreen || currentActiveNav === item.key) && (
                    <ThemedText style={[
                        styles.navLinkText,
                        isVerySmallScreen && styles.navLinkTextCompact,
                        currentActiveNav === item.key && styles.activeNavLinkText
                    ]}>
                        {isVerySmallScreen && currentActiveNav === item.key ? item.label :
                            isVerySmallScreen ? '' : item.label}
                    </ThemedText>
                )}
                {currentActiveNav === item.key && <ThemedView style={styles.activeIndicator} />}
            </TouchableOpacity>
        ));
    };

    return (
        <ThemedView style={[
            styles.navbar,
            isSmallScreen && styles.navbarCompact
        ]}>
            {/* Logo Section - Hidden on very small screens */}
            {!isVerySmallScreen && (
                <ThemedText style={[
                    styles.navbarTitle,
                    isSmallScreen && styles.navbarTitleCompact
                ]}>
                    THE <ThemedText style={styles.sectionTitle1}>KAPE </ThemedText> SPOT
                </ThemedText>
            )}


            <View style={[
                styles.navbarContent,
                isVerySmallScreen && styles.navbarContentCompact
            ]}>
                {/* Navigation Items */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.navbarScroll}
                    contentContainerStyle={[
                        styles.scrollContent,
                        isVerySmallScreen && styles.scrollContentCompact
                    ]}
                >
                    {renderNavItems()}
                </ScrollView>

                {/* Indicators Section */}
                <View style={[
                    styles.indicatorsContainer,
                    isVerySmallScreen && styles.indicatorsContainerCompact
                ]}>
                    {/* Sync Indicator */}
                    <TouchableOpacity
                        style={[
                            styles.syncIndicator,
                            isVerySmallScreen && styles.indicatorCompact
                        ]}
                        onPress={handleManualSync}
                    >
                        <Feather
                            name={syncIcon.name}
                            size={isVerySmallScreen ? 14 : 16}
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

                    {/* Firebase Online Indicator */}
                    <TouchableOpacity
                        style={[
                            styles.firebaseIndicator,
                            isVerySmallScreen && styles.indicatorCompact
                        ]}
                        onPress={handleRefreshConnection}
                        disabled={isCheckingConnection}
                    >
                        {isCheckingConnection ? (
                            <Feather
                                name="refresh-cw"
                                size={isVerySmallScreen ? 14 : 16}
                                color="#FFA500"
                            />
                        ) : (
                            <Feather
                                name={checkFirebaseOnline() ? "wifi" : "wifi-off"}
                                size={isVerySmallScreen ? 14 : 16}
                                color={checkFirebaseOnline() ? '#16A34A' : '#DC2626'}
                            />
                        )}
                    </TouchableOpacity>

                    {/* Bluetooth Connection Indicator */}
                    {isBluetoothConnected && (
                        <TouchableOpacity
                            style={[
                                styles.bluetoothIndicator,
                                isVerySmallScreen && styles.indicatorCompact
                            ]}
                            onPress={handleNavigateToBluetoothSettings}
                        >
                            <Feather
                                name="bluetooth"
                                size={isVerySmallScreen ? 14 : 16}
                                color="#007AFF"
                            />
                        </TouchableOpacity>
                    )}

                    {/* Account Circle with Dropdown Menu */}
                    <View style={styles.accountContainer}>
                        <TouchableOpacity
                            style={[
                                styles.accountCircle,
                                isVerySmallScreen && styles.accountCircleCompact,
                                showAccountMenu && styles.accountCircleActive
                            ]}
                            onPress={handleAccountPress}
                        >
                            <Feather
                                name="user"
                                size={isVerySmallScreen ? 16 : 20}
                                color="#874E3B"
                            />
                            {currentActiveNav === 'account' && <ThemedView style={styles.activeIndicator} />}
                        </TouchableOpacity>

                        {/* Account Dropdown Menu */}
                        <Modal
                            visible={showAccountMenu}
                            transparent={true}
                            animationType="fade"
                            onRequestClose={handleCloseMenu}
                        >
                            <TouchableWithoutFeedback onPress={handleCloseMenu}>
                                <View style={styles.modalOverlay}>
                                    <TouchableWithoutFeedback>
                                        <ThemedView style={[
                                            styles.accountMenu,
                                            isSmallScreen && styles.accountMenuCompact
                                        ]}>
                                            {/* User Info Section */}
                                            <ThemedView style={styles.userInfoSection}>
                                                <ThemedView style={[
                                                    styles.userAvatar,
                                                    isSmallScreen && styles.userAvatarCompact
                                                ]}>
                                                    <Feather name="user" size={isSmallScreen ? 20 : 24} color="#874E3B" />
                                                </ThemedView>
                                                <ThemedView style={styles.userDetails}>
                                                    <ThemedText style={[
                                                        styles.userName,
                                                        isSmallScreen && styles.userNameCompact
                                                    ]}>
                                                        {currentUser?.name || 'User'}
                                                    </ThemedText>
                                                    <ThemedText style={styles.userRole}>
                                                        {currentUser?.role ? `${currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)}` : 'Role'}
                                                    </ThemedText>
                                                    <ThemedText style={styles.userUsername}>
                                                        @{currentUser?.username || 'username'}
                                                    </ThemedText>
                                                    <ThemedText style={[
                                                        styles.connectionStatus,
                                                        { color: checkFirebaseOnline() ? '#16A34A' : '#DC2626' }
                                                    ]}>
                                                        {isCheckingConnection ? '🟡 Checking...' :
                                                            checkFirebaseOnline() ? '🟢 Firebase Online' : '🔴 Firebase Offline'}
                                                    </ThemedText>
                                                </ThemedView>
                                            </ThemedView>

                                            <ThemedView style={styles.menuSeparator} />

                                            {/* Bluetooth Connection Status */}
                                            {isBluetoothConnected && (
                                                <>
                                                    <ThemedView style={styles.bluetoothStatusSection}>
                                                        <Feather name="bluetooth" size={16} color="#007AFF" />
                                                        <ThemedText style={styles.bluetoothStatusText}>
                                                            Connected to {bluetoothDeviceName}
                                                        </ThemedText>
                                                    </ThemedView>
                                                    <ThemedView style={styles.menuSeparator} />
                                                </>
                                            )}

                                            {/* Menu Options */}
                                            <TouchableOpacity
                                                style={styles.menuItem}
                                                onPress={handleChangePassword}
                                            >
                                                <Feather name="lock" size={16} color="#874E3B" />
                                                <ThemedText style={styles.menuItemText}>Change Password</ThemedText>
                                            </TouchableOpacity>

                                            <ThemedView style={styles.menuSeparator} />

                                            {/* Logout Option */}
                                            <TouchableOpacity
                                                style={[styles.menuItem, styles.logoutMenuItem]}
                                                onPress={handleLogout}
                                            >
                                                <Feather name="log-out" size={16} color="#DC2626" />
                                                <ThemedText style={[styles.menuItemText, styles.logoutText]}>Logout</ThemedText>
                                            </TouchableOpacity>
                                        </ThemedView>
                                    </TouchableWithoutFeedback>
                                </View>
                            </TouchableWithoutFeedback>
                        </Modal>
                    </View>
                </View>
            </View>

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
                            <ThemedView style={[
                                styles.changePasswordModal,
                                isSmallScreen && styles.changePasswordModalCompact
                            ]}>
                                <ThemedText style={styles.changePasswordTitle}>Change Password</ThemedText>

                                <ThemedView style={styles.connectionInfo}>
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
                                        {isCheckingConnection ? '🟡 Checking connection...' :
                                            checkFirebaseOnline()
                                                ? '🔥 Connected to Firebase - Password will be updated online'
                                                : '📱 Offline Mode - Password changes require internet connection'
                                        }
                                    </ThemedText>
                                </ThemedView>

                                <ThemedView style={styles.passwordForm}>
                                    <ThemedView style={styles.inputContainer}>
                                        <ThemedText style={styles.inputLabel}>Current Password</ThemedText>
                                        <TextInput
                                            style={styles.textInput}
                                            secureTextEntry
                                            placeholder="Enter current password"
                                            placeholderTextColor="#999"
                                            value={currentPassword}
                                            onChangeText={setCurrentPassword}
                                        />
                                    </ThemedView>

                                    <ThemedView style={styles.inputContainer}>
                                        <ThemedText style={styles.inputLabel}>New Password</ThemedText>
                                        <TextInput
                                            style={styles.textInput}
                                            secureTextEntry
                                            placeholder="Enter new password"
                                            placeholderTextColor="#999"
                                            value={newPassword}
                                            onChangeText={setNewPassword}
                                        />
                                    </ThemedView>

                                    <ThemedView style={styles.inputContainer}>
                                        <ThemedText style={styles.inputLabel}>Confirm New Password</ThemedText>
                                        <TextInput
                                            style={styles.textInput}
                                            secureTextEntry
                                            placeholder="Confirm new password"
                                            placeholderTextColor="#999"
                                            value={confirmPassword}
                                            onChangeText={setConfirmPassword}
                                        />
                                    </ThemedView>
                                </ThemedView>

                                <ThemedView style={styles.passwordButtons}>
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
                                </ThemedView>
                            </ThemedView>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
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
        zIndex: 1000,
        minHeight: 70,
    },
    navbarCompact: {
        paddingHorizontal: 15,
        paddingVertical: 10,
        minHeight: 60,
    },
    navbarTitle: {
        fontSize: 30,
        fontFamily: 'LobsterTwoRegular',
        color: '#FFFEEA',
        marginRight: 20,
        marginLeft: 30,
        lineHeight: 40,
        flexShrink: 1,
    },
    navbarTitleCompact: {
        fontSize: 24,
        marginRight: 15,
        marginLeft: 15,
        lineHeight: 32,
    },
    navbarContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    navbarContentCompact: {
        flexDirection: 'row',
    },
    navbarScroll: {
        flex: 1,
        marginLeft: 90,
    },
    scrollContent: {
        flexGrow: 1,
        alignItems: 'center',
        flexDirection: 'row',
    },
    scrollContentCompact: {
        justifyContent: 'flex-start',
    },
    navLink: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        position: 'relative',
        alignItems: 'center',
        flexDirection: 'row',
        minWidth: 60,
    },
    navLinkCompact: {
        paddingHorizontal: 8,
        paddingVertical: 6,
        minWidth: 40,
    },
    navIcon: {
        marginRight: 6,
    },
    navLinkText: {
        fontSize: 16,
        fontFamily: 'LobsterTwoRegular',
        color: '#FFFEEA',
        flexShrink: 1,
    },
    navLinkTextCompact: {
        fontSize: 12,
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
    indicatorsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 10,
        flexShrink: 0,
    },
    indicatorsContainerCompact: {
        marginLeft: 5,
    },
    accountContainer: {
        position: 'relative',
        marginLeft: 5,
    },
    accountCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#FFFEEA',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 3,
    },
    accountCircleCompact: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    accountCircleActive: {
        backgroundColor: '#F5E6D3',
        shadowColor: '#874E3B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 5,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        paddingTop: 100,
        paddingRight: 20,
    },
    accountMenu: {
        width: 280,
        backgroundColor: '#FFFEEA',
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#D4A574',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 8,
        zIndex: 1001,
        padding: 16,
    },
    accountMenuCompact: {
        width: 250,
        padding: 12,
    },
    userInfoSection: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    userAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#F5E6D3',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
        borderWidth: 2,
        borderColor: '#D4A574',
    },
    userAvatarCompact: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    userDetails: {
        flex: 1,
    },
    userName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
        marginBottom: 2,
    },
    userNameCompact: {
        fontSize: 14,
    },
    userRole: {
        fontSize: 12,
        color: '#16A34A',
        fontWeight: '600',
        marginBottom: 2,
    },
    userUsername: {
        fontSize: 12,
        color: '#5A3921',
        opacity: 0.8,
    },
    connectionStatus: {
        fontSize: 10,
        marginTop: 4,
        fontWeight: '500',
    },
    bluetoothStatusSection: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E3F2FD',
        padding: 10,
        borderRadius: 6,
        marginBottom: 8,
    },
    bluetoothStatusText: {
        fontSize: 12,
        color: '#007AFF',
        marginLeft: 8,
        fontWeight: '500',
    },
    menuSeparator: {
        height: 1,
        backgroundColor: '#E8D8C8',
        marginVertical: 8,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderRadius: 6,
    },
    menuItemText: {
        fontSize: 14,
        color: '#5A3921',
        marginLeft: 12,
        fontWeight: '500',
    },
    logoutMenuItem: {
        marginTop: 4,
    },
    logoutText: {
        color: '#DC2626',
        fontWeight: '600',
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
        marginLeft: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 20,
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
    },
    firebaseIndicator: {
        padding: 8,
        marginLeft: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 20,
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
    },
    bluetoothIndicator: {
        padding: 8,
        marginLeft: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 20,
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
    },
    indicatorCompact: {
        width: 32,
        height: 32,
        padding: 6,
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
    // Change Password Modal Styles
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
    changePasswordModalCompact: {
        width: 300,
        padding: 20,
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