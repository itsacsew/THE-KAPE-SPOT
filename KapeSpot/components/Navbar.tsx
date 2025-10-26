// components/Navbar.tsx
import { StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather } from "@expo/vector-icons";
import { useRouter, usePathname } from 'expo-router';

interface NavbarProps {
    activeNav?: string;
}

export default function Navbar({ activeNav }: NavbarProps) {
    const router = useRouter();
    const pathname = usePathname();

    // Determine active nav based on current route
    const currentActiveNav = activeNav || (pathname === '/pos' ? 'pos' :
        pathname === '/items' ? 'items' : 'pos');

    const navigateTo = (route: '/' | '/pos' | '/items', nav: string) => {
        if (route !== pathname) {
            router.push(route as any);
        }
    };

    return (
        <ThemedView style={styles.navbar}>
            <ThemedText style={styles.navbarTitle}>
                THE <ThemedText style={styles.sectionTitle1}>KAPE </ThemedText> SPOT
            </ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.navbarScroll}>

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
                    onPress={() => console.log('Sales clicked')}
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

                {/* Account Circle */}
                <TouchableOpacity
                    style={styles.accountCircle}
                    onPress={() => console.log('Account clicked')}
                >
                    <Feather
                        name="user"
                        size={20}
                        color={currentActiveNav === 'account' ? '#874E3B' : '#874E3B'}
                    />
                    {currentActiveNav === 'account' && <ThemedView style={styles.activeIndicator} />}
                </TouchableOpacity>

            </ScrollView>
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
        marginRight: 5
    },
    navbarTitle: {
        fontSize: 25,
        fontFamily: 'LobsterTwoRegular',
        color: '#FFFEEA',
        marginRight: 50,
        marginTop: 12
    },
    navbarScroll: {
        flex: 1,
    },
    navLink: {
        paddingHorizontal: 15,
        paddingVertical: 10,
        position: 'relative',
        marginTop: 5,
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
        marginLeft: 15,
        marginTop: 5,
        position: 'relative',
    },
    sectionTitle1: {
        fontSize: 30,
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
});