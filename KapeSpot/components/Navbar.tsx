// components/Navbar.tsx
import {
    StyleSheet,
    TouchableOpacity,
    View,
    useWindowDimensions,
    Animated,
    Easing,
    Platform
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import Sidebar from './sidebar';
import { LinearGradient } from 'expo-linear-gradient';

interface NavbarProps {
    cartItemCount?: number;
    onCartPress?: () => void;
    activeNav?: string;
}

export default function Navbar({ cartItemCount = 0, onCartPress, activeNav }: NavbarProps) {
    const router = useRouter();
    const { width: screenWidth } = useWindowDimensions();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    
    // Animation values
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const rotateAnim = useRef(new Animated.Value(0)).current;
    const cartScaleAnim = useRef(new Animated.Value(1)).current;
    const menuRotateAnim = useRef(new Animated.Value(0)).current;
    const shadowAnim = useRef(new Animated.Value(0)).current;

    const isSmallScreen = screenWidth < 768;

    useEffect(() => {
        // Subtle rotation animation for coffee cup icon
        Animated.loop(
            Animated.sequence([
                Animated.timing(rotateAnim, {
                    toValue: 1,
                    duration: 3000,
                    useNativeDriver: true,
                    easing: Easing.inOut(Easing.sin)
                }),
                Animated.timing(rotateAnim, {
                    toValue: 0,
                    duration: 3000,
                    useNativeDriver: true,
                    easing: Easing.inOut(Easing.sin)
                })
            ])
        ).start();

        // Shadow animation for depth
        Animated.loop(
            Animated.sequence([
                Animated.timing(shadowAnim, {
                    toValue: 1,
                    duration: 2000,
                    useNativeDriver: false,
                    easing: Easing.inOut(Easing.sin)
                }),
                Animated.timing(shadowAnim, {
                    toValue: 0,
                    duration: 2000,
                    useNativeDriver: false,
                    easing: Easing.inOut(Easing.sin)
                })
            ])
        ).start();
    }, []);

    const rotateInterpolate = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '10deg']
    });

    const shadowInterpolate = shadowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [8, 12]
    });

    const openSidebar = () => {
        // Animate menu button
        Animated.sequence([
            Animated.timing(menuRotateAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
                easing: Easing.ease
            }),
            Animated.timing(menuRotateAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
                easing: Easing.ease
            })
        ]).start();
        
        setIsSidebarOpen(true);
    };

    const closeSidebar = () => {
        setIsSidebarOpen(false);
    };

    const handleCartPress = () => {
        // Animate cart button
        Animated.sequence([
            Animated.timing(cartScaleAnim, {
                toValue: 1.2,
                duration: 150,
                useNativeDriver: true,
                easing: Easing.ease
            }),
            Animated.timing(cartScaleAnim, {
                toValue: 1,
                duration: 150,
                useNativeDriver: true,
                easing: Easing.ease
            })
        ]).start();

        if (onCartPress) {
            onCartPress();
        }
    };

    const handleLogoPress = () => {
        // Animate logo
        Animated.sequence([
            Animated.timing(scaleAnim, {
                toValue: 1.1,
                duration: 200,
                useNativeDriver: true,
                easing: Easing.ease
            }),
            Animated.timing(scaleAnim, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
                easing: Easing.ease
            })
        ]).start();

        router.push('/(tabs)/pos');
    };

    // Handle inventory sub-menu selection from sidebar
    const handleInventorySubMenuChange = (subMenu: 'food-items' | 'categories' | 'cups') => {
        // Navigate to items page with the selected sub-menu as a parameter
        router.push({
            pathname: '/items',
            params: { subMenu: subMenu }
        });
        // Close sidebar after navigation
        closeSidebar();
    };

    const menuRotateInterpolate = menuRotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '90deg']
    });

    return (
        <>
            <LinearGradient
                colors={['#854442', '#6d3a38', '#854442']}
                style={styles.navbarGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
            >
                <Animated.View 
                    style={[
                        styles.navbar,
                        {
                            shadowOpacity: shadowAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.2, 0.35]
                            }),
                            elevation: shadowAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [8, 12]
                            })
                        }
                    ]}
                >
                    {/* Menu Button - Left Side with 3D effect */}
                    <TouchableOpacity 
                        style={styles.menuButton} 
                        onPress={openSidebar}
                        activeOpacity={0.8}
                    >
                        <LinearGradient
                            colors={['rgba(223, 204, 175, 0.2)', 'rgba(223, 204, 175, 0.1)']}
                            style={styles.menuButtonGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <Animated.View style={{ transform: [{ rotate: menuRotateInterpolate }] }}>
                                <Feather name="menu" size={24} color="#dfccaf" />
                            </Animated.View>
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* Logo - Center with 3D animation */}
                    <TouchableOpacity 
                        style={styles.logoContainer} 
                        onPress={handleLogoPress}
                        activeOpacity={0.7}
                    >
                        <Animated.View 
                            style={[
                                styles.logoIconWrapper,
                                {
                                    transform: [
                                        { scale: scaleAnim },
                                        { rotate: rotateInterpolate }
                                    ]
                                }
                            ]}
                        >
                            <LinearGradient
                                colors={['#dfccaf', '#d4be9a']}
                                style={styles.logoIconGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <MaterialCommunityIcons name="coffee" size={28} color="#854442" />
                            </LinearGradient>
                        </Animated.View>
                        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                            <ThemedText style={styles.navbarTitle}>
                                KAPESPOT
                            </ThemedText>
                        </Animated.View>
                    </TouchableOpacity>

                    {/* Cart Button - Right Side with 3D effect */}
                    <TouchableOpacity 
                        style={styles.cartButton} 
                        onPress={handleCartPress}
                        activeOpacity={0.8}
                    >
                        <LinearGradient
                            colors={['rgba(223, 204, 175, 0.2)', 'rgba(223, 204, 175, 0.1)']}
                            style={styles.cartButtonGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <Animated.View style={{ transform: [{ scale: cartScaleAnim }] }}>
                                <Feather name="shopping-cart" size={24} color="#dfccaf" />
                            </Animated.View>
                            {cartItemCount > 0 && (
                                <Animated.View 
                                    style={[
                                        styles.cartBadge,
                                        {
                                            transform: [{ scale: cartScaleAnim }]
                                        }
                                    ]}
                                >
                                    <LinearGradient
                                        colors={['#DC2626', '#B91C1C']}
                                        style={styles.badgeGradient}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                    >
                                        <ThemedText style={styles.cartBadgeText}>{cartItemCount}</ThemedText>
                                    </LinearGradient>
                                </Animated.View>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>
            </LinearGradient>

            {/* Sidebar Component with inventory sub-menu callback */}
            <Sidebar 
                isOpen={isSidebarOpen} 
                onClose={closeSidebar} 
                activeNav={activeNav}
                onInventorySubMenuChange={handleInventorySubMenuChange}
            />
        </>
    );
}

const styles = StyleSheet.create({
    navbarGradient: {
        borderBottomLeftRadius: 25,
        borderBottomRightRadius: 25,
        ...Platform.select({
            ios: {
                shadowColor: '#854442',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 10,
            },
            android: {
                elevation: 10,
            },
        }),
    },
    navbar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: 'transparent',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(223, 204, 175, 0.2)',
        borderBottomLeftRadius: 25,
        borderBottomRightRadius: 25,
        marginTop: 10
    },
    menuButton: {
        width: 48,
        height: 48,
        borderRadius: 16,
        overflow: 'hidden',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
            },
            android: {
                elevation: 4,
            },
        }),
    },
    menuButtonGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(223, 204, 175, 0.3)',
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    logoIconWrapper: {
        width: 44,
        height: 44,
        borderRadius: 22,
        overflow: 'hidden',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
            },
            android: {
                elevation: 5,
            },
        }),
    },
    logoIconGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 22,
    },
    navbarTitle: {
        fontSize: 23,
        fontFamily: 'LobsterTwoRegular',
        color: '#dfccaf',
        letterSpacing: 1.5,
        textShadowColor: 'rgba(0, 0, 0, 0.4)',
        textShadowOffset: { width: 2, height: 2 },
        textShadowRadius: 4,
        fontWeight: '600',
    },
    cartButton: {
        width: 48,
        height: 48,
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
            },
            android: {
                elevation: 4,
            },
        }),
    },
    cartButtonGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(223, 204, 175, 0.3)',
    },
    cartBadge: {
        position: 'absolute',
        top: -5,
        right: -5,
        borderRadius: 12,
        minWidth: 20,
        height: 20,
        overflow: 'hidden',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.3,
                shadowRadius: 2,
            },
            android: {
                elevation: 3,
            },
        }),
    },
    badgeGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 5,
    },
    cartBadgeText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: 'bold',
    },
});