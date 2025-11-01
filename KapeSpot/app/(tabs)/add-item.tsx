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
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc
} from 'firebase/firestore';
import { app } from '@/lib/firebase-config';

interface Category {
    id: string;
    name: string;
    firebaseId?: string;
}

// Function to convert image to base64
const convertImageToBase64 = async (uri: string): Promise<string | null> => {
    try {
        console.log('🔄 Converting image to base64...');

        const response = await fetch(uri);
        const blob = await response.blob();

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result as string;
                console.log('✅ Image converted to base64, length:', base64.length);
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('❌ Error converting image to base64:', error);
        return null;
    }
};

// Function to validate image file
const validateImage = (uri: string): boolean => {
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const uriLower = uri.toLowerCase();

    const isValidExtension = validExtensions.some(ext => uriLower.endsWith(ext));
    if (!isValidExtension) {
        console.log('❌ Invalid image format:', uri);
        return false;
    }

    console.log('✅ Valid image format:', uri);
    return true;
};

export default function AddItemScreen() {
    const [loading, setLoading] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);
    const [isOnlineMode, setIsOnlineMode] = useState<boolean>(false);

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
    const [imageBase64, setImageBase64] = useState<string | null>(null);

    // Initialize Firebase services
    const db = getFirestore(app);

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

    // Function to get connection mode
    const getConnectionMode = async (): Promise<'online' | 'offline'> => {
        try {
            const mode = await NetworkScanner.getApiBaseUrl();
            const isOnline = mode === 'online';
            setIsOnlineMode(isOnline);
            return mode;
        } catch (error) {
            console.log('❌ Error checking connection mode:', error);
            setIsOnlineMode(false);
            return 'offline';
        }
    };

    // Load categories from Firebase
    const loadCategories = async () => {
        try {
            const connectionMode = await getConnectionMode();

            if (connectionMode === 'offline') {
                console.log('📱 Using offline categories');
                // Set demo categories from local storage
                const syncService = OfflineSyncService.getInstance();
                const localCategories = await syncService.getLocalCategories();

                if (localCategories.length > 0) {
                    setCategories(localCategories);
                } else {
                    // Fallback demo categories
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
                return;
            }

            console.log('🔥 Fetching categories from Firebase...');
            const categoriesCollection = collection(db, 'categories');
            const categoriesSnapshot = await getDocs(categoriesCollection);

            const firebaseCategories: Category[] = categoriesSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name || '',
                    firebaseId: doc.id
                };
            });

            console.log('📦 Categories loaded from Firebase:', firebaseCategories.length);
            setCategories(firebaseCategories);

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

    // Process and validate selected image
    const processSelectedImage = async (uri: string) => {
        try {
            console.log('🔄 Processing selected image...');

            // Validate image format
            if (!validateImage(uri)) {
                Alert.alert(
                    'Invalid Image Format',
                    'Please select a valid image file (JPG, JPEG, PNG, GIF, or WEBP).'
                );
                return false;
            }

            // Convert to base64
            const base64 = await convertImageToBase64(uri);
            if (!base64) {
                Alert.alert('Error', 'Failed to process image. Please try another image.');
                return false;
            }

            // Check if base64 string is too large (Firestore has 1MB limit per document)
            if (base64.length > 900000) { // ~900KB limit for safety
                Alert.alert(
                    'Image Too Large',
                    'The selected image is too large. Please choose a smaller image (under 900KB).'
                );
                return false;
            }

            setImageUri(uri);
            setImageBase64(base64);
            console.log('✅ Image processed successfully, base64 length:', base64.length);
            return true;

        } catch (error) {
            console.error('❌ Error processing image:', error);
            Alert.alert('Error', 'Failed to process image. Please try again.');
            return false;
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
                quality: 0.6, // Reduced quality to keep file size smaller
                base64: false // We'll convert manually to control quality
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

                // Process the image
                const success = await processSelectedImage(selectedImage.uri);
                if (!success) {
                    setImageUri(null);
                    setImageBase64(null);
                }
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
                quality: 0.6, // Reduced quality to keep file size smaller
                base64: false // We'll convert manually to control quality
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

                // Process the image
                const success = await processSelectedImage(selectedImage.uri);
                if (!success) {
                    setImageUri(null);
                    setImageBase64(null);
                }
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

    // Save item to Firebase Firestore with image as base64
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
            const connectionMode = await getConnectionMode();

            const itemData: any = {
                name: newItem.name,
                code: newItem.code,
                price: parseFloat(newItem.price),
                category: newItem.category,
                stocks: parseInt(newItem.stocks) || 0,
                description: newItem.description,
                status: true,
                sales: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // Add image base64 if exists
            if (imageBase64) {
                itemData.image_base64 = imageBase64;
                itemData.has_image = true;
                console.log('🖼️ Adding base64 image to item data, length:', imageBase64.length);
            }

            console.log('🚀 Starting item save process...');
            console.log('🌐 Current Mode:', connectionMode === 'offline' ? 'OFFLINE' : 'ONLINE');

            // STEP 1: ALWAYS SAVE TO LOCAL STORAGE FIRST
            console.log('💾 Step 1: Saving to LOCAL storage...');
            const localResult = await syncService.saveItem(itemData, connectionMode === 'offline');

            if (!localResult.success) {
                console.error('❌ Failed to save item to local storage');
                Alert.alert('Error', 'Failed to save item to local storage. Please try again.');
                return;
            }

            console.log('✅ Step 1 COMPLETE: Saved to LOCAL storage:', {
                id: localResult.id,
                name: itemData.name,
                isOffline: localResult.isOffline
            });

            // STEP 2: TRY TO SAVE TO FIREBASE IF ONLINE
            if (connectionMode === 'online') {
                console.log('🔥 Step 2: Attempting to save to FIREBASE...');

                try {
                    // Save item to Firebase Firestore
                    const docRef = await addDoc(collection(db, 'items'), itemData);
                    const firebaseId = docRef.id;

                    console.log('✅ Step 2 COMPLETE: Saved to FIREBASE successfully:', {
                        firebaseId: firebaseId,
                        name: itemData.name,
                        hasImage: !!imageBase64
                    });

                    // STEP 3: UPDATE LOCAL STORAGE WITH FIREBASE INFO
                    console.log('🔄 Step 3: Updating local record with Firebase info...');
                    const updatedItemData = {
                        ...itemData,
                        id: firebaseId,
                        firebaseId: firebaseId
                    };

                    await syncService.saveItem(updatedItemData, false);

                    console.log('✅ Step 3 COMPLETE: Local record updated with Firebase ID');

                    // SUCCESS - Item saved to both local and Firebase
                    Alert.alert('Success', 'Item saved to Firebase and local backup!', [
                        {
                            text: 'OK',
                            onPress: () => {
                                router.back();
                                router.replace('/items');
                            }
                        }
                    ]);

                    console.log('🎉 ITEM SAVE PROCESS COMPLETED: Saved to BOTH LOCAL AND FIREBASE!');

                } catch (firebaseError) {
                    console.error('❌ Firebase save error:', firebaseError);

                    // Firebase save failed, but local save was successful
                    Alert.alert('Saved Locally', 'Item saved to local storage. Firebase sync will be retried later.', [
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
                // OFFLINE MODE - Only local save was successful
                console.log('📱 Step 2: Offline mode - Only saved to LOCAL storage');

                Alert.alert('Success (Offline)', 'Item saved to local storage. Will sync when online.', [
                    {
                        text: 'OK',
                        onPress: () => {
                            router.back();
                            router.replace('/items');
                        }
                    }
                ]);
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
        setImageBase64(null);
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
                                            ✓ Image selected (Base64)
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