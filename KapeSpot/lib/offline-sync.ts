// lib/offline-sync.ts
import * as SecureStore from 'expo-secure-store';
import { NetworkScanner } from './network-scanner';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    getFirestore,
    collection,
    addDoc,
    updateDoc,
    doc,
    getDocs,
    query,
    where,
    deleteDoc,
    orderBy
} from 'firebase/firestore';
import { app } from './firebase-config';

// In offline-sync.ts - update the PendingItem interface
interface PendingItem {
    id: string;
    type: 'CREATE_ITEM' | 'UPDATE_ITEM' | 'DELETE_ITEM' | 'CREATE_CATEGORY' | 'UPDATE_CATEGORY' | 'DELETE_CATEGORY' | 'CREATE_CUP' | 'UPDATE_CUP' | 'DELETE_CUP' | 'CREATE_ORDER' | 'UPDATE_ORDER';
    data: any;
    timestamp: number;
    retryCount: number;
    serverId?: string;
}

interface ReceiptData {
    orderId: string;
    customerName: string;
    items: any[];
    subtotal: number;
    total: number;
    timestamp: string;
    status: 'unpaid' | 'paid' | 'cancelled';
    firebaseId?: string;
    orderType?: 'dine-in' | 'take-out'; // ADD THIS LINE
    cupsUsed?: number;
  }
// ADD CUPITEM INTERFACE HERE
interface CupItem {
    id: string;
    name: string;
    stocks: number;
    size?: string;
    status?: boolean;
    isOffline?: boolean;
    firebaseId?: string;
    syncStatus?: string;
    lastUpdated?: number;
    lastSynced?: number;
  }

interface Category {
  id: string;
  name: string;
  icon?: string;
  items_count: number;
  created_on: string;
  isOffline?: boolean;
  syncStatus?: string;
  created?: number;
  lastUpdated?: number;
  serverId?: string;
  lastSynced?: number;
  firebaseId?: string;
}

// ADD CUPITEM INTERFACE HERE
interface CupItem {
  id: string;
  name: string;
  stocks: number;
  size?: string;
}

export interface SyncStatus {
  isSyncing: boolean;
  lastSync: number | null;
  pendingItems: number;
  isOnline: boolean;
  lastSyncAttempt: number | null;
}

export class OfflineSyncService {
  private static instance: OfflineSyncService;
  private syncInProgress = false;
  private syncStatus: SyncStatus = {
    isSyncing: false,
    lastSync: null,
    pendingItems: 0,
    isOnline: false,
    lastSyncAttempt: null
  };
  private syncListeners: ((status: SyncStatus) => void)[] = [];
  private db = getFirestore(app);

  private constructor() {
    this.initializeSync();
  }

  static getInstance(): OfflineSyncService {
    if (!OfflineSyncService.instance) {
      OfflineSyncService.instance = new OfflineSyncService();
    }
    return OfflineSyncService.instance;
  }

  // Add listener for sync status changes
  addSyncListener(listener: (status: SyncStatus) => void) {
    this.syncListeners.push(listener);
    listener(this.syncStatus);
  }

  removeSyncListener(listener: (status: SyncStatus) => void) {
    this.syncListeners = this.syncListeners.filter(l => l !== listener);
  }

  private notifyListeners() {
    this.syncListeners.forEach(listener => listener(this.syncStatus));
  }

  private async initializeSync() {
    await this.loadSyncStatus();
    
    // Check network status every 15 seconds
    setInterval(() => {
      this.checkNetworkStatus();
    }, 15000);

    // Try sync every 30 seconds only if online
    setInterval(() => {
      if (this.syncStatus.isOnline) {
        this.trySync();
      }
    }, 30000);

    console.log('🔄 OfflineSync Service Initialized with Firebase');
    this.checkNetworkStatus();
  }

  // Check if we have Firebase connection
  private async checkNetworkStatus(): Promise<void> {
    try {
      const connectionMode = await NetworkScanner.getApiBaseUrl();
      const wasOnline = this.syncStatus.isOnline;
      const isNowOnline = connectionMode === 'online';
      
      this.syncStatus.isOnline = isNowOnline;
      
      if (!wasOnline && isNowOnline) {
        console.log('🔥 Firebase connection restored - starting sync');
        this.trySync();
      } else if (wasOnline && !isNowOnline) {
        console.log('📱 Firebase connection lost');
      }
      
      this.notifyListeners();
      
    } catch (error) {
      console.log('❌ Network status check failed');
      this.syncStatus.isOnline = false;
      this.notifyListeners();
    }
  }

  private async loadSyncStatus() {
    try {
      const pending = await this.getPendingItems();
      this.syncStatus.pendingItems = pending.length;
      const lastSync = await SecureStore.getItemAsync('lastSync');
      this.syncStatus.lastSync = lastSync ? parseInt(lastSync) : null;
      this.notifyListeners();
      
      console.log('📊 Sync Status Loaded:', {
        pendingItems: this.syncStatus.pendingItems,
        lastSync: this.syncStatus.lastSync ? new Date(this.syncStatus.lastSync).toLocaleTimeString() : 'Never',
        isOnline: this.syncStatus.isOnline
      });
    } catch (error) {
      console.error('❌ Error loading sync status:', error);
    }
  }

  private async updateSyncStatus(updates: Partial<SyncStatus>) {
    this.syncStatus = { ...this.syncStatus, ...updates };
    this.notifyListeners();
  }

  // Helper methods for SecureStore
  public async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
    console.log('💾 Saved to local storage:', key);
  }

  public async getItem(key: string): Promise<string | null> {
    return await SecureStore.getItemAsync(key);
  }

  // ALWAYS SAVE TO LOCAL STORAGE (both online and offline)
  async saveItem(itemData: any, isOnline: boolean = false): Promise<{ success: boolean; id: string; isOffline: boolean }> {
    try {
        console.log('💽 [LOCAL STORAGE] Starting item save process...', { 
            itemName: itemData.name, 
            itemCode: itemData.code,
            isOnline 
        });

        // Check for duplicates in local storage first
        const localItems = await this.getLocalItems();
        
        // If this is an online item with Firebase ID, remove any existing offline duplicates
        if (isOnline && itemData.firebaseId) {
            const duplicateOfflineItems = localItems.filter(item => 
                (item.code === itemData.code || item.name === itemData.name) && item.isOffline
            );
            
            if (duplicateOfflineItems.length > 0) {
                console.log('🧹 Removing duplicate offline items:', duplicateOfflineItems.length);
                const cleanedItems = localItems.filter(item => 
                    !(item.code === itemData.code && item.isOffline)
                );
                await this.setItem('localItems', JSON.stringify(cleanedItems));
                // Update localItems reference after cleaning
                localItems.length = 0;
                localItems.push(...cleanedItems);
            }
        }

        const existingItem = localItems.find(item => 
            item.code === itemData.code || 
            item.name === itemData.name
        );

        if (existingItem && !itemData.id) {
            console.log('⚠️ [LOCAL STORAGE] Duplicate item found in local storage:', existingItem.name);
            // If it's a duplicate and we're not updating, use the existing ID
            const itemId = existingItem.id;
            
            console.log('✅ [LOCAL STORAGE] Using existing item ID:', itemId);
            return { success: true, id: itemId, isOffline: existingItem.isOffline || !isOnline };
        }

        const itemId = itemData.id || (isOnline ? `server_${Date.now()}` : `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
        
        // ALWAYS SAVE TO LOCAL STORAGE FOR BACKUP
        console.log('📊 [LOCAL STORAGE] Current local items count:', localItems.length);
        
        const existingItemIndex = localItems.findIndex(item => item.code === itemData.code);
        
        if (existingItemIndex !== -1) {
            // Update existing item
            localItems[existingItemIndex] = {
                ...localItems[existingItemIndex],
                ...itemData,
                id: itemId,
                isOffline: !isOnline,
                syncStatus: isOnline ? 'synced' : 'pending',
                lastUpdated: Date.now()
            };
            console.log('📝 [LOCAL STORAGE] ✅ UPDATED existing item:', {
                name: itemData.name,
                code: itemData.code,
                id: itemId,
                isOffline: !isOnline
            });
        } else {
            // Add new item
            localItems.push({
                ...itemData,
                id: itemId,
                isOffline: !isOnline,
                syncStatus: isOnline ? 'synced' : 'pending',
                created: Date.now(),
                lastUpdated: Date.now()
            });
            console.log('✅ [LOCAL STORAGE] ✅ ADDED new item:', {
                name: itemData.name,
                code: itemData.code,
                id: itemId,
                isOffline: !isOnline
            });
        }

        await this.setItem('localItems', JSON.stringify(localItems));
        console.log('💾 [LOCAL STORAGE] ✅ Local storage updated successfully!');
        console.log('📈 [LOCAL STORAGE] Total items now:', localItems.length);

        // If offline, also add to pending items for sync
        if (!isOnline) {
            const pendingItem: PendingItem = {
                id: itemId,
                type: existingItemIndex !== -1 ? 'UPDATE_ITEM' : 'CREATE_ITEM',
                data: itemData,
                timestamp: Date.now(),
                retryCount: 0
            };

            const pendingItems = await this.getPendingItems();
            console.log('📬 [LOCAL STORAGE] Current pending items:', pendingItems.length);
            
            // Remove any existing pending item with same ID to avoid duplicates
            const filteredPendingItems = pendingItems.filter(item => item.id !== itemId);
            filteredPendingItems.push(pendingItem);
            
            await this.setItem('pendingItems', JSON.stringify(filteredPendingItems));
            
            await this.updateSyncStatus({ 
                pendingItems: filteredPendingItems.length,
                lastSyncAttempt: Date.now()
            });
            
            console.log('📬 [LOCAL STORAGE] ✅ Item added to pending sync queue');
            console.log('🔄 [LOCAL STORAGE] Pending items count:', filteredPendingItems.length);

            // Try to sync immediately if online
            if (this.syncStatus.isOnline) {
                console.log('🚀 [LOCAL STORAGE] Immediate sync triggered for new item');
                this.trySync();
            } else {
                console.log('📡 [LOCAL STORAGE] Offline - item will sync when connection is available');
            }
        } else {
            console.log('🌐 [LOCAL STORAGE] Item saved online, local backup complete');
        }

        console.log('🎉 [LOCAL STORAGE] ✅ ITEM SAVE COMPLETE!');
        return { success: true, id: itemId, isOffline: !isOnline };

    } catch (error) {
        console.error('❌ [LOCAL STORAGE] ERROR saving item:', error);
        return { success: false, id: '', isOffline: true };
    }
}
  // Get items from local storage (primary source)
  async getItems(): Promise<any[]> {
    try {
      const localItems = await this.getLocalItems();
      console.log('📋 Retrieved', localItems.length, 'items from local storage');
      return localItems;
    } catch (error) {
      console.error('❌ Error getting items from local storage:', error);
      return [];
    }
  }

  private async getLocalItems(): Promise<any[]> {
    try {
        const itemsJson = await this.getItem('localItems');
        const items = itemsJson ? JSON.parse(itemsJson) : [];
        console.log('🔍 [LOCAL STORAGE] Retrieved items from local storage:', items.length, 'items');
        
        if (items.length > 0) {
            console.log('📋 [LOCAL STORAGE] Items in local storage:');
            items.forEach((item: any, index: number) => {
                console.log(`   ${index + 1}. ${item.name} (${item.code}) - ${item.isOffline ? '📱 OFFLINE' : '🌐 ONLINE'}`);
            });
        }
        
        return items;
    } catch (error) {
        console.error('❌ [LOCAL STORAGE] ERROR reading local items:', error);
        return [];
    }
}

  public async getPendingItems(): Promise<PendingItem[]> {
    try {
      const pendingJson = await this.getItem('pendingItems');
      const pending = pendingJson ? JSON.parse(pendingJson) : [];
      console.log('⏳ Pending sync items:', pending.length);
      return pending;
    } catch (error) {
      console.error('❌ Error reading pending items:', error);
      return [];
    }
  }

  // Sync pending items with Firebase Firestore (ONLY WHEN ONLINE)
  async trySync(): Promise<void> {
    if (this.syncInProgress) {
        console.log('⏸️ Sync already in progress, skipping...');
        return;
    }

    if (!this.syncStatus.isOnline) {
        console.log('📱 No Firebase connection - cannot sync');
        await this.updateSyncStatus({ 
            lastSyncAttempt: Date.now() 
        });
        return;
    }

    this.syncInProgress = true;
    await this.updateSyncStatus({ 
        isSyncing: true,
        lastSyncAttempt: Date.now()
    });
    
    console.log('🔄 Starting Firebase sync process...');

    try {
        const connectionMode = await NetworkScanner.getApiBaseUrl();
        
        if (connectionMode === 'offline') {
            console.log('📱 Demo mode - clearing pending items');
            await this.setItem('pendingItems', '[]');
            await this.updateSyncStatus({ 
                isSyncing: false, 
                lastSync: Date.now(),
                pendingItems: 0 
            });
            return;
        }

        const pendingItems = await this.getPendingItems();
        
        if (pendingItems.length === 0) {
            console.log('✅ No pending items to sync');
            await this.updateSyncStatus({ 
                isSyncing: false,
                lastSync: Date.now()
            });
            return;
        }

        console.log('📤 Syncing', pendingItems.length, 'pending items to Firebase...');

        let successCount = 0;
        let failCount = 0;
        const updatedPendingItems = [...pendingItems]; // Create a copy to modify

        for (let i = 0; i < pendingItems.length; i++) {
            const pendingItem = pendingItems[i];
            try {
                console.log(`🔄 Syncing item: ${pendingItem.data.name} (Attempt: ${pendingItem.retryCount + 1})`);

                let success = false;
                let firebaseId: string | null = null;

                switch (pendingItem.type) {
                    case 'CREATE_ITEM':
                        console.log('🔥 Creating item in Firebase:', pendingItem.data.name);
                        
                        // Prepare item data for Firebase
                        const itemData = {
                            code: pendingItem.data.code,
                            name: pendingItem.data.name,
                            price: Number(pendingItem.data.price) || 0,
                            category: pendingItem.data.category || 'Uncategorized',
                            stocks: Number(pendingItem.data.stocks) || 0,
                            status: pendingItem.data.status !== false,
                            image_base64: pendingItem.data.image_base64 || null,
                            has_image: pendingItem.data.has_image || false,
                            sales: Number(pendingItem.data.sales) || 0,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        };

                        const docRef = await addDoc(collection(this.db, 'items'), itemData);
                        firebaseId = docRef.id;
                        
                        console.log('✅ Item created in Firebase:', {
                            name: pendingItem.data.name,
                            firebaseId: firebaseId
                        });

                        // Update local storage with Firebase ID
                        const localItems = await this.getLocalItems();
                        const updatedItems = localItems.map(item => 
                            item.id === pendingItem.id 
                                ? { 
                                    ...item, 
                                    id: firebaseId, 
                                    firebaseId: firebaseId,
                                    isOffline: false, 
                                    syncStatus: 'synced',
                                    lastSynced: Date.now()
                                }
                                : item
                        );
                        await this.setItem('localItems', JSON.stringify(updatedItems));
                        
                        success = true;
                        successCount++;
                        
                        // Remove from pending items array
                        const index = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
                        if (index !== -1) {
                            updatedPendingItems.splice(index, 1);
                        }
                        break;

                    case 'UPDATE_ITEM':
                        console.log('🔥 Updating item in Firebase:', pendingItem.data.name);
                        
                        if (pendingItem.data.firebaseId) {
                            const itemDoc = doc(this.db, 'items', pendingItem.data.firebaseId);
                            await updateDoc(itemDoc, {
                                code: pendingItem.data.code,
                                name: pendingItem.data.name,
                                price: Number(pendingItem.data.price) || 0,
                                category: pendingItem.data.category || 'Uncategorized',
                                stocks: Number(pendingItem.data.stocks) || 0,
                                status: pendingItem.data.status !== false,
                                updated_at: new Date().toISOString()
                            });
                            
                            console.log('✅ Item updated in Firebase:', pendingItem.data.name);
                            success = true;
                            successCount++;
                            
                            // Remove from pending items array
                            const updateIndex = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
                            if (updateIndex !== -1) {
                                updatedPendingItems.splice(updateIndex, 1);
                            }
                        } else {
                            console.log('❌ No Firebase ID for update:', pendingItem.data.name);
                            updatedPendingItems[i].retryCount += 1;
                            failCount++;
                        }
                        break;

                    case 'DELETE_ITEM':
                        console.log('🔥 Deleting item from Firebase:', pendingItem.data.name);
                        
                        if (pendingItem.data.firebaseId) {
                            const itemDoc = doc(this.db, 'items', pendingItem.data.firebaseId);
                            await deleteDoc(itemDoc);
                            
                            console.log('✅ Item deleted from Firebase:', pendingItem.data.name);
                            success = true;
                            successCount++;
                            
                            // Remove from pending items array
                            const deleteIndex = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
                            if (deleteIndex !== -1) {
                                updatedPendingItems.splice(deleteIndex, 1);
                            }
                        } else {
                            console.log('❌ No Firebase ID for delete:', pendingItem.data.name);
                            updatedPendingItems[i].retryCount += 1;
                            failCount++;
                        }
                        break;

                    case 'CREATE_CATEGORY':
                        console.log('🔥 Creating category in Firebase:', pendingItem.data.name);
                        
                        const categoryData = {
                            name: pendingItem.data.name,
                            icon: pendingItem.data.icon || 'folder',
                            items_count: Number(pendingItem.data.items_count) || 0,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        };

                        const categoryDocRef = await addDoc(collection(this.db, 'categories'), categoryData);
                        const categoryFirebaseId = categoryDocRef.id;
                        
                        console.log('✅ Category created in Firebase:', {
                            name: pendingItem.data.name,
                            firebaseId: categoryFirebaseId
                        });

                        // Update local storage with Firebase ID
                        const localCategories = await this.getLocalCategories();
                        const updatedCategories = localCategories.map(cat => 
                            cat.id === pendingItem.id 
                                ? { 
                                    ...cat, 
                                    id: categoryFirebaseId, 
                                    firebaseId: categoryFirebaseId,
                                    isOffline: false, 
                                    syncStatus: 'synced',
                                    lastSynced: Date.now()
                                }
                                : cat
                        );
                        await this.setItem('localCategories', JSON.stringify(updatedCategories));
                        
                        success = true;
                        successCount++;
                        
                        // Remove from pending items array
                        const catIndex = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
                        if (catIndex !== -1) {
                            updatedPendingItems.splice(catIndex, 1);
                        }
                        break;

                    case 'UPDATE_CATEGORY':
                        console.log('🔥 Updating category in Firebase:', pendingItem.data.name);
                        
                        if (pendingItem.data.firebaseId) {
                            const categoryDoc = doc(this.db, 'categories', pendingItem.data.firebaseId);
                            await updateDoc(categoryDoc, {
                                name: pendingItem.data.name,
                                icon: pendingItem.data.icon || 'folder',
                                items_count: Number(pendingItem.data.items_count) || 0,
                                updated_at: new Date().toISOString()
                            });
                            
                            console.log('✅ Category updated in Firebase:', pendingItem.data.name);
                            success = true;
                            successCount++;
                            
                            // Remove from pending items array
                            const updateCatIndex = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
                            if (updateCatIndex !== -1) {
                                updatedPendingItems.splice(updateCatIndex, 1);
                            }
                        } else {
                            console.log('❌ No Firebase ID for category update:', pendingItem.data.name);
                            updatedPendingItems[i].retryCount += 1;
                            failCount++;
                        }
                        break;

                    case 'DELETE_CATEGORY':
                        console.log('🔥 Deleting category from Firebase:', pendingItem.data.name);
                        
                        if (pendingItem.data.firebaseId) {
                            const categoryDoc = doc(this.db, 'categories', pendingItem.data.firebaseId);
                            await deleteDoc(categoryDoc);
                            
                            console.log('✅ Category deleted from Firebase:', pendingItem.data.name);
                            success = true;
                            successCount++;
                            
                            // Remove from pending items array
                            const deleteCatIndex = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
                            if (deleteCatIndex !== -1) {
                                updatedPendingItems.splice(deleteCatIndex, 1);
                            }
                        } else {
                            console.log('❌ No Firebase ID for category delete:', pendingItem.data.name);
                            updatedPendingItems[i].retryCount += 1;
                            failCount++;
                        }
                        break;

                    case 'CREATE_ORDER':
                        console.log('🔥 Creating order in Firebase:', pendingItem.data.orderId);
                        
                        const orderData = {
                            orderId: pendingItem.data.orderId,
                            customerName: pendingItem.data.customerName,
                            items: pendingItem.data.items,
                            subtotal: Number(pendingItem.data.subtotal) || 0,
                            total: Number(pendingItem.data.total) || 0,
                            status: pendingItem.data.status || 'unpaid',
                            timestamp: pendingItem.data.timestamp,
                            created_at: new Date().toISOString()
                        };

                        const orderDocRef = await addDoc(collection(this.db, 'orders'), orderData);
                        const orderFirebaseId = orderDocRef.id;
                        
                        console.log('✅ Order created in Firebase:', {
                            orderId: pendingItem.data.orderId,
                            firebaseId: orderFirebaseId
                        });

                        // Update local storage with Firebase ID
                        const pendingReceipts = await this.getPendingReceipts();
                        const updatedReceipts = pendingReceipts.map(receipt => 
                            receipt.orderId === pendingItem.data.orderId 
                                ? { 
                                    ...receipt, 
                                    firebaseId: orderFirebaseId,
                                    syncStatus: 'synced'
                                }
                                : receipt
                        );
                        await this.setItem('pendingReceipts', JSON.stringify(updatedReceipts));
                        
                        success = true;
                        successCount++;
                        
                        // Remove from pending items array
                        const orderIndex = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
                        if (orderIndex !== -1) {
                            updatedPendingItems.splice(orderIndex, 1);
                        }
                        break;
                        // In the trySync method, add these cases for cups (after the existing switch cases):

case 'CREATE_CUP':
    console.log('🔥 Creating cup in Firebase:', pendingItem.data.name);
    
    const cupData = {
        name: pendingItem.data.name,
        size: pendingItem.data.size || '',
        stocks: Number(pendingItem.data.stocks) || 0,
        status: pendingItem.data.status !== false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const cupDocRef = await addDoc(collection(this.db, 'cups'), cupData);
    const cupFirebaseId = cupDocRef.id;
    
    console.log('✅ Cup created in Firebase:', {
        name: pendingItem.data.name,
        firebaseId: cupFirebaseId
    });

    // Update local storage with Firebase ID
    const currentCups = await this.getCups();
    const updatedCups = currentCups.map(cup => 
        cup.id === pendingItem.id 
            ? { 
                ...cup, 
                id: cupFirebaseId, 
                firebaseId: cupFirebaseId,
                isOffline: false, 
                syncStatus: 'synced',
                lastSynced: Date.now()
            }
            : cup
    );
    await this.saveCups(updatedCups);
    
    success = true;
    successCount++;
    
    // Remove from pending items array
    const cupIndex = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
    if (cupIndex !== -1) {
        updatedPendingItems.splice(cupIndex, 1);
    }
    break;

case 'UPDATE_CUP':
    console.log('🔥 Updating cup in Firebase:', pendingItem.data.name);
    
    if (pendingItem.data.firebaseId) {
        const cupDoc = doc(this.db, 'cups', pendingItem.data.firebaseId);
        await updateDoc(cupDoc, {
            name: pendingItem.data.name,
            size: pendingItem.data.size || '',
            stocks: Number(pendingItem.data.stocks) || 0,
            status: pendingItem.data.status !== false,
            updated_at: new Date().toISOString()
        });
        
        console.log('✅ Cup updated in Firebase:', pendingItem.data.name);
        success = true;
        successCount++;
        
        // Remove from pending items array
        const updateCupIndex = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
        if (updateCupIndex !== -1) {
            updatedPendingItems.splice(updateCupIndex, 1);
        }
    } else {
        console.log('❌ No Firebase ID for cup update:', pendingItem.data.name);
        updatedPendingItems[i].retryCount += 1;
        failCount++;
    }
    break;

case 'DELETE_CUP':
    console.log('🔥 Deleting cup from Firebase:', pendingItem.data.name);
    
    if (pendingItem.data.firebaseId) {
        const cupDoc = doc(this.db, 'cups', pendingItem.data.firebaseId);
        await deleteDoc(cupDoc);
        
        console.log('✅ Cup deleted from Firebase:', pendingItem.data.name);
        success = true;
        successCount++;
        
        // Remove from pending items array
        const deleteCupIndex = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
        if (deleteCupIndex !== -1) {
            updatedPendingItems.splice(deleteCupIndex, 1);
        }
    } else {
        console.log('❌ No Firebase ID for cup delete:', pendingItem.data.name);
        updatedPendingItems[i].retryCount += 1;
        failCount++;
    }
    break;
                }

            } catch (error) {
                console.error(`❌ Error syncing item ${pendingItem.data.name}:`, error);
                updatedPendingItems[i].retryCount += 1;
                failCount++;
            }

            // Small delay between requests to avoid overwhelming Firebase
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Remove items that have exceeded max retries
        const finalPendingItems = updatedPendingItems.filter(item => item.retryCount <= 10);
        
        // Save the updated pending items back to storage
        await this.setItem('pendingItems', JSON.stringify(finalPendingItems));

        // Update sync status
        await this.updateSyncStatus({
            isSyncing: false,
            lastSync: Date.now(),
            pendingItems: finalPendingItems.length
        });

        await this.setItem('lastSync', Date.now().toString());

        console.log('📊 Firebase sync completed:', {
            successful: successCount,
            failed: failCount,
            remaining: finalPendingItems.length,
            totalTime: 'Completed at ' + new Date().toLocaleTimeString()
        });

        // Show alert if there were any failures
        if (failCount > 0) {
            console.log('⚠️ Some items failed to sync. They will be retried later.');
        }

    } catch (error) {
        console.error('❌ Firebase sync process failed:', error);
        await this.updateSyncStatus({ 
            isSyncing: false,
            lastSyncAttempt: Date.now()
        });
    } finally {
        this.syncInProgress = false;
    }
}

  // Get current sync status
  getSyncStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  // Manually trigger sync (only works when online)
  async manualSync(): Promise<void> {
    console.log('👆 Manual sync triggered by user');
    
    if (!this.syncStatus.isOnline) {
      console.log('📱 Cannot sync - no Firebase connection');
      Alert.alert('Offline', 'Cannot sync without Firebase connection');
      return;
    }
    
    await this.trySync();
  }

  // Clear all local data (for testing)
  async clearLocalData(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync('localItems');
      await SecureStore.deleteItemAsync('pendingItems');
      await SecureStore.deleteItemAsync('lastSync');
      await SecureStore.deleteItemAsync('cups_data'); // ADD THIS FOR CUPS
      await SecureStore.deleteItemAsync('localCategories'); // ADD THIS FOR CATEGORIES
      await this.updateSyncStatus({
        isSyncing: false,
        lastSync: null,
        pendingItems: 0
      });
      console.log('🧹 All local data cleared');
    } catch (error) {
      console.error('❌ Error clearing local data:', error);
    }
  }

  async deleteLocalItem(itemId: string): Promise<boolean> {
    try {
        console.log('🗑️ Deleting item from local storage:', itemId);
        
        // Get current counts
        const localItemsBefore = await this.getLocalItems();
        const pendingItemsBefore = await this.getPendingItems();
        
        console.log('📊 Before deletion:');
        console.log('   Local items:', localItemsBefore.length);
        console.log('   Pending items:', pendingItemsBefore.length);
        
        // Remove from local items
        const updatedLocalItems = localItemsBefore.filter(item => item.id !== itemId);
        await this.setItem('localItems', JSON.stringify(updatedLocalItems));
        
        // Remove from pending items
        const updatedPendingItems = pendingItemsBefore.filter(item => item.id !== itemId);
        await this.setItem('pendingItems', JSON.stringify(updatedPendingItems));
        
        // Update sync status
        await this.updateSyncStatus({ 
            pendingItems: updatedPendingItems.length 
        });
        
        console.log('✅ After deletion:');
        console.log('   Local items:', updatedLocalItems.length, `(-${localItemsBefore.length - updatedLocalItems.length})`);
        console.log('   Pending items:', updatedPendingItems.length, `(-${pendingItemsBefore.length - updatedPendingItems.length})`);
        console.log('✅ Item deleted from local storage successfully');
        
        return true;
    } catch (error) {
        console.error('❌ Error deleting item from local storage:', error);
        return false;
    }
  }

  // ADD CUPS METHODS HERE - USING SECURESTORE
  // Save cups method - FIXED: Prevent duplicates
async saveCups(cups: CupItem[]): Promise<void> {
    try {
        console.log('💽 [LOCAL STORAGE] Starting cups save process...');
        console.log('📊 [LOCAL STORAGE] Saving cups:', cups.length, 'cups');
        
        // Remove duplicates based on ID
        const uniqueCups = cups.filter((cup, index, self) => 
            index === self.findIndex(c => c.id === cup.id)
        );
        
        if (uniqueCups.length !== cups.length) {
            console.log('🧹 Removed duplicate cups:', cups.length - uniqueCups.length);
        }
        
        uniqueCups.forEach((cup: CupItem, index: number) => {
            console.log(`🥤 [LOCAL STORAGE] Cup ${index + 1}:`, {
                name: cup.name,
                stocks: cup.stocks,
                size: cup.size,
                isOffline: cup.isOffline
            });
        });
        
        await AsyncStorage.setItem('cups_data', JSON.stringify(uniqueCups));
        console.log('💾 [LOCAL STORAGE] ✅ Cups saved to local storage successfully!');
        console.log('📈 [LOCAL STORAGE] Total cups saved:', uniqueCups.length);
    } catch (error) {
        console.error('❌ [LOCAL STORAGE] ERROR saving cups to local storage:', error);
        throw error;
    }
}
async getCups(): Promise<CupItem[]> {
  try {
      const cupsData = await AsyncStorage.getItem('cups');
      if (cupsData) {
          const cups = JSON.parse(cupsData);
          console.log('🔍 [LOCAL STORAGE] Retrieved cups from local storage:', cups.length, 'cups');
          
          if (cups.length > 0) {
              console.log('🥤 [LOCAL STORAGE] Cups in local storage:');
              cups.forEach((cup: CupItem, index: number) => {
                  console.log(`   ${index + 1}. ${cup.name} - Stocks: ${cup.stocks}`);
              });
          }
          
          return cups;
      }
      console.log('🔍 [LOCAL STORAGE] No cups found in local storage');
      return [];
  } catch (error) {
      console.error('❌ [LOCAL STORAGE] ERROR loading cups from local storage:', error);
      return [];
  }
}

async deleteLocalCup(id: string): Promise<boolean> {
    try {
        const currentCups = await this.getCups();
        const updatedCups = currentCups.filter(cup => cup.id !== id);
        await this.saveCups(updatedCups);
        console.log('🗑️ Cup deleted from local storage:', id);
        return true;
    } catch (error) {
        console.error('Error deleting cup from local storage:', error);
        return false;
    }
}

// Save category method - FIXED: Prevent duplicates
async saveCategory(categoryData: any, isOnline: boolean = false): Promise<{ success: boolean; id: string; isOffline: boolean }> {
    try {
        console.log('💽 [LOCAL STORAGE] Starting category save process...', { 
            categoryName: categoryData.name, 
            isOnline 
        });

        // Use existing ID if provided (for updates), otherwise generate new one
        const categoryId = categoryData.id || (isOnline ? `server_${Date.now()}` : `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
        
        // ALWAYS SAVE TO LOCAL STORAGE FOR BACKUP
        const localCategories = await this.getLocalCategories();
        console.log('📊 [LOCAL STORAGE] Current local categories count:', localCategories.length);
        
        // If this is an online category with Firebase ID, remove any existing offline duplicates
        if (isOnline && categoryData.firebaseId) {
            const duplicateOfflineCategories = localCategories.filter(cat => 
                cat.name.toLowerCase() === categoryData.name.toLowerCase() && cat.isOffline
            );
            
            if (duplicateOfflineCategories.length > 0) {
                console.log('🧹 Removing duplicate offline categories:', duplicateOfflineCategories.length);
                const cleanedCategories = localCategories.filter(cat => 
                    !(cat.name.toLowerCase() === categoryData.name.toLowerCase() && cat.isOffline)
                );
                await this.setItem('localCategories', JSON.stringify(cleanedCategories));
                // Update localCategories reference after cleaning
                localCategories.length = 0;
                localCategories.push(...cleanedCategories);
            }
        }
        
        const existingCategoryIndex = localCategories.findIndex(cat => 
            cat.id === categoryData.id || 
            (cat.name.toLowerCase() === categoryData.name.toLowerCase() && !categoryData.id)
        );
        
        const saveData = {
            ...categoryData,
            id: categoryId,
            isOffline: !isOnline,
            syncStatus: isOnline ? 'synced' : 'pending',
            lastUpdated: Date.now(),
            ...(!categoryData.created && { created: Date.now() }) // Only set created time if not already set
        };

        if (existingCategoryIndex !== -1) {
            // Update existing category
            localCategories[existingCategoryIndex] = {
                ...localCategories[existingCategoryIndex],
                ...saveData
            };
            console.log('📝 [LOCAL STORAGE] ✅ UPDATED existing category:', {
                name: categoryData.name,
                id: categoryId,
                isOffline: !isOnline
            });
        } else {
            // Add new category
            localCategories.push(saveData);
            console.log('✅ [LOCAL STORAGE] ✅ ADDED new category:', {
                name: categoryData.name,
                id: categoryId,
                isOffline: !isOnline
            });
        }

        await this.setItem('localCategories', JSON.stringify(localCategories));
        console.log('💾 [LOCAL STORAGE] ✅ Category saved to local storage!');
        console.log('📈 [LOCAL STORAGE] Total categories now:', localCategories.length);

        // ALWAYS ADD TO PENDING ITEMS FOR SYNC (regardless of online/offline)
        // This ensures sync will happen even if server was temporarily unavailable
        if (!isOnline) {
            const pendingCategory: PendingItem = {
                id: categoryId,
                type: existingCategoryIndex !== -1 ? 'UPDATE_CATEGORY' : 'CREATE_CATEGORY',
                data: {
                    name: categoryData.name,
                    icon: categoryData.icon || 'folder',
                    ...(categoryData.id && { id: categoryData.id }) // Include ID for updates
                },
                timestamp: Date.now(),
                retryCount: 0
            };

            const pendingItems = await this.getPendingItems();
            console.log('📬 [LOCAL STORAGE] Current pending items:', pendingItems.length);
            
            // Remove any existing pending item with same ID to avoid duplicates
            const filteredPendingItems = pendingItems.filter(item => item.id !== categoryId);
            filteredPendingItems.push(pendingCategory);
            
            await this.setItem('pendingItems', JSON.stringify(filteredPendingItems));
            
            await this.updateSyncStatus({ 
                pendingItems: filteredPendingItems.length,
                lastSyncAttempt: Date.now()
            });
            
            console.log('📬 [LOCAL STORAGE] ✅ Category added to pending sync queue');
            console.log('🔄 [LOCAL STORAGE] Pending items count:', filteredPendingItems.length);

            // Try to sync immediately if online
            if (this.syncStatus.isOnline) {
                console.log('🚀 [LOCAL STORAGE] Immediate sync triggered for category');
                setTimeout(() => this.trySync(), 1000);
            } else {
                console.log('📡 [LOCAL STORAGE] Offline - category will sync when connection is available');
            }
        } else {
            console.log('🌐 [LOCAL STORAGE] Category marked as synced with server');
        }

        console.log('🎉 [LOCAL STORAGE] ✅ CATEGORY SAVE COMPLETE!');
        return { success: true, id: categoryId, isOffline: !isOnline };

    } catch (error) {
        console.error('❌ [LOCAL STORAGE] ERROR saving category:', error);
        return { success: false, id: '', isOffline: true };
    }
}

// Get categories from local storage
async getLocalCategories(): Promise<Category[]> {
  try {
      const categoriesJson = await this.getItem('localCategories');
      const categories = categoriesJson ? JSON.parse(categoriesJson) : [];
      console.log('🔍 [LOCAL STORAGE] Retrieved categories from local storage:', categories.length, 'categories');
      
      if (categories.length > 0) {
          console.log('📂 [LOCAL STORAGE] Categories in local storage:');
          categories.forEach((category: Category, index: number) => {
              console.log(`   ${index + 1}. ${category.name} - ${category.isOffline ? '📱 OFFLINE' : '🌐 ONLINE'}`);
          });
      }
      
      return categories;
  } catch (error) {
      console.error('❌ [LOCAL STORAGE] ERROR reading local categories:', error);
      return [];
  }
}

// Delete category from local storage
async deleteLocalCategory(id: string): Promise<boolean> {
  try {
      console.log('🗑️ [LOCAL STORAGE] Deleting category from local storage:', id);
      
      // Get current categories and items
      const localCategories = await this.getLocalCategories();
      const localItems = await this.getLocalItems();
      
      // Find the category to get its name
      const categoryToDelete = localCategories.find(cat => cat.id === id);
      const categoryName = categoryToDelete?.name;
      
      console.log('📊 [LOCAL STORAGE] Before category deletion:');
      console.log('   Categories:', localCategories.length);
      console.log('   Items:', localItems.length);
      
      // Remove from local categories
      const updatedCategories = localCategories.filter(cat => cat.id !== id);
      await this.setItem('localCategories', JSON.stringify(updatedCategories));
      
      // Update items that use this category to "Uncategorized"
      if (categoryName) {
          const updatedItems = localItems.map(item => 
              item.category === categoryName 
                  ? { ...item, category: 'Uncategorized' }
                  : item
          );
          await this.setItem('localItems', JSON.stringify(updatedItems));
          console.log('📝 [LOCAL STORAGE] Updated items with deleted category');
      }
      
      // Remove from pending items
      const pendingItems = await this.getPendingItems();
      const updatedPendingItems = pendingItems.filter(item => item.id !== id);
      await this.setItem('pendingItems', JSON.stringify(updatedPendingItems));
      
      // Update sync status
      await this.updateSyncStatus({ 
          pendingItems: updatedPendingItems.length 
      });
      
      console.log('✅ [LOCAL STORAGE] After category deletion:');
      console.log('   Categories:', updatedCategories.length);
      console.log('   Items:', localItems.length, '(categories updated)');
      console.log('   Pending items:', updatedPendingItems.length);
      console.log('✅ [LOCAL STORAGE] Category deleted from local storage successfully');
      
      return true;
  } catch (error) {
      console.error('❌ [LOCAL STORAGE] Error deleting category from local storage:', error);
      return false;
  }
}

async autoSyncWhenOnline(): Promise<void> {
  console.log('🔄 Auto-sync triggered - checking for pending items...');
  
  try {
      const pendingItems = await this.getPendingItems();
      const pendingCategories = await this.getPendingCategories();
      
      if (pendingItems.length > 0 || pendingCategories.length > 0) {
          console.log(`🔄 Found ${pendingItems.length} items and ${pendingCategories.length} categories to sync`);
          await this.manualSync();
      } else {
          console.log('✅ No pending items to sync');
      }
  } catch (error) {
      console.error('❌ Auto-sync error:', error);
  }
}
// Add this method to OfflineSyncService class in offline-sync.ts
async clearPendingReceipts(): Promise<void> {
    try {
        console.log('🗑️ Clearing all pending receipts from local storage...');
        await this.setItem('pendingReceipts', JSON.stringify([]));
        console.log('✅ All pending receipts cleared from local storage');
    } catch (error) {
        console.error('❌ Error clearing pending receipts:', error);
        throw error;
    }
}

// Get pending categories for sync
async getPendingCategories(): Promise<any[]> {
  try {
      const localCategories = await this.getLocalCategories();
      // Return categories that are marked as offline (need sync)
      return localCategories.filter(cat => cat.isOffline === true);
  } catch (error) {
      console.error('❌ Error getting pending categories:', error);
      return [];
  }
}

// Method to get pending receipts from local storage
async getPendingReceipts(): Promise<ReceiptData[]> {
  try {
      const receiptsJson = await this.getItem('pendingReceipts');
      const receipts = receiptsJson ? JSON.parse(receiptsJson) : [];
      console.log('📋 Retrieved pending receipts from local storage:', receipts.length);
      return receipts;
  } catch (error) {
      console.error('❌ Error reading pending receipts:', error);
      return [];
  }
}

// Method to update receipt status in local storage
async updateReceiptStatus(orderId: string, newStatus: 'paid' | 'cancelled'): Promise<boolean> {
  try {
      const receipts = await this.getPendingReceipts();
      const updatedReceipts = receipts.map(receipt => 
          receipt.orderId === orderId ? { ...receipt, status: newStatus } : receipt
      );
      
      await this.setItem('pendingReceipts', JSON.stringify(updatedReceipts));
      console.log('✅ Updated receipt status in local storage:', orderId, newStatus);
      return true;
  } catch (error) {
      console.error('❌ Error updating receipt status:', error);
      return false;
  }
}

// Function to clear duplicate pending items
async clearDuplicatePendingItems(): Promise<void> {
  try {
      const pendingItems = await this.getPendingItems();
      const localItems = await this.getLocalItems();
      
      const uniquePendingItems = pendingItems.filter((pendingItem, index, array) => {
          // Remove duplicates based on item data
          const isDuplicate = array.findIndex(item => 
              item.data.code === pendingItem.data.code && 
              item.data.name === pendingItem.data.name
          ) !== index;
          
          // Also check if item already exists in local storage as synced
          const alreadySynced = localItems.some(localItem => 
              (localItem.code === pendingItem.data.code || localItem.name === pendingItem.data.name) &&
              localItem.syncStatus === 'synced'
          );
          
          return !isDuplicate && !alreadySynced;
      });
      
      await this.setItem('pendingItems', JSON.stringify(uniquePendingItems));
      console.log('🧹 Cleared duplicate pending items:', pendingItems.length - uniquePendingItems.length, 'removed');
      
      await this.updateSyncStatus({ 
          pendingItems: uniquePendingItems.length 
      });
  } catch (error) {
      console.error('❌ Error clearing duplicate pending items:', error);
  }
}

async removeDuplicateItems(): Promise<void> {
    try {
        const localItems = await this.getLocalItems();
        
        // Use a Map to remove duplicates based on id
        const uniqueItemsMap = new Map();
        localItems.forEach(item => {
            if (!uniqueItemsMap.has(item.id)) {
                uniqueItemsMap.set(item.id, item);
            } else {
                console.log('🗑️ Removing duplicate item:', item.name, item.id);
            }
        });
        
        const uniqueItems = Array.from(uniqueItemsMap.values());
        
        if (uniqueItems.length !== localItems.length) {
            await this.setItem('localItems', JSON.stringify(uniqueItems));
            console.log('🧹 Removed duplicate items:', localItems.length - uniqueItems.length, 'items removed');
        }
        
        // Also clean pending items
        const pendingItems = await this.getPendingItems();
        const uniquePendingMap = new Map();
        pendingItems.forEach(item => {
            if (!uniquePendingMap.has(item.id)) {
                uniquePendingMap.set(item.id, item);
            } else {
                console.log('🗑️ Removing duplicate pending item:', item.data.name, item.id);
            }
        });
        
        const uniquePendingItems = Array.from(uniquePendingMap.values());
        
        if (uniquePendingItems.length !== pendingItems.length) {
            await this.setItem('pendingItems', JSON.stringify(uniquePendingItems));
            console.log('🧹 Removed duplicate pending items:', pendingItems.length - uniquePendingItems.length, 'items removed');
            
            await this.updateSyncStatus({ 
                pendingItems: uniquePendingItems.length 
            });
        }
        
    } catch (error) {
        console.error('❌ Error removing duplicate items:', error);
    }
}

// Add order to pending sync
async addPendingOrder(orderData: ReceiptData): Promise<void> {
    try {
        const pendingItem: PendingItem = {
            id: orderData.orderId,
            type: 'CREATE_ORDER',
            data: orderData,
            timestamp: Date.now(),
            retryCount: 0
        };

        const pendingItems = await this.getPendingItems();
        pendingItems.push(pendingItem);
        await this.setItem('pendingItems', JSON.stringify(pendingItems));
        
        await this.updateSyncStatus({ 
            pendingItems: pendingItems.length,
            lastSyncAttempt: Date.now()
        });
        
        console.log('📬 Order added to pending sync queue:', orderData.orderId);
    } catch (error) {
        console.error('❌ Error adding order to pending sync:', error);
    }
}

// Sync specific order to Firebase
async syncOrderToFirebase(orderData: ReceiptData): Promise<boolean> {
    try {
        console.log('🔥 Syncing order to Firebase:', orderData.orderId);
        
        const orderDataForFirebase = {
            orderId: orderData.orderId,
            customerName: orderData.customerName,
            items: orderData.items.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                total: item.price * item.quantity
            })),
            subtotal: orderData.subtotal,
            total: orderData.total,
            status: orderData.status,
            timestamp: orderData.timestamp,
            created_at: new Date().toISOString()
        };

        const docRef = await addDoc(collection(this.db, 'orders'), orderDataForFirebase);
        const firebaseId = docRef.id;

        console.log('✅ Order synced to Firebase:', {
            orderId: orderData.orderId,
            firebaseId: firebaseId
        });

        // Update local storage with Firebase ID
        const pendingReceipts = await this.getPendingReceipts();
        const updatedReceipts = pendingReceipts.map(receipt => 
            receipt.orderId === orderData.orderId 
                ? { ...receipt, firebaseId: firebaseId }
                : receipt
        );
        await this.setItem('pendingReceipts', JSON.stringify(updatedReceipts));

        return true;
    } catch (error) {
        console.error('❌ Error syncing order to Firebase:', error);
        return false;
    }
}
}