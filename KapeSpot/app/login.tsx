// app/login.tsx
import { useState } from 'react';
import {
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ImageBackground,
    Alert,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    View
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather } from "@expo/vector-icons";
import { useRouter } from 'expo-router';
import { OfflineSyncService } from '@/lib/offline-sync';
import React from 'react';
import { NetworkScanner } from '@/lib/network-scanner';

interface User {
    id: string;
    username: string;
    name: string;
    role: 'admin' | 'user';
}

export default function LoginScreen() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [name, setName] = useState('');
    const [selectedRole, setSelectedRole] = useState<'user' | 'admin'>('user');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const [apiBaseUrl, setApiBaseUrl] = useState<string>('');
    const router = useRouter();

    // Function to get dynamic API URL
    const getApiBaseUrl = async (): Promise<string> => {
        try {
            const serverIP = await NetworkScanner.findServerIP();

            if (serverIP === 'demo') {
                console.log('🔄 Login Running in demo mode');
                return 'demo';
            }

            const baseUrl = `http://${serverIP}/backend/api`;
            console.log(`🌐 Login Using server: ${baseUrl}`);
            return baseUrl;

        } catch (error) {
            console.log('❌ Login Error detecting server, using offline mode');
            return 'demo';
        }
    };

    // Handle login - DUAL STORAGE: Online + Local
    const handleLogin = async () => {
        if (!username.trim() || !password.trim()) {
            Alert.alert('Missing Information', 'Please enter both username and password');
            return;
        }

        setLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const API_BASE_URL = await getApiBaseUrl();
            setApiBaseUrl(API_BASE_URL);

            console.log('🔄 [DUAL-LOGIN] Starting dual login process...');

            // STEP 1: TRY ONLINE LOGIN FIRST
            if (API_BASE_URL !== 'demo') {
                console.log('🌐 [DUAL-LOGIN] Step 1: Attempting ONLINE login...');

                try {
                    const response = await fetch(`${API_BASE_URL}/users.php`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            action: 'login',
                            username: username,
                            password: password
                        }),
                    });

                    const result = await response.json();

                    if (result.success && result.user) {
                        console.log('✅ [DUAL-LOGIN] Step 1 COMPLETE: ONLINE login successful');

                        // Save user to local storage as backup
                        await syncService.setItem('currentUser', JSON.stringify(result.user));

                        console.log('💾 [DUAL-LOGIN] User saved to local storage as backup');

                        // Redirect to POS
                        router.replace('/(tabs)/pos');

                        Alert.alert(
                            'Login Successful',
                            `Welcome back, ${result.user.name}!`,
                            [{ text: 'OK' }]
                        );
                        return;
                    } else {
                        throw new Error(result.message || 'Online login failed');
                    }
                } catch (onlineError) {
                    console.log('⚠️ [DUAL-LOGIN] Online login failed, trying offline...', onlineError);
                }
            }

            // STEP 2: OFFLINE LOGIN FALLBACK
            console.log('📱 [DUAL-LOGIN] Step 2: Attempting OFFLINE login...');

            const offlineUsersData = await syncService.getItem('users');
            const offlineUsers = offlineUsersData ? JSON.parse(offlineUsersData) : [];

            const offlineUser = offlineUsers.find((u: any) =>
                u.username.toLowerCase() === username.toLowerCase() &&
                u.password === password
            );

            if (offlineUser) {
                console.log('✅ [DUAL-LOGIN] Step 2 COMPLETE: OFFLINE login successful');

                // Remove password before saving
                const { password: _, ...userWithoutPassword } = offlineUser;
                await syncService.setItem('currentUser', JSON.stringify(userWithoutPassword));

                router.replace('/(tabs)/pos');

                Alert.alert(
                    'Login Successful (Offline)',
                    `Welcome back, ${offlineUser.name}!`,
                    [{ text: 'OK' }]
                );
            } else {
                Alert.alert(
                    'Login Failed',
                    'Invalid username or password. Please try again.'
                );
            }

        } catch (error) {
            console.error('❌ Login error:', error);
            Alert.alert(
                'Login Error',
                'An error occurred during login. Please try again.'
            );
        } finally {
            setLoading(false);
        }
    };

    // Handle sign up - DUAL STORAGE: Online + Local
    const handleSignUp = async () => {
        if (!username.trim() || !password.trim() || !name.trim()) {
            Alert.alert('Missing Information', 'Please fill in all required fields');
            return;
        }

        if (password !== confirmPassword) {
            Alert.alert('Password Mismatch', 'Passwords do not match');
            return;
        }

        if (password.length < 6) {
            Alert.alert('Weak Password', 'Password must be at least 6 characters long');
            return;
        }

        setLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const API_BASE_URL = await getApiBaseUrl();
            setApiBaseUrl(API_BASE_URL);

            console.log('🔄 [DUAL-REGISTER] Starting dual registration process...');

            const newUser = {
                username: username,
                password: password,
                name: name,
                role: selectedRole
            };

            // STEP 1: TRY ONLINE REGISTRATION FIRST
            if (API_BASE_URL !== 'demo') {
                console.log('🌐 [DUAL-REGISTER] Step 1: Attempting ONLINE registration...');

                try {
                    const response = await fetch(`${API_BASE_URL}/users.php`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            action: 'register',
                            ...newUser
                        }),
                    });

                    const result = await response.json();

                    if (result.success && result.user) {
                        console.log('✅ [DUAL-REGISTER] Step 1 COMPLETE: ONLINE registration successful');

                        // Save user to local storage
                        await syncService.setItem('currentUser', JSON.stringify(result.user));

                        // Also save to offline users list
                        const existingUsers = await syncService.getItem('users');
                        const users = existingUsers ? JSON.parse(existingUsers) : [];
                        users.push({ ...newUser, id: Date.now().toString() });
                        await syncService.setItem('users', JSON.stringify(users));

                        console.log('💾 [DUAL-REGISTER] User saved to local storage');

                        // Show success message and redirect to sign in
                        Alert.alert(
                            'Registration Successful!',
                            `Account created successfully for ${result.user.name} (${result.user.role}). Please sign in with your credentials.`,
                            [
                                {
                                    text: 'OK',
                                    onPress: () => {
                                        // Clear form and go back to sign in
                                        setUsername('');
                                        setPassword('');
                                        setConfirmPassword('');
                                        setName('');
                                        setSelectedRole('user');
                                        setIsSignUp(false);
                                    }
                                }
                            ]
                        );
                        return;
                    } else {
                        throw new Error(result.message || 'Online registration failed');
                    }
                } catch (onlineError) {
                    console.log('⚠️ [DUAL-REGISTER] Online registration failed, saving offline...', onlineError);
                }
            }

            // STEP 2: OFFLINE REGISTRATION FALLBACK
            console.log('📱 [DUAL-REGISTER] Step 2: Saving OFFLINE registration...');

            const existingUsers = await syncService.getItem('users');
            const users = existingUsers ? JSON.parse(existingUsers) : [];

            // Check if username already exists offline
            if (users.find((u: any) => u.username.toLowerCase() === username.toLowerCase())) {
                Alert.alert('Username Exists', 'This username is already taken');
                return;
            }

            const offlineUser = {
                ...newUser,
                id: Date.now().toString()
            };

            users.push(offlineUser);
            await syncService.setItem('users', JSON.stringify(users));

            // Remove password before saving current session
            const { password: _, ...userWithoutPassword } = offlineUser;
            await syncService.setItem('currentUser', JSON.stringify(userWithoutPassword));

            console.log('✅ [DUAL-REGISTER] Step 2 COMPLETE: OFFLINE registration successful');

            // Show success message and redirect to sign in
            Alert.alert(
                'Registration Successful! (Offline)',
                `Account created successfully for ${name} (${selectedRole}). Please sign in with your credentials.`,
                [
                    {
                        text: 'OK',
                        onPress: () => {
                            // Clear form and go back to sign in
                            setUsername('');
                            setPassword('');
                            setConfirmPassword('');
                            setName('');
                            setSelectedRole('user');
                            setIsSignUp(false);
                        }
                    }
                ]
            );

        } catch (error) {
            console.error('❌ Registration error:', error);
            Alert.alert(
                'Registration Error',
                'An error occurred during registration. Please try again.'
            );
        } finally {
            setLoading(false);
        }
    };

    const toggleMode = () => {
        setIsSignUp(!isSignUp);
        setUsername('');
        setPassword('');
        setConfirmPassword('');
        setName('');
        setSelectedRole('user');
    };

    return (
        <ThemedView style={styles.container}>
            <ImageBackground
                source={require('@/assets/images/kape1.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <KeyboardAvoidingView
                    style={styles.keyboardAvoid}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Login/Signup Card - Smaller container */}
                        <ThemedView style={styles.loginCard}>
                            {/* Header */}
                            <ThemedView style={styles.header}>
                                <ThemedText style={styles.title}>KapeSpot</ThemedText>
                                <ThemedText style={styles.subtitle}>
                                    {isSignUp ? 'Create Account' : 'Sign In'}
                                </ThemedText>
                            </ThemedView>

                            {/* Form */}
                            <ThemedView style={styles.form}>
                                {/* Name Input (Sign Up only) */}
                                {isSignUp && (
                                    <ThemedView style={styles.inputContainer}>
                                        <ThemedText style={styles.inputLabel}>Full Name</ThemedText>
                                        <ThemedView style={styles.inputWrapper}>
                                            <Feather name="user" size={20} color="#874E3B" style={styles.inputIcon} />
                                            <TextInput
                                                style={styles.textInput}
                                                value={name}
                                                onChangeText={setName}
                                                placeholder="Enter your full name"
                                                placeholderTextColor="#9CA3AF"
                                                autoCapitalize="words"
                                            />
                                        </ThemedView>
                                    </ThemedView>
                                )}

                                {/* Username Input */}
                                <ThemedView style={styles.inputContainer}>
                                    <ThemedText style={styles.inputLabel}>Username</ThemedText>
                                    <ThemedView style={styles.inputWrapper}>
                                        <Feather name="user" size={20} color="#874E3B" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.textInput}
                                            value={username}
                                            onChangeText={setUsername}
                                            placeholder="Enter your username"
                                            placeholderTextColor="#9CA3AF"
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                        />
                                    </ThemedView>
                                </ThemedView>

                                {/* Password Input */}
                                <ThemedView style={styles.inputContainer}>
                                    <ThemedText style={styles.inputLabel}>Password</ThemedText>
                                    <ThemedView style={styles.inputWrapper}>
                                        <Feather name="lock" size={20} color="#874E3B" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.textInput}
                                            value={password}
                                            onChangeText={setPassword}
                                            placeholder="Enter your password"
                                            placeholderTextColor="#9CA3AF"
                                            secureTextEntry={!showPassword}
                                            autoCapitalize="none"
                                        />
                                        <TouchableOpacity
                                            style={styles.eyeIcon}
                                            onPress={() => setShowPassword(!showPassword)}
                                        >
                                            <Feather
                                                name={showPassword ? "eye" : "eye-off"}
                                                size={20}
                                                color="#874E3B"
                                            />
                                        </TouchableOpacity>
                                    </ThemedView>
                                </ThemedView>

                                {/* Confirm Password Input (Sign Up only) */}
                                {isSignUp && (
                                    <ThemedView style={styles.inputContainer}>
                                        <ThemedText style={styles.inputLabel}>Confirm Password</ThemedText>
                                        <ThemedView style={styles.inputWrapper}>
                                            <Feather name="lock" size={20} color="#874E3B" style={styles.inputIcon} />
                                            <TextInput
                                                style={styles.textInput}
                                                value={confirmPassword}
                                                onChangeText={setConfirmPassword}
                                                placeholder="Confirm your password"
                                                placeholderTextColor="#9CA3AF"
                                                secureTextEntry={!showConfirmPassword}
                                                autoCapitalize="none"
                                            />
                                            <TouchableOpacity
                                                style={styles.eyeIcon}
                                                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                                            >
                                                <Feather
                                                    name={showConfirmPassword ? "eye" : "eye-off"}
                                                    size={20}
                                                    color="#874E3B"
                                                />
                                            </TouchableOpacity>
                                        </ThemedView>
                                    </ThemedView>
                                )}

                                {/* Role Selection (Sign Up only) */}
                                {isSignUp && (
                                    <ThemedView style={styles.inputContainer}>
                                        <ThemedText style={styles.inputLabel}>Account Type</ThemedText>
                                        <ThemedView style={styles.roleContainer}>
                                            <TouchableOpacity
                                                style={[
                                                    styles.roleButton,
                                                    selectedRole === 'user' && styles.roleButtonActive
                                                ]}
                                                onPress={() => setSelectedRole('user')}
                                            >
                                                <Feather
                                                    name="user"
                                                    size={20}
                                                    color={selectedRole === 'user' ? '#FFFEEA' : '#874E3B'}
                                                />
                                                <ThemedText style={[
                                                    styles.roleButtonText,
                                                    selectedRole === 'user' && styles.roleButtonTextActive
                                                ]}>
                                                    User
                                                </ThemedText>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[
                                                    styles.roleButton,
                                                    selectedRole === 'admin' && styles.roleButtonActive
                                                ]}
                                                onPress={() => setSelectedRole('admin')}
                                            >
                                                <Feather
                                                    name="shield"
                                                    size={20}
                                                    color={selectedRole === 'admin' ? '#FFFEEA' : '#874E3B'}
                                                />
                                                <ThemedText style={[
                                                    styles.roleButtonText,
                                                    selectedRole === 'admin' && styles.roleButtonTextActive
                                                ]}>
                                                    Admin
                                                </ThemedText>
                                            </TouchableOpacity>
                                        </ThemedView>
                                        <ThemedText style={styles.roleHelpText}>
                                            {selectedRole === 'admin'
                                                ? 'Admin users have full access to all features'
                                                : 'Regular users can access POS and basic features'
                                            }
                                        </ThemedText>
                                    </ThemedView>
                                )}

                                {/* Remember Me Checkbox */}
                                {!isSignUp && (
                                    <ThemedView style={styles.rememberContainer}>
                                        <TouchableOpacity style={styles.checkbox}>
                                            <Feather name="square" size={20} color="#874E3B" />
                                        </TouchableOpacity>
                                        <ThemedText style={styles.rememberText}>Remember me</ThemedText>
                                    </ThemedView>
                                )}

                                {/* Action Button */}
                                <TouchableOpacity
                                    style={[
                                        styles.actionButton,
                                        loading && styles.actionButtonDisabled
                                    ]}
                                    onPress={isSignUp ? handleSignUp : handleLogin}
                                    disabled={loading}
                                >
                                    <ThemedText style={styles.actionButtonText}>
                                        {loading ? 'Please Wait...' : (isSignUp ? 'Create Account' : 'Sign In')}
                                    </ThemedText>
                                </TouchableOpacity>

                                {/* Toggle Mode */}
                                <TouchableOpacity
                                    style={styles.toggleButton}
                                    onPress={toggleMode}
                                >
                                    <ThemedText style={styles.toggleButtonText}>
                                        {isSignUp
                                            ? 'Already have an account? Sign In'
                                            : "Don't have an account? Create Account"
                                        }
                                    </ThemedText>
                                </TouchableOpacity>


                            </ThemedView>
                        </ThemedView>
                    </ScrollView>
                </KeyboardAvoidingView>
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
    keyboardAvoid: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 20,
    },
    loginCard: {
        backgroundColor: "#fffecaF2",
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: '#874E3B',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4,
        maxWidth: 400, // Limit maximum width
        width: '100%', // Take full width on small screens
        alignSelf: 'center', // Center the card
    },
    header: {
        alignItems: 'center',
        marginBottom: 24,
        backgroundColor: '#874E3B',
        borderRadius: 50,

    },
    title: {
        fontSize: 50,
        lineHeight: 65,
        color: '#fffecaF2',
        fontFamily: 'GreatVibes',
        textAlign: 'center',
        marginTop: 4
    },
    subtitle: {
        fontSize: 20,
        color: '#fffecaF2',
        marginTop: 4,
        textAlign: 'center',
        fontFamily: 'LobsterTwoRegular',
    },
    form: {
        gap: 16,
        backgroundColor: '#fffecaF2',
    },
    inputContainer: {
        gap: 6,
        backgroundColor: '#fffecaF2',
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#5A3921',
        marginLeft: 4,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D4A574',
        borderRadius: 8,
        paddingHorizontal: 12,
    },
    inputIcon: {
        marginRight: 8,
    },
    textInput: {
        flex: 1,
        fontSize: 14,
        color: '#5A3921',
        paddingVertical: 10,
    },
    eyeIcon: {
        padding: 4,
    },
    roleContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    roleButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: '#F5E6D3',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    roleButtonActive: {
        backgroundColor: '#874E3B',
        borderColor: '#874E3B',
    },
    roleButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#874E3B',
    },
    roleButtonTextActive: {
        color: '#FFFEEA',
    },
    roleHelpText: {
        fontSize: 11,
        color: '#5A3921',
        fontStyle: 'italic',
        marginTop: 2,
    },
    rememberContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#fffecaF2'
    },
    checkbox: {
        padding: 2,
    },
    rememberText: {
        fontSize: 14,
        color: '#5A3921',
    },
    actionButton: {
        backgroundColor: '#874E3B',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 2,
    },
    actionButtonDisabled: {
        backgroundColor: '#A8A29E',
    },
    actionButtonText: {
        color: '#FFFEEA',
        fontSize: 16,
        fontWeight: 'bold',
    },
    toggleButton: {
        paddingVertical: 8,
        alignItems: 'center',
    },
    toggleButtonText: {
        fontSize: 13,
        color: '#874E3B',
        fontWeight: '600',
    },
    infoContainer: {
        marginTop: 1,
        padding: 8,
        backgroundColor: '#F5E6D3',
        borderRadius: 6,
        borderLeftWidth: 3,
        borderLeftColor: '#D4A574',
    },
    infoText: {
        fontSize: 11,
        color: '#5A3921',
        textAlign: 'center',
        fontWeight: '500',
    },
});