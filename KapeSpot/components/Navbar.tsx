// components/Navbar.tsx
import {
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    View,
    Alert,
    Modal,
    TouchableWithoutFeedback,
    TextInput
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

    // Check Firebase connection status - IMPROVED VERSION
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

        // Initial check
        checkFirebaseConnection();

        // Listen for connection changes with improved error handling
        const connectionListener = (isConnected: boolean, mode: 'online' | 'offline') => {
            if (!isMounted) return;

            console.log('🔄 Navbar connection status changed:', isConnected ? 'ONLINE' : 'OFFLINE', 'Mode:', mode);
            setIsFirebaseOnline(isConnected);
        };

        NetworkScanner.addConnectionListener(connectionListener);

        // Add periodic connection check (every 10 seconds)
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

    // Force refresh connection when component becomes visible - FIXED VERSION
    useEffect(() => {
        const handleFocus = () => {
            console.log('🎯 Navbar focused - refreshing connection status');
            NetworkScanner.refreshConnection().then(result => {
                setIsFirebaseOnline(result.isConnected);
            });
        };

        // Use useFocusEffect alternative for Expo Router
        const timeoutId = setTimeout(() => {
            handleFocus();
        }, 1000);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [pathname]); // Use pathname as dependency to trigger on route changes

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
                            // Sign out from Firebase Auth
                            await auth.signOut();

                            // Use AsyncStorage directly to remove the currentUser
                            await AsyncStorage.removeItem('currentUser');
                            setCurrentUser(null);
                            setShowAccountMenu(false);

                            // Redirect to login screen
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

            // Check if we're online with Firebase
            if (!currentAuthUser) {
                // Offline mode - save to local storage only
                Alert.alert(
                    'Offline Mode',
                    'Cannot change password while offline. Please connect to the internet to change your password.',
                    [{ text: 'OK' }]
                );
                return;
            }

            // Online mode - update password in Firebase Auth
            try {
                // Re-authenticate user first
                const credential = EmailAuthProvider.credential(
                    currentAuthUser.email || `${user.username}@kapespot.com`,
                    currentPassword
                );

                await reauthenticateWithCredential(currentAuthUser, credential);

                // Update password
                await updatePassword(currentAuthUser, newPassword);

                Alert.alert('Success', 'Password changed successfully');
                setShowChangePassword(false);

                // Clear password fields
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

    // Close menu when clicking outside - using Modal's onRequestClose
    const handleCloseMenu = () => {
        setShowAccountMenu(false);
    };

    // Check Firebase connectivity
    const checkFirebaseOnline = () => {
        return isFirebaseOnline;
    };

    // Manual connection refresh
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
                ></ScrollView>
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
                    onPress={() => navigateTo('/log', 'log')}
                >
                    <Feather
                        name="users"
                        size={20}
                        color={currentActiveNav === 'log' ? '#FFFEEA' : '#FFFEEA'}
                        style={styles.navIcon}
                    />
                    <ThemedText style={[
                        styles.navLinkText,
                        currentActiveNav === 'log' && styles.activeNavLinkText
                    ]}>
                        Log
                    </ThemedText>
                    {currentActiveNav === 'log' && <ThemedView style={styles.activeIndicator} />}
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
                        Expenses
                    </ThemedText>
                    {currentActiveNav === 'sales' && <ThemedView style={styles.activeIndicator} />}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navLink}
                    onPress={() => navigateTo('/orderStatus', 'order-status')}
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

                {/* Firebase Online Indicator */}
                <TouchableOpacity
                    style={styles.firebaseIndicator}
                    onPress={handleRefreshConnection}
                    disabled={isCheckingConnection}
                >
                    {isCheckingConnection ? (
                        <Feather
                            name="refresh-cw"
                            size={16}
                            color="#FFA500"
                        />
                    ) : (
                        <Feather
                            name={checkFirebaseOnline() ? "wifi" : "wifi-off"}
                            size={16}
                            color={checkFirebaseOnline() ? '#16A34A' : '#DC2626'}
                        />
                    )}
                </TouchableOpacity>

                {/* Account Circle with Dropdown Menu */}
                <View style={styles.accountContainer}>
                    <TouchableOpacity
                        style={[
                            styles.accountCircle,
                            showAccountMenu && styles.accountCircleActive
                        ]}
                        onPress={handleAccountPress}
                    >
                        <Feather
                            name="user"
                            size={20}
                            color="#874E3B"
                        />
                        {currentActiveNav === 'account' && <ThemedView style={styles.activeIndicator} />}
                    </TouchableOpacity>

                    {/* Account Dropdown Menu using Modal for proper overlay */}
                    <Modal
                        visible={showAccountMenu}
                        transparent={true}
                        animationType="fade"
                        onRequestClose={handleCloseMenu}
                    >
                        <TouchableWithoutFeedback onPress={handleCloseMenu}>
                            <View style={styles.modalOverlay}>
                                <TouchableWithoutFeedback>
                                    <ThemedView style={styles.accountMenu}>
                                        {/* User Info Section */}
                                        <ThemedView style={styles.userInfoSection}>
                                            <ThemedView style={styles.userAvatar}>
                                                <Feather name="user" size={24} color="#874E3B" />
                                            </ThemedView>
                                            <ThemedView style={styles.userDetails}>
                                                <ThemedText style={styles.userName}>
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

// Styles remain the same...
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
    accountContainer: {
        position: 'relative',
        marginLeft: 10,
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
    userDetails: {
        flex: 1,
    },
    userName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
        marginBottom: 2,
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
        marginLeft: 10,
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