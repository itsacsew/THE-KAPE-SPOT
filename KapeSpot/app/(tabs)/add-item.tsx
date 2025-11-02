// app/(tabs)/add-item.tsx
import { useState, useEffect, useRef } from 'react';
import {
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ImageBackground,
    Alert,
    Image,
    StatusBar,
    KeyboardAvoidingView,
    Platform,
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
import { useFocusEffect } from '@react-navigation/native';
import React from 'react';
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
interface Cup {
    id: string;
    name: string;
    size?: string;
    stocks: number;
    isOffline?: boolean;
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
    const [cups, setCups] = useState<Cup[]>([]); // ADD CUP STATE


    // Refs for auto-scrolling
    const scrollViewRef = useRef<ScrollView>(null);
    const nameInputRef = useRef<TextInput>(null);
    const codeInputRef = useRef<TextInput>(null);
    const priceInputRef = useRef<TextInput>(null);
    const stocksInputRef = useRef<TextInput>(null);
    const categoryInputRef = useRef<TextInput>(null);
    const descriptionInputRef = useRef<TextInput>(null);
    const [selectedCup, setSelectedCup] = useState<string>('');

    // New item form state
    // New item form state - ADD CUP FIELD
    const [newItem, setNewItem] = useState({
        name: '',
        code: '',
        price: '',
        category: '',
        stocks: '',
        description: '',
        cupName: '' // ADD CUP NAME FIELD
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

    // Function to handle input focus with auto-scroll
    const handleInputFocus = (inputName: string, yOffset: number = 0) => {
        hideAllBars();

        // Scroll to make the input visible
        setTimeout(() => {
            scrollViewRef.current?.scrollTo({
                y: yOffset,
                animated: true
            });
        }, 100);
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
    // Save item to Firebase Firestore with image as base64 - FIXED
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

            // In handleSaveItem function, update the itemData to include cupName:
            const itemData: any = {
                name: newItem.name,
                code: newItem.code,
                price: parseFloat(newItem.price),
                category: newItem.category,
                stocks: parseInt(newItem.stocks) || 0,
                description: newItem.description,
                cupName: newItem.cupName, // ADD THIS LINE
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

            if (connectionMode === 'online') {
                console.log('🔥 ONLINE MODE: Saving to Firebase first...');

                try {
                    // STEP 1: SAVE TO FIREBASE FIRST
                    const docRef = await addDoc(collection(db, 'items'), itemData);
                    const firebaseId = docRef.id;

                    console.log('✅ Step 1 COMPLETE: Saved to FIREBASE successfully:', {
                        firebaseId: firebaseId,
                        name: itemData.name
                    });

                    // STEP 2: THEN SAVE TO LOCAL STORAGE WITH FIREBASE INFO
                    console.log('💾 Step 2: Saving to LOCAL storage with Firebase info...');
                    const itemWithFirebaseId = {
                        ...itemData,
                        id: firebaseId,
                        firebaseId: firebaseId,
                        isOffline: false
                    };

                    const localResult = await syncService.saveItem(itemWithFirebaseId, true);

                    if (localResult.success) {
                        console.log('✅ Step 2 COMPLETE: Saved to LOCAL storage with Firebase ID');

                        Alert.alert('Success', 'Item saved to Firebase and local backup!', [
                            {
                                text: 'OK',
                                onPress: () => {
                                    router.back();
                                    router.replace('/items');
                                }
                            }
                        ]);
                    } else {
                        console.log('⚠️ Firebase saved but local backup failed');
                        Alert.alert('Success', 'Item saved to Firebase!', [
                            {
                                text: 'OK',
                                onPress: () => {
                                    router.back();
                                    router.replace('/items');
                                }
                            }
                        ]);
                    }

                } catch (firebaseError) {
                    console.error('❌ Firebase save error:', firebaseError);

                    // Firebase failed, save to local storage only
                    console.log('💾 Fallback: Saving to LOCAL storage only...');
                    const localResult = await syncService.saveItem(itemData, false);

                    if (localResult.success) {
                        Alert.alert('Saved Locally', 'Item saved to local storage. Firebase sync will be retried later.', [
                            {
                                text: 'OK',
                                onPress: () => {
                                    router.back();
                                    router.replace('/items');
                                }
                            }
                        ]);
                    } else {
                        Alert.alert('Error', 'Failed to save item. Please try again.');
                    }
                }
            } else {
                // OFFLINE MODE - Save to local storage only
                console.log('📱 OFFLINE MODE: Saving to LOCAL storage only...');
                const localResult = await syncService.saveItem(itemData, false);

                if (localResult.success) {
                    Alert.alert('Success (Offline)', 'Item saved to local storage. Will sync when online.', [
                        {
                            text: 'OK',
                            onPress: () => {
                                router.back();
                                router.replace('/items');
                            }
                        }
                    ]);
                } else {
                    Alert.alert('Error', 'Failed to save item to local storage. Please try again.');
                }
            }

        } catch (error) {
            console.error('❌ Unexpected error saving item:', error);
            Alert.alert('Error', 'An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };
    const loadCups = async () => {
        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            if (connectionMode === 'offline') {
                console.log('📱 Loading cups from local storage (OFFLINE)...');
                const storedCups = await syncService.getCups();
                setCups(storedCups);
                console.log('✅ Loaded cups from local storage:', storedCups.length, 'cups');
                return;
            }

            console.log('🔥 Loading cups from Firebase (ONLINE)...');
            const cupsCollection = collection(db, 'cups');
            const cupsSnapshot = await getDocs(cupsCollection);

            const firebaseCups: Cup[] = cupsSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name || '',
                    size: data.size || '',
                    stocks: data.stocks || 0,
                    isOffline: false,
                    firebaseId: doc.id
                };
            });

            setCups(firebaseCups);
            console.log('✅ Loaded cups from Firebase:', firebaseCups.length, 'cups');

        } catch (error) {
            console.error('❌ Error loading cups:', error);
            // Fallback to local storage
            const syncService = OfflineSyncService.getInstance();
            const storedCups = await syncService.getCups();
            setCups(storedCups);
        }
    };

    // Update useEffect to load cups
    useEffect(() => {
        loadCategories();
        loadCups(); // ADD THIS LINE
        requestPermissions();
    }, []);

    const handleCancel = () => {
        hideAllBars();
        setNewItem({
            name: '',
            code: '',
            price: '',
            category: '',
            stocks: '',
            description: '',
            cupName: ''
        });
        setImageUri(null);
        setImageBase64(null);
        router.back();
        router.replace('/items');
    };
    // Add this function to refresh cups list
    const refreshCups = async () => {
        try {
            const syncService = OfflineSyncService.getInstance();
            const connectionMode = await getConnectionMode();

            if (connectionMode === 'offline') {
                console.log('📱 Refreshing cups from local storage...');
                const storedCups = await syncService.getCups();
                setCups(storedCups);
                return;
            }

            console.log('🔥 Refreshing cups from Firebase...');
            const cupsCollection = collection(db, 'cups');
            const cupsSnapshot = await getDocs(cupsCollection);

            const firebaseCups: Cup[] = cupsSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    name: data.name || '',
                    size: data.size || '',
                    stocks: data.stocks || 0,
                    isOffline: false,
                    firebaseId: doc.id
                };
            });

            setCups(firebaseCups);

            // Also update local storage for offline use
            await syncService.saveCups(firebaseCups);

        } catch (error) {
            console.error('❌ Error refreshing cups:', error);
            // Fallback to local storage
            const syncService = OfflineSyncService.getInstance();
            const storedCups = await syncService.getCups();
            setCups(storedCups);
        }
    };

    // Update useEffect to include focus listener for real-time updates
    useEffect(() => {
        loadCategories();
        loadCups();
        requestPermissions();
    }, []);

    // Add focus effect to refresh cups when screen comes into focus
    useFocusEffect(
        React.useCallback(() => {
            refreshCups();
        }, [])
    );

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
                <KeyboardAvoidingView
                    style={styles.content}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
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
                    <ScrollView
                        ref={scrollViewRef}
                        style={styles.formContainer}
                        showsVerticalScrollIndicator={true}
                        contentContainerStyle={styles.scrollContent}
                    >
                        <ThemedView style={styles.formContent}>
                            {/* Left Side - Form */}
                            <ThemedView style={styles.formSection}>
                                <ThemedText style={styles.sectionHeader}>Item Details</ThemedText>

                                <ThemedView style={styles.formRow}>
                                    {/* Cup Type Field */}
                                    {/* Cup Type Field */}

                                    <ThemedView style={styles.formGroup}>
                                        <ThemedText style={styles.label}>Cup Type *</ThemedText>

                                        {/* Cup Selection */}
                                        <ThemedView style={styles.cupSelectionContainer}>
                                            {cups.length > 0 ? (
                                                <ScrollView
                                                    horizontal
                                                    showsHorizontalScrollIndicator={false}
                                                    style={styles.cupScrollView}
                                                >
                                                    {cups.map((cup) => (
                                                        <TouchableOpacity
                                                            key={cup.id}
                                                            style={[
                                                                styles.cupOption,
                                                                newItem.cupName === cup.name && styles.cupOptionSelected
                                                            ]}
                                                            onPress={() => {
                                                                setNewItem(prev => ({
                                                                    ...prev,
                                                                    cupName: cup.name,
                                                                    // Auto-fill item name with cup name if empty
                                                                    name: prev.name === '' ? `${cup.name} ${prev.code || ''}`.trim() : prev.name
                                                                }));
                                                                console.log('🥤 Selected cup:', cup.name, 'Stocks:', cup.stocks);
                                                            }}
                                                        >
                                                            <ThemedView style={styles.cupOptionContent}>
                                                                <ThemedText style={[
                                                                    styles.cupOptionText,
                                                                    newItem.cupName === cup.name && styles.cupOptionTextSelected
                                                                ]}>
                                                                    {cup.name}
                                                                </ThemedText>
                                                                {cup.size && (
                                                                    <ThemedText style={[
                                                                        styles.cupSizeText,
                                                                        newItem.cupName === cup.name && styles.cupSizeTextSelected
                                                                    ]}>
                                                                        {cup.size}
                                                                    </ThemedText>
                                                                )}
                                                                <ThemedText style={styles.cupStockText}>
                                                                    Stock: {cup.stocks}
                                                                </ThemedText>
                                                            </ThemedView>
                                                        </TouchableOpacity>
                                                    ))}
                                                </ScrollView>
                                            ) : (
                                                <ThemedText style={styles.noCupsText}>
                                                    No cups available. Please add cups first.
                                                </ThemedText>
                                            )}
                                        </ThemedView>

                                        {/* Show selected cup info */}
                                        {newItem.cupName && (
                                            <ThemedView style={styles.selectedCupInfo}>
                                                <ThemedText style={styles.selectedCupText}>
                                                    Selected: {newItem.cupName}
                                                </ThemedText>
                                            </ThemedView>
                                        )}
                                    </ThemedView>
                                    <ThemedView style={styles.formGroup}>
                                        <ThemedText style={styles.label}>Item Name *</ThemedText>
                                        <TextInput
                                            ref={nameInputRef}
                                            style={styles.input}
                                            value={newItem.name}
                                            onChangeText={(text) => setNewItem(prev => ({ ...prev, name: text }))}
                                            placeholder="Enter item name"
                                            onFocus={() => handleInputFocus('name', 0)}
                                            returnKeyType="next"
                                        />
                                    </ThemedView>
                                    <ThemedView style={styles.formGroup}>
                                        <ThemedText style={styles.label}>Item Code *</ThemedText>
                                        <TextInput
                                            ref={codeInputRef}
                                            style={styles.input}
                                            value={newItem.code}
                                            onChangeText={(text) => setNewItem(prev => ({ ...prev, code: text }))}
                                            placeholder="Enter item code"
                                            onFocus={() => handleInputFocus('code', 50)}
                                            returnKeyType="next"
                                        />
                                    </ThemedView>
                                </ThemedView>

                                <ThemedView style={styles.formRow}>
                                    <ThemedView style={styles.formGroup}>
                                        <ThemedText style={styles.label}>Item Price *</ThemedText>
                                        <TextInput
                                            ref={priceInputRef}
                                            style={styles.input}
                                            value={newItem.price}
                                            onChangeText={(text) => setNewItem(prev => ({ ...prev, price: text }))}
                                            placeholder="0.00"
                                            keyboardType="decimal-pad"
                                            onFocus={() => handleInputFocus('price', 100)}
                                            returnKeyType="next"
                                        />
                                    </ThemedView>
                                    <ThemedView style={styles.formGroup}>
                                        <ThemedText style={styles.label}>Stocks</ThemedText>
                                        <TextInput
                                            ref={stocksInputRef}
                                            style={styles.input}
                                            value={newItem.stocks}
                                            onChangeText={(text) => setNewItem(prev => ({ ...prev, stocks: text }))}
                                            placeholder="0"
                                            keyboardType="numeric"
                                            onFocus={() => handleInputFocus('stocks', 150)}
                                            returnKeyType="next"
                                        />
                                    </ThemedView>
                                </ThemedView>

                                <ThemedView style={styles.formGroup}>
                                    <ThemedText style={styles.label}>Category *</ThemedText>
                                    <ThemedView style={styles.categoryInput}>
                                        <TextInput
                                            ref={categoryInputRef}
                                            style={styles.input}
                                            value={newItem.category}
                                            onChangeText={(text) => setNewItem(prev => ({ ...prev, category: text }))}
                                            placeholder="Select or enter category"
                                            onFocus={() => handleInputFocus('category', 200)}
                                            returnKeyType="next"
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
                                        ref={descriptionInputRef}
                                        style={[styles.input, styles.textArea]}
                                        value={newItem.description}
                                        onChangeText={(text) => setNewItem(prev => ({ ...prev, description: text }))}
                                        placeholder="Enter item description"
                                        multiline
                                        numberOfLines={3}
                                        onFocus={() => handleInputFocus('description', 250)}
                                        returnKeyType="done"
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
    content: {
        flex: 1,
        padding: 16,
        backgroundColor: 'transparent',
    },
    // Add the missing style to your StyleSheet:

    suggestionContent: {
        flexDirection: 'row',
        alignItems: 'center',
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
    scrollContent: {
        flexGrow: 1,
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
    // Add these styles to your StyleSheet:

    cupSelectionContainer: {
        marginBottom: 8,
    },
    cupScrollView: {
        maxHeight: 120,
    },
    cupOption: {
        backgroundColor: '#F5E6D3',
        borderWidth: 2,
        borderColor: '#D4A574',
        borderRadius: 8,
        padding: 12,
        marginRight: 8,
        minWidth: 100,
    },
    cupOptionSelected: {
        backgroundColor: '#874E3B',
        borderColor: '#874E3B',
    },
    cupOptionContent: {
        alignItems: 'center',
    },
    cupOptionText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#874E3B',
        textAlign: 'center',
    },
    cupOptionTextSelected: {
        color: '#FFFEEA',
    },
    cupSizeText: {
        fontSize: 12,
        color: '#874E3B',
        marginTop: 2,
    },
    cupSizeTextSelected: {
        color: '#FFFEEA',
    },
    cupStockText: {
        fontSize: 10,
        color: '#666',
        marginTop: 4,
    },
    selectedCupInfo: {
        backgroundColor: '#E8F5E8',
        padding: 8,
        borderRadius: 6,
        marginTop: 8,
        borderWidth: 1,
        borderColor: '#4CAF50',
    },
    selectedCupText: {
        fontSize: 12,
        color: '#2E7D32',
        fontWeight: 'bold',
        textAlign: 'center',
    },
    noCupsText: {
        fontSize: 12,
        color: '#666',
        fontStyle: 'italic',
        textAlign: 'center',
        padding: 12,
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
    // Add these styles to the StyleSheet:

    cupSuggestions: {
        marginTop: 8,
    },
    suggestionTitle: {
        fontSize: 12,
        color: '#874E3B',
        marginBottom: 6,
        fontWeight: '500',
    },
    suggestionContainer: {
        flexDirection: 'row',
    },
    suggestionChip: {
        backgroundColor: '#F5E6D3',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        marginRight: 8,
        marginBottom: 4,
        borderWidth: 1,
        borderColor: '#D4A574',
        flexDirection: 'row',
        alignItems: 'center',
    },
    suggestionText: {
        fontSize: 12,
        color: '#874E3B',
        fontWeight: '500',
    },
    suggestionSize: {
        fontSize: 10,
        color: '#874E3B',
        marginLeft: 4,
        opacity: 0.8,
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