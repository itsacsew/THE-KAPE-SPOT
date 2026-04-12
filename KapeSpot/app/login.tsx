// app/login.tsx
import { useState, useRef, useEffect } from 'react';
import {
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ImageBackground,
    Alert,
    ScrollView,
    KeyboardAvoidingView,
    Platform,
    View,
    Keyboard,
    TouchableWithoutFeedback,
    Dimensions,
    Animated,
    Easing
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from 'expo-router';
import { OfflineSyncService } from '@/lib/offline-sync';
import React from 'react';
import {
    getFirestore,
    collection,
    query,
    where,
    getDocs,
    doc,
    setDoc
} from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { app } from '@/lib/firebase-config';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

interface User {
    id: string;
    username: string;
    name: string;
    role: 'admin' | 'user';
    email?: string;
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
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const router = useRouter();
    const scrollViewRef = useRef<ScrollView>(null);
    
    // Animation values
    const fadeAnim = useState(new Animated.Value(0))[0];
    const slideAnim = useState(new Animated.Value(50))[0];
    const scaleAnim = useState(new Animated.Value(0.95))[0];
    const rotateAnim = useState(new Animated.Value(0))[0];
    const steamAnim1 = useState(new Animated.Value(0))[0];
    const steamAnim2 = useState(new Animated.Value(0))[0];
    const steamAnim3 = useState(new Animated.Value(0))[0];
    
    const db = getFirestore(app);
    const auth = getAuth(app);

    // Monitor keyboard visibility
    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
            setKeyboardVisible(true);
        });
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
            setKeyboardVisible(false);
        });

        // Entrance animations
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 800,
                useNativeDriver: true,
                easing: Easing.out(Easing.cubic)
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 600,
                useNativeDriver: true,
                easing: Easing.out(Easing.back(0.5))
            }),
            Animated.timing(scaleAnim, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
                easing: Easing.out(Easing.elastic(1))
            })
        ]).start();

        // Subtle rotation animation for coffee cup icon
        Animated.loop(
            Animated.sequence([
                Animated.timing(rotateAnim, {
                    toValue: 1,
                    duration: 2000,
                    useNativeDriver: true,
                    easing: Easing.inOut(Easing.sin)
                }),
                Animated.timing(rotateAnim, {
                    toValue: 0,
                    duration: 2000,
                    useNativeDriver: true,
                    easing: Easing.inOut(Easing.sin)
                })
            ])
        ).start();

        // Steam animations
        const animateSteam = (steamAnim: Animated.Value, delay: number) => {
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(steamAnim, {
                        toValue: 1,
                        duration: 2000,
                        useNativeDriver: true,
                        easing: Easing.inOut(Easing.sin)
                    }),
                    Animated.timing(steamAnim, {
                        toValue: 0,
                        duration: 2000,
                        useNativeDriver: true,
                        easing: Easing.inOut(Easing.sin)
                    })
                ])
            ).start();
        };

        animateSteam(steamAnim1, 0);
        animateSteam(steamAnim2, 500);
        animateSteam(steamAnim3, 1000);

        return () => {
            keyboardDidShowListener.remove();
            keyboardDidHideListener.remove();
        };
    }, []);

    const rotateInterpolate = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['-5deg', '5deg']
    });

    const steam1Translate = steamAnim1.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -30]
    });

    const steam1Opacity = steamAnim1.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0.6, 0]
    });

    const steam2Translate = steamAnim2.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -25]
    });

    const steam2Opacity = steamAnim2.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0.5, 0]
    });

    const steam3Translate = steamAnim3.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -35]
    });

    const steam3Opacity = steamAnim3.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0.7, 0]
    });

    const handleLogin = async () => {
        Keyboard.dismiss();
        
        if (!username.trim() || !password.trim()) {
            Alert.alert('Missing Information', 'Please enter both username and password');
            return;
        }

        setLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();

            console.log('🔄 [FIREBASE-LOGIN] Starting Firebase login process...');

            try {
                const usersRef = collection(db, 'users');
                const q = query(usersRef, where('username', '==', username.toLowerCase()));
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    throw new Error('User not found');
                }

                const userDoc = querySnapshot.docs[0];
                const userData = userDoc.data();
                const userEmail = userData.email || `${username}@kapespot.com`;

                const userCredential = await signInWithEmailAndPassword(auth, userEmail, password);
                const firebaseUser = userCredential.user;

                if (firebaseUser && userData) {
                    console.log('✅ [FIREBASE-LOGIN] Login successful');

                    const user: User = {
                        id: userDoc.id,
                        username: userData.username,
                        name: userData.name,
                        role: userData.role
                    };

                    await syncService.setItem('currentUser', JSON.stringify(user));
                    router.replace('/(tabs)/pos');
                    
                    Alert.alert('✨ Welcome Back!', `Great to see you again, ${user.name}! ☕`);
                    return;
                } else {
                    throw new Error('Firebase login failed');
                }
            } catch (firebaseError) {
                console.log('⚠️ Firebase login failed, trying offline...', firebaseError);
            }

            console.log('📱 Attempting OFFLINE login...');
            const offlineUsersData = await syncService.getItem('users');
            const offlineUsers = offlineUsersData ? JSON.parse(offlineUsersData) : [];

            const offlineUser = offlineUsers.find((u: any) =>
                u.username.toLowerCase() === username.toLowerCase() &&
                u.password === password
            );

            if (offlineUser) {
                console.log('✅ OFFLINE login successful');
                const { password: _, ...userWithoutPassword } = offlineUser;
                await syncService.setItem('currentUser', JSON.stringify(userWithoutPassword));
                router.replace('/(tabs)/pos');
                Alert.alert('✨ Welcome Back! (Offline)', `Good to see you, ${offlineUser.name}! ☕`);
            } else {
                Alert.alert('Login Failed', 'Invalid username or password. Please try again.');
            }

        } catch (error) {
            console.error('❌ Login error:', error);
            Alert.alert('Login Error', 'An error occurred during login. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSignUp = async () => {
        Keyboard.dismiss();
        
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
            const userEmail = `${username}@kapespot.com`;
            const newUser = {
                username: username.toLowerCase(),
                name: name,
                role: selectedRole,
                email: userEmail,
                createdAt: new Date().toISOString()
            };

            try {
                const usersRef = collection(db, 'users');
                const q = query(usersRef, where('username', '==', username.toLowerCase()));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    Alert.alert('Username Exists', 'This username is already taken');
                    setLoading(false);
                    return;
                }

                const userCredential = await createUserWithEmailAndPassword(auth, userEmail, password);
                const firebaseUser = userCredential.user;
                const userDocRef = doc(collection(db, 'users'));
                
                await setDoc(userDocRef, {
                    ...newUser,
                    id: userDocRef.id,
                    firebaseUID: firebaseUser.uid
                });

                console.log('✅ Firebase registration successful');

                const createdUser: User = {
                    id: userDocRef.id,
                    username: newUser.username,
                    name: newUser.name,
                    role: newUser.role
                };

                await syncService.setItem('currentUser', JSON.stringify(createdUser));

                const existingUsers = await syncService.getItem('users');
                const users = existingUsers ? JSON.parse(existingUsers) : [];
                users.push({ ...newUser, id: userDocRef.id, password: password });
                await syncService.setItem('users', JSON.stringify(users));

                Alert.alert(
                    '🎉 Registration Successful!',
                    `Welcome to KapeSpot, ${createdUser.name}! Your ${createdUser.role} account has been created. ☕`,
                    [{ text: 'OK', onPress: () => {
                        setUsername('');
                        setPassword('');
                        setConfirmPassword('');
                        setName('');
                        setSelectedRole('user');
                        setIsSignUp(false);
                    }}]
                );
                return;

            } catch (firebaseError: any) {
                console.log('⚠️ Firebase registration failed, saving offline...', firebaseError);
                if (firebaseError.code === 'auth/email-already-in-use') {
                    Alert.alert('Username Exists', 'This username is already taken');
                    setLoading(false);
                    return;
                }
            }

            console.log('📱 Saving OFFLINE registration...');
            const existingUsers = await syncService.getItem('users');
            const users = existingUsers ? JSON.parse(existingUsers) : [];

            if (users.find((u: any) => u.username.toLowerCase() === username.toLowerCase())) {
                Alert.alert('Username Exists', 'This username is already taken');
                setLoading(false);
                return;
            }

            const offlineUser = {
                ...newUser,
                id: Date.now().toString(),
                password: password
            };

            users.push(offlineUser);
            await syncService.setItem('users', JSON.stringify(users));

            const { password: _, ...userWithoutPassword } = offlineUser;
            await syncService.setItem('currentUser', JSON.stringify(userWithoutPassword));

            Alert.alert(
                '🎉 Registration Successful! (Offline)',
                `Welcome to KapeSpot, ${userWithoutPassword.name}! Your account has been created. ☕`,
                [{ text: 'OK', onPress: () => {
                    setUsername('');
                    setPassword('');
                    setConfirmPassword('');
                    setName('');
                    setSelectedRole('user');
                    setIsSignUp(false);
                }}]
            );

        } catch (error) {
            console.error('❌ Registration error:', error);
            Alert.alert('Registration Error', 'An error occurred during registration.');
        } finally {
            setLoading(false);
        }
    };

    const toggleMode = () => {
        Keyboard.dismiss();
        setIsSignUp(!isSignUp);
        setUsername('');
        setPassword('');
        setConfirmPassword('');
        setName('');
        setSelectedRole('user');
    };

    return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.container}>
                <ImageBackground
                    source={require('@/assets/images/kape1.png')}
                    style={styles.backgroundImage}
                    resizeMode="cover"
                >
                    {/* Overlay for better text contrast */}
                    <LinearGradient
                        colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.7)']}
                        style={styles.overlay}
                    />
                    
                    <KeyboardAvoidingView
                        style={styles.keyboardAvoid}
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                    >
                        <ScrollView
                            ref={scrollViewRef}
                            contentContainerStyle={styles.scrollContent}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            bounces={false}
                        >
                            <Animated.View
                                style={[
                                    styles.loginCard,
                                    {
                                        opacity: fadeAnim,
                                        transform: [
                                            { translateY: slideAnim },
                                            { scale: scaleAnim }
                                        ]
                                    }
                                ]}
                            >
                                {/* Decorative coffee steam effects */}
                                <View style={styles.steamContainer}>
                                    <Animated.View 
                                        style={[
                                            styles.steam, 
                                            styles.steam1,
                                            {
                                                transform: [{ translateY: steam1Translate }],
                                                opacity: steam1Opacity
                                            }
                                        ]} 
                                    />
                                    <Animated.View 
                                        style={[
                                            styles.steam, 
                                            styles.steam2,
                                            {
                                                transform: [{ translateY: steam2Translate }],
                                                opacity: steam2Opacity
                                            }
                                        ]} 
                                    />
                                    <Animated.View 
                                        style={[
                                            styles.steam, 
                                            styles.steam3,
                                            {
                                                transform: [{ translateY: steam3Translate }],
                                                opacity: steam3Opacity
                                            }
                                        ]} 
                                    />
                                </View>

                                <LinearGradient
                                    colors={['#dfccaf', '#d4be9a']}
                                    style={styles.cardGradient}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                >
                                    <View style={styles.header}>
                                        <Animated.View style={{ transform: [{ rotate: rotateInterpolate }] }}>
                                            <MaterialCommunityIcons name="coffee" size={60} color="#854442" />
                                        </Animated.View>
                                        <ThemedText style={styles.title}>KapeSpot</ThemedText>
                                        <ThemedText style={styles.subtitle}>
                                            {isSignUp ? 'Create Your Account' : 'Welcome Back'}
                                        </ThemedText>
                                        <View style={styles.divider} />
                                    </View>

                                    <View style={styles.form}>
                                        {isSignUp && (
                                            <View style={styles.inputContainer}>
                                                <ThemedText style={styles.inputLabel}>
                                                    <Feather name="user" size={14} color="#854442" /> Full Name
                                                </ThemedText>
                                                <View style={styles.inputWrapper}>
                                                    <Feather name="user" size={18} color="#854442" style={styles.inputIcon} />
                                                    <TextInput
                                                        style={styles.textInput}
                                                        value={name}
                                                        onChangeText={setName}
                                                        placeholder="Enter your full name"
                                                        placeholderTextColor="#9CA3AF"
                                                        autoCapitalize="words"
                                                        returnKeyType="next"
                                                    />
                                                </View>
                                            </View>
                                        )}

                                        <View style={styles.inputContainer}>
                                            <ThemedText style={styles.inputLabel}>
                                                <Feather name="at-sign" size={14} color="#854442" /> Username
                                            </ThemedText>
                                            <View style={styles.inputWrapper}>
                                                <Feather name="user" size={18} color="#854442" style={styles.inputIcon} />
                                                <TextInput
                                                    style={styles.textInput}
                                                    value={username}
                                                    onChangeText={setUsername}
                                                    placeholder="Enter your username"
                                                    placeholderTextColor="#9CA3AF"
                                                    autoCapitalize="none"
                                                    autoCorrect={false}
                                                    returnKeyType="next"
                                                />
                                            </View>
                                        </View>

                                        <View style={styles.inputContainer}>
                                            <ThemedText style={styles.inputLabel}>
                                                <Feather name="lock" size={14} color="#854442" /> Password
                                            </ThemedText>
                                            <View style={styles.inputWrapper}>
                                                <Feather name="lock" size={18} color="#854442" style={styles.inputIcon} />
                                                <TextInput
                                                    style={styles.textInput}
                                                    value={password}
                                                    onChangeText={setPassword}
                                                    placeholder="Enter your password"
                                                    placeholderTextColor="#9CA3AF"
                                                    secureTextEntry={!showPassword}
                                                    autoCapitalize="none"
                                                    returnKeyType={isSignUp ? "next" : "done"}
                                                />
                                                <TouchableOpacity
                                                    style={styles.eyeIcon}
                                                    onPress={() => setShowPassword(!showPassword)}
                                                >
                                                    <Feather
                                                        name={showPassword ? "eye" : "eye-off"}
                                                        size={18}
                                                        color="#854442"
                                                    />
                                                </TouchableOpacity>
                                            </View>
                                        </View>

                                        {isSignUp && (
                                            <>
                                                <View style={styles.inputContainer}>
                                                    <ThemedText style={styles.inputLabel}>
                                                        <Feather name="lock" size={14} color="#854442" /> Confirm Password
                                                    </ThemedText>
                                                    <View style={styles.inputWrapper}>
                                                        <Feather name="lock" size={18} color="#854442" style={styles.inputIcon} />
                                                        <TextInput
                                                            style={styles.textInput}
                                                            value={confirmPassword}
                                                            onChangeText={setConfirmPassword}
                                                            placeholder="Confirm your password"
                                                            placeholderTextColor="#9CA3AF"
                                                            secureTextEntry={!showConfirmPassword}
                                                            autoCapitalize="none"
                                                            returnKeyType="done"
                                                        />
                                                        <TouchableOpacity
                                                            style={styles.eyeIcon}
                                                            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                                                        >
                                                            <Feather
                                                                name={showConfirmPassword ? "eye" : "eye-off"}
                                                                size={18}
                                                                color="#854442"
                                                            />
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>

                                                <View style={styles.inputContainer}>
                                                    <ThemedText style={styles.inputLabel}>
                                                        <Feather name="users" size={14} color="#854442" /> Account Type
                                                    </ThemedText>
                                                    <View style={styles.roleContainer}>
                                                        <TouchableOpacity
                                                            style={[
                                                                styles.roleButton,
                                                                selectedRole === 'user' && styles.roleButtonActive
                                                            ]}
                                                            onPress={() => setSelectedRole('user')}
                                                        >
                                                            <Feather 
                                                                name="user" 
                                                                size={16} 
                                                                color={selectedRole === 'user' ? '#dfccaf' : '#854442'} 
                                                            />
                                                            <ThemedText style={[
                                                                styles.roleButtonText,
                                                                selectedRole === 'user' && styles.roleButtonTextActive
                                                            ]}>
                                                                Regular User
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
                                                                size={16} 
                                                                color={selectedRole === 'admin' ? '#dfccaf' : '#854442'} 
                                                            />
                                                            <ThemedText style={[
                                                                styles.roleButtonText,
                                                                selectedRole === 'admin' && styles.roleButtonTextActive
                                                            ]}>
                                                                Admin
                                                            </ThemedText>
                                                        </TouchableOpacity>
                                                    </View>
                                                    <ThemedText style={styles.roleHelpText}>
                                                        {selectedRole === 'admin'
                                                            ? '👑 Admin users have full access to all features'
                                                            : '☕ Regular users can access POS and basic features'
                                                        }
                                                    </ThemedText>
                                                </View>
                                            </>
                                        )}

                                        <TouchableOpacity
                                            style={[
                                                styles.actionButton,
                                                loading && styles.actionButtonDisabled
                                            ]}
                                            onPress={isSignUp ? handleSignUp : handleLogin}
                                            disabled={loading}
                                            activeOpacity={0.8}
                                        >
                                            <LinearGradient
                                                colors={['#854442', '#6d3a38']}
                                                style={styles.buttonGradient}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                            >
                                                <ThemedText style={styles.actionButtonText}>
                                                    {loading ? 'Please Wait...' : (isSignUp ? 'Create Account' : 'Sign In')}
                                                </ThemedText>
                                                {!loading && (
                                                    <Feather 
                                                        name={isSignUp ? "user-plus" : "log-in"} 
                                                        size={18} 
                                                        color="#dfccaf" 
                                                        style={styles.buttonIcon}
                                                    />
                                                )}
                                            </LinearGradient>
                                        </TouchableOpacity>

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
                                    </View>
                                </LinearGradient>
                            </Animated.View>
                        </ScrollView>
                    </KeyboardAvoidingView>
                </ImageBackground>
            </View>
        </TouchableWithoutFeedback>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    backgroundImage: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    keyboardAvoid: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingVertical: 20,
    },
    loginCard: {
        borderRadius: 30,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 10,
        },
        shadowOpacity: 0.5,
        shadowRadius: 15,
        elevation: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    cardGradient: {
        padding: 24,
    },
    steamContainer: {
        position: 'absolute',
        top: 10,
        left: 0,
        right: 0,
        height: 60,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 20,
        zIndex: 1,
    },
    steam: {
        width: 4,
        height: 30,
        backgroundColor: 'rgba(255,255,255,0.4)',
        borderRadius: 2,
    },
    steam1: {
        transform: [{ translateY: -10 }],
    },
    steam2: {
        transform: [{ translateY: -20 }],
        height: 40,
    },
    steam3: {
        transform: [{ translateY: -15 }],
    },
    header: {
        alignItems: 'center',
        marginBottom: 28,
    },
    title: {
        fontSize: 48,
        lineHeight: 55,
        color: '#854442',
        fontFamily: 'GreatVibes',
        textAlign: 'center',
        marginTop: 8,
        textShadowColor: 'rgba(0,0,0,0.1)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 5,
    },
    subtitle: {
        fontSize: 20,
        color: '#854442',
        marginTop: 4,
        textAlign: 'center',
        fontFamily: 'LobsterTwoRegular',
        fontWeight: '600',
    },
    divider: {
        width: 60,
        height: 3,
        backgroundColor: '#854442',
        marginTop: 12,
        borderRadius: 2,
    },
    form: {
        gap: 16,
    },
    inputContainer: {
        gap: 6,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#854442',
        marginLeft: 4,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#854442',
        borderRadius: 12,
        paddingHorizontal: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    inputIcon: {
        marginRight: 8,
    },
    textInput: {
        flex: 1,
        fontSize: 14,
        color: '#333',
        paddingVertical: 12,
    },
    eyeIcon: {
        padding: 4,
    },
    roleContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 4,
    },
    roleButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 12,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#854442',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    roleButtonActive: {
        backgroundColor: '#854442',
        borderColor: '#854442',
        shadowColor: '#854442',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 5,
    },
    roleButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#854442',
    },
    roleButtonTextActive: {
        color: '#dfccaf',
    },
    roleHelpText: {
        fontSize: 11,
        color: '#854442',
        fontStyle: 'italic',
        marginTop: 4,
        textAlign: 'center',
    },
    actionButton: {
        borderRadius: 12,
        marginTop: 8,
        overflow: 'hidden',
        shadowColor: '#854442',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    buttonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 20,
    },
    actionButtonDisabled: {
        opacity: 0.6,
    },
    actionButtonText: {
        color: '#dfccaf',
        fontSize: 16,
        fontWeight: 'bold',
        marginRight: 8,
    },
    buttonIcon: {
        marginLeft: 4,
    },
    toggleButton: {
        paddingVertical: 10,
        alignItems: 'center',
    },
    toggleButtonText: {
        fontSize: 14,
        color: '#854442',
        fontWeight: '600',
        textDecorationLine: 'underline',
    },
});