import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { Link } from 'expo-router';

export default function HomeScreen() {
    return (
        <View style={styles.container}>
            <View style={styles.titleContainer}>
                <Text style={styles.title}>Welcome!</Text>
            </View>

            {/* POS Navigation Button */}
            <View style={styles.buttonContainer}>
                <Link href="/pos" asChild>
                    <TouchableOpacity style={styles.restaurantButton}>
                        <Text style={styles.restaurantButtonText}>
                            Go to POS System
                        </Text>
                    </TouchableOpacity>
                </Link>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
    },
    titleContainer: {
        marginBottom: 40,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#333',
    },
    buttonContainer: {
        alignItems: 'center',
    },
    restaurantButton: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 24,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        minWidth: 200,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    restaurantButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
});