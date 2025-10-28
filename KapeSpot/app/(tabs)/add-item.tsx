// app/(tabs)/add-item.tsx
import { useState, useEffect } from 'react';
import {
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ImageBackground,
    Alert,
    Image,
    StatusBar,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather } from "@expo/vector-icons";
import Navbar from '@/components/Navbar';
import { router } from 'expo-router';
import { NetworkScanner } from '@/lib/network-scanner';
import { OfflineSyncService } from '@/lib/offline-sync';
import * as NavigationBar from 'expo-navigation-bar';

interface Category {
    id: string;
    name: string;
}

export default function AddItemScreen() {
    const [loading, setLoading] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);
    const [apiBaseUrl, setApiBaseUrl] = useState<string>('demo');

    // New item form state
    const [newItem, setNewItem] = useState({
        name: '',
        code: '',
        price: '',
        category: '',
        stocks: '',
        description: ''
    });

    const [imageUri, setImageUri] = useState<string | null>(null);

    // Function to hide ALL navigation bars (status bar + navigation bar)
    const hideAllBars = async () => {
        try {
            // Hide status bar (top bar with time, battery, etc.)
            StatusBar.setHidden(true);

            // Hide navigation bar (bottom bar with home, back, etc.)
            await NavigationBar.setVisibilityAsync('hidden');


        } catch (error) {
            console.log('❌ Error hiding bars:', error);
        }
    };

    // Function to restore ALL navigation bars
    const restoreAllBars = async () => {
        try {
            // Restore status bar
            StatusBar.setHidden(false);

            // Restore navigation bar
            await NavigationBar.setVisibilityAsync('visible');

            console.log('🔓 All bars restored');
        } catch (error) {
            console.log('❌ Error restoring bars:', error);
        }
    };

    // Hide ALL bars on component mount
    useEffect(() => {
        hideAllBars();

        // Add interval to constantly check and hide bars (backup)
        const barCheckInterval = setInterval(() => {
            hideAllBars();
        }, 1500); // Check every 1.5 seconds

        // Restore when component unmounts
        return () => {
            clearInterval(barCheckInterval);
            restoreAllBars();
        };
    }, []);

    // Function to get dynamic API URL
    const getApiBaseUrl = async (): Promise<string> => {
        try {
            const serverIP = await NetworkScanner.findServerIP();
            if (serverIP === 'demo') {
                console.log('🔄 Running in demo mode');
                return 'demo';
            }
            const baseUrl = `http://${serverIP}/backend/api`;
            console.log(`🌐 Using server: ${baseUrl}`);
            return baseUrl;
        } catch (error) {
            console.log('❌ Error detecting server, using demo mode');
            return 'demo';
        }
    };

    // Load categories from API
    const loadCategories = async () => {
        try {
            const API_BASE_URL = await getApiBaseUrl();
            setApiBaseUrl(API_BASE_URL);

            if (API_BASE_URL === 'demo') {
                console.log('📱 Using demo categories');
                // Set demo categories
                setCategories([
                    { id: '1', name: 'Fast Food' },
                    { id: '2', name: 'Pizza' },
                    { id: '3', name: 'Pasta' },
                    { id: '4', name: 'Sandwich' },
                    { id: '5', name: 'Beverages' },
                    { id: '6', name: 'Dessert' },
                    { id: '7', name: 'Main Course' },
                ]);
                return;
            }

            console.log('🔗 Fetching categories from server...');
            const response = await fetch(`${API_BASE_URL}/categories.php`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('📦 Categories loaded:', data);
            setCategories(data);

        } catch (error) {
            console.error('❌ Error loading categories:', error);
            // Fallback to demo categories
            setCategories([
                { id: '1', name: 'Fast Food' },
                { id: '2', name: 'Pizza' },
                { id: '3', name: 'Pasta' },
                { id: '4', name: 'Sandwich' },
                { id: '5', name: 'Beverages' },
                { id: '6', name: 'Dessert' },
                { id: '7', name: 'Main Course' },
            ]);
        }
    };

    useEffect(() => {
        loadCategories();
        requestPermissions();
    }, []);

    // Request permissions for camera and media library
    const requestPermissions = async () => {
        try {
            const cameraPerm = await ImagePicker.requestCameraPermissionsAsync();
            const mediaPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (cameraPerm.status !== 'granted' || mediaPerm.status !== 'granted') {
                Alert.alert(
                    'Permissions required',
                    'Camera and media library access are required to capture or import images.'
                );
            }
        } catch (err) {
            console.warn('Permission error:', err);
        }
    };

    // Open camera to capture an image
    const handleCapture = async () => {
        try {
            console.log('📸 Opening camera...');

            // Hide bars before opening camera
            hideAllBars();

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.7
            });

            console.log('📷 Camera result:', result);

            // Hide ALL navigation bars again after camera closes with multiple delays
            setTimeout(() => {
                hideAllBars();
            }, 100);

            setTimeout(() => {
                hideAllBars();
            }, 500);

            setTimeout(() => {
                hideAllBars();
            }, 1000);

            if (result && !result.canceled && result.assets && result.assets.length > 0) {
                const selectedImage = result.assets[0];
                console.log('✅ Image captured:', selectedImage.uri);
                setImageUri(selectedImage.uri);
            } else if (result && result.canceled) {
                console.log('❌ Camera cancelled by user');
            } else {
                console.log('❌ No image selected or unexpected result format');
            }
        } catch (error) {
            console.error('❌ Camera error:', error);
            Alert.alert('Error', 'Failed to capture image');

            // Ensure bars are hidden even on error
            hideAllBars();
        }
    };

    // Open image library to pick an image
    const handleImport = async () => {
        try {
            console.log('🖼️ Opening image library...');

            // Hide bars before opening image picker
            hideAllBars();

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.7
            });

            console.log('📚 Image library result:', result);

            // Hide ALL navigation bars again after image picker closes with multiple delays
            setTimeout(() => {
                hideAllBars();
            }, 100);

            setTimeout(() => {
                hideAllBars();
            }, 500);

            setTimeout(() => {
                hideAllBars();
            }, 1000);

            if (result && !result.canceled && result.assets && result.assets.length > 0) {
                const selectedImage = result.assets[0];
                console.log('✅ Image selected:', selectedImage.uri);
                setImageUri(selectedImage.uri);
            } else if (result && result.canceled) {
                console.log('❌ Image selection cancelled by user');
            } else {
                console.log('❌ No image selected or unexpected result format');
            }
        } catch (error) {
            console.error('❌ Image library error:', error);
            Alert.alert('Error', 'Failed to import image');

            // Ensure bars are hidden even on error
            hideAllBars();
        }
    };

    // Function to upload image to server and update database
    const uploadImage = async (itemId: string): Promise<boolean> => {
        if (!imageUri) return false;

        try {
            console.log('📤 Starting image upload...');
            const formData = new FormData();

            const filename = imageUri.split('/').pop() || `item_${itemId}.jpg`;
            const match = /\.(\w+)$/.exec(filename);
            const type = match ? `image/${match[1]}` : 'image/jpeg';

            formData.append('image', {
                uri: imageUri,
                name: filename,
                type,
            } as any);

            formData.append('item_id', itemId);

            console.log('🔄 Uploading image to server...');
            // Use items.php instead of upload-image.php
            const response = await fetch(`${apiBaseUrl}/items.php`, {
                method: 'POST',
                body: formData,
            });

            const responseText = await response.text();
            console.log('📄 Upload response text:', responseText);

            try {
                const result = JSON.parse(responseText);
                console.log('📄 Upload response JSON:', result);
                return result.success;
            } catch (parseError) {
                console.error('❌ Failed to parse JSON response:', parseError);
                console.log('📄 Raw response:', responseText);
                return false;
            }
        } catch (error) {
            console.error('❌ Error uploading image:', error);
            return false;
        }
    };

    const handleSaveItem = async () => {
        hideAllBars(); // Ensure ALL bars are hidden when saving

        // Validation
        if (!newItem.name || !newItem.code || !newItem.price || !newItem.category) {
            Alert.alert('Error', 'Please fill all required fields');
            return;
        }

        if (isNaN(parseFloat(newItem.price)) || parseFloat(newItem.price) <= 0) {
            Alert.alert('Error', 'Please enter a valid price');
            return;
        }

        setLoading(true);
        try {
            const syncService = OfflineSyncService.getInstance();
            const API_BASE_URL = await getApiBaseUrl();

            const itemData = {
                name: newItem.name,
                code: newItem.code,
                price: parseFloat(newItem.price),
                category: newItem.category,
                stocks: parseInt(newItem.stocks) || 0,
                description: newItem.description,
                status: true,
                sales: 0,
            };

            console.log('🚀 Starting item save process...');

            // ALWAYS SAVE TO LOCAL STORAGE FIRST
            const localResult = await syncService.saveItem(itemData, API_BASE_URL !== 'demo');

            if (localResult.success) {
                console.log('✅ Item successfully saved to local storage:', {
                    id: localResult.id,
                    name: itemData.name,
                    isOffline: localResult.isOffline
                });

                // If online, also try to save to server
                if (API_BASE_URL !== 'demo') {
                    console.log('🌐 Attempting to save to server...');
                    try {
                        const serverResponse = await fetch(`${API_BASE_URL}/items.php`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(itemData),
                        });

                        const serverResult = await serverResponse.json();

                        if (serverResult.success) {
                            console.log('🎯 Item saved to server successfully:', serverResult);

                            // Update local storage with server ID
                            await syncService.saveItem({
                                ...itemData,
                                id: serverResult.item_id || serverResult.id
                            }, true);

                            // Upload image if exists
                            if (imageUri && serverResult.item_id) {
                                console.log('🖼️ Uploading image to server...');
                                const imageUploaded = await uploadImage(serverResult.item_id);
                                console.log('📸 Image upload result:', imageUploaded ? 'Success' : 'Failed');
                            }

                            Alert.alert('Success', 'Item saved to server and local backup', [
                                {
                                    text: 'OK',
                                    onPress: () => {
                                        router.back();
                                        router.replace('/items');
                                    }
                                }
                            ]);
                        } else {
                            console.log('⚠️ Server save failed, but local backup exists:', serverResult.message);
                            Alert.alert('Saved Locally', 'Item saved to local storage. Will sync when possible.', [
                                {
                                    text: 'OK',
                                    onPress: () => {
                                        router.back();
                                        router.replace('/items');
                                    }
                                }
                            ]);
                        }
                    } catch (serverError) {
                        console.error('❌ Server save error, but local backup exists:', serverError);
                        Alert.alert('Saved Locally', 'Item saved to local storage due to connection issues', [
                            {
                                text: 'OK',
                                onPress: () => {
                                    router.back();
                                    router.replace('/items');
                                }
                            }
                        ]);
                    }
                } else {
                    // Demo mode
                    console.log('🎮 Demo mode - item saved locally only');
                    Alert.alert('Success (Demo)', 'Item saved to local storage', [
                        {
                            text: 'OK',
                            onPress: () => {
                                router.back();
                                router.replace('/items');
                            }
                        }
                    ]);
                }
            } else {
                console.error('❌ Failed to save item locally');
                Alert.alert('Error', 'Failed to save item. Please try again.');
            }

        } catch (error) {
            console.error('❌ Unexpected error saving item:', error);
            Alert.alert('Error', 'An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        hideAllBars();
        setNewItem({
            name: '',
            code: '',
            price: '',
            category: '',
            stocks: '',
            description: ''
        });
        setImageUri(null);
        router.back();
        router.replace('/items');
    };

    return (
        <ThemedView style={styles.container}>
            {/* Navbar Component */}
            <Navbar activeNav="items" />

            {/* Main Content */}
            <ImageBackground
                source={require('@/assets/images/kape1.png')}
                style={styles.backgroundImage}
                resizeMode="cover"
            >
                <ThemedView style={styles.content}>
                    {/* Header Section */}
                    <ThemedView style={styles.headerSection}>
                        <TouchableOpacity
                            style={styles.backButton}
                            onPress={handleCancel}
                        >
                            <Feather name="arrow-left" size={24} color="#874E3B" />
                        </TouchableOpacity>

                        <ThemedText style={styles.mainTitle}>Add New Item</ThemedText>

                        <TouchableOpacity
                            style={styles.saveButton}
                            onPress={handleSaveItem}
                            disabled={loading}
                        >
                            <ThemedText style={styles.saveButtonText}>
                                {loading ? 'Saving...' : 'Save'}
                            </ThemedText>
                        </TouchableOpacity>
                    </ThemedView>

                    {/* Form Content */}
                    <ScrollView style={styles.formContainer}>
                        <ThemedView style={styles.formContent}>
                            {/* Left Side - Form */}
                            <ThemedView style={styles.formSection}>
                                <ThemedText style={styles.sectionHeader}>Item Details</ThemedText>

                                <ThemedView style={styles.formRow}>
                                    <ThemedView style={styles.formGroup}>
                                        <ThemedText style={styles.label}>Item Name *</ThemedText>
                                        <TextInput
                                            style={styles.input}
                                            value={newItem.name}
                                            onChangeText={(text) => setNewItem(prev => ({ ...prev, name: text }))}
                                            placeholder="Enter item name"
                                            onFocus={hideAllBars}
                                        />
                                    </ThemedView>
                                    <ThemedView style={styles.formGroup}>
                                        <ThemedText style={styles.label}>Item Code *</ThemedText>
                                        <TextInput
                                            style={styles.input}
                                            value={newItem.code}
                                            onChangeText={(text) => setNewItem(prev => ({ ...prev, code: text }))}
                                            placeholder="Enter item code"
                                            onFocus={hideAllBars}
                                        />
                                    </ThemedView>
                                </ThemedView>

                                <ThemedView style={styles.formRow}>
                                    <ThemedView style={styles.formGroup}>
                                        <ThemedText style={styles.label}>Item Price *</ThemedText>
                                        <TextInput
                                            style={styles.input}
                                            value={newItem.price}
                                            onChangeText={(text) => setNewItem(prev => ({ ...prev, price: text }))}
                                            placeholder="0.00"
                                            keyboardType="decimal-pad"
                                            onFocus={hideAllBars}
                                        />
                                    </ThemedView>
                                    <ThemedView style={styles.formGroup}>
                                        <ThemedText style={styles.label}>Stocks</ThemedText>
                                        <TextInput
                                            style={styles.input}
                                            value={newItem.stocks}
                                            onChangeText={(text) => setNewItem(prev => ({ ...prev, stocks: text }))}
                                            placeholder="0"
                                            keyboardType="numeric"
                                            onFocus={hideAllBars}
                                        />
                                    </ThemedView>
                                </ThemedView>

                                <ThemedView style={styles.formGroup}>
                                    <ThemedText style={styles.label}>Category *</ThemedText>
                                    <ThemedView style={styles.categoryInput}>
                                        <TextInput
                                            style={styles.input}
                                            value={newItem.category}
                                            onChangeText={(text) => setNewItem(prev => ({ ...prev, category: text }))}
                                            placeholder="Select or enter category"
                                            onFocus={hideAllBars}
                                        />
                                        <Feather name="chevron-down" size={20} color="#874E3B" />
                                    </ThemedView>
                                    {categories.length > 0 && (
                                        <ThemedText style={styles.categoryHint}>
                                            Available: {categories.map(cat => cat.name).join(', ')}
                                        </ThemedText>
                                    )}
                                </ThemedView>

                                <ThemedView style={styles.formGroup}>
                                    <ThemedText style={styles.label}>Description</ThemedText>
                                    <TextInput
                                        style={[styles.input, styles.textArea]}
                                        value={newItem.description}
                                        onChangeText={(text) => setNewItem(prev => ({ ...prev, description: text }))}
                                        placeholder="Enter item description"
                                        multiline
                                        numberOfLines={3}
                                        onFocus={hideAllBars}
                                    />
                                </ThemedView>
                            </ThemedView>

                            {/* Right Side - Image Upload */}
                            <ThemedView style={styles.imageSection}>
                                <ThemedText style={styles.sectionHeader}>Upload Image</ThemedText>
                                <ThemedView style={styles.imageUploadArea}>
                                    <ThemedView style={styles.imagePlaceholder}>
                                        {imageUri ? (
                                            <Image
                                                source={{ uri: imageUri }}
                                                style={styles.previewImage}
                                                resizeMode="cover"
                                            />
                                        ) : (
                                            <>
                                                <Feather name="image" size={48} color="#D4A574" />
                                                <ThemedText style={styles.uploadText}>No image selected</ThemedText>
                                            </>
                                        )}
                                    </ThemedView>

                                    <ThemedView style={styles.uploadButtons}>
                                        <TouchableOpacity
                                            style={styles.uploadButton}
                                            onPress={handleCapture}
                                        >
                                            <ThemedText style={styles.uploadButtonText}>Capture</ThemedText>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.uploadButton}
                                            onPress={handleImport}
                                        >
                                            <ThemedText style={styles.uploadButtonText}>Import Image</ThemedText>
                                        </TouchableOpacity>
                                    </ThemedView>

                                    {imageUri && (
                                        <ThemedText style={styles.imageSelectedText}>
                                            ✓ Image selected
                                        </ThemedText>
                                    )}
                                </ThemedView>
                            </ThemedView>
                        </ThemedView>
                    </ScrollView>
                </ThemedView>
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
    content: {
        flex: 1,
        padding: 16,
        backgroundColor: 'transparent',
    },
    headerSection: {
        backgroundColor: "rgba(255, 254, 234, 0.95)",
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#D4A574',
        marginBottom: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    backButton: {
        padding: 8,
    },
    mainTitle: {
        fontSize: 24,
        color: '#874E3B',
        fontFamily: 'LobsterTwoItalic',
        textAlign: 'center',
        flex: 1,
    },
    saveButton: {
        backgroundColor: '#874E3B',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 6,
    },
    saveButtonText: {
        color: '#FFFEEA',
        fontSize: 14,
        fontWeight: 'bold',
    },
    formContainer: {
        flex: 1,
    },
    formContent: {
        flexDirection: 'row',
        gap: 20,
    },
    formSection: {
        flex: 1,
        backgroundColor: "rgba(255, 254, 234, 0.95)",
        borderRadius: 12,
        padding: 20,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    imageSection: {
        width: 200,
        backgroundColor: "rgba(255, 254, 234, 0.95)",
        borderRadius: 12,
        padding: 20,
        borderWidth: 1,
        borderColor: '#D4A574',
    },
    sectionHeader: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#874E3B',
        marginBottom: 16,
    },
    formRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    formGroup: {
        flex: 1,
    },
    label: {
        fontSize: 14,
        color: '#5A3921',
        marginBottom: 6,
        fontWeight: '500',
    },
    input: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#D4A574',
        borderRadius: 6,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: '#5A3921',
    },
    textArea: {
        height: 80,
        textAlignVertical: 'top',
    },
    categoryInput: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    categoryHint: {
        fontSize: 12,
        color: '#874E3B',
        marginTop: 4,
        fontStyle: 'italic',
    },
    imageUploadArea: {
        alignItems: 'center',
    },
    imagePlaceholder: {
        width: 150,
        height: 150,
        backgroundColor: '#F5E6D3',
        borderWidth: 2,
        borderColor: '#D4A574',
        borderStyle: 'dashed',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        overflow: 'hidden',
    },
    previewImage: {
        width: '100%',
        height: '100%',
    },
    uploadText: {
        fontSize: 12,
        color: '#874E3B',
        marginTop: 8,
        textAlign: 'center',
    },
    uploadButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    uploadButton: {
        backgroundColor: '#874E3B',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        marginHorizontal: 4,
    },
    uploadButtonText: {
        color: '#FFFEEA',
        fontSize: 12,
        fontWeight: 'bold',
    },
    imageSelectedText: {
        fontSize: 12,
        color: '#2E7D32',
        marginTop: 8,
        fontWeight: 'bold',
    },
});