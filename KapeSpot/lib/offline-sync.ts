// lib/offline-sync.ts
import * as SecureStore from 'expo-secure-store';
import { NetworkScanner } from './network-scanner';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PendingItem {
  id: string;
  type: 'CREATE_ITEM' | 'UPDATE_ITEM' | 'DELETE_ITEM' | 'CREATE_CATEGORY' | 'UPDATE_CATEGORY' | 'DELETE_CATEGORY';
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

    console.log('🔄 OfflineSync Service Initialized');
    this.checkNetworkStatus();
  }

  // Check if we have internet connection
  private async checkNetworkStatus(): Promise<void> {
    try {
      const serverIP = await NetworkScanner.findServerIP();
      const wasOnline = this.syncStatus.isOnline;
      const isNowOnline = serverIP !== 'demo';
      
      this.syncStatus.isOnline = isNowOnline;
      
      if (!wasOnline && isNowOnline) {
        console.log('📡 Internet connection restored - starting sync');
        this.trySync();
      } else if (wasOnline && !isNowOnline) {
        console.log('📡 Internet connection lost');
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
                type: 'CREATE_ITEM',
                data: itemData,
                timestamp: Date.now(),
                retryCount: 0
            };

            const pendingItems = await this.getPendingItems();
            console.log('📬 [LOCAL STORAGE] Current pending items:', pendingItems.length);
            
            pendingItems.push(pendingItem);
            await this.setItem('pendingItems', JSON.stringify(pendingItems));
            
            await this.updateSyncStatus({ 
                pendingItems: pendingItems.length,
                lastSyncAttempt: Date.now()
            });
            
            console.log('📬 [LOCAL STORAGE] ✅ Item added to pending sync queue');
            console.log('🔄 [LOCAL STORAGE] Pending items count:', pendingItems.length);

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

  // Sync pending items with server (ONLY WHEN ONLINE)
  async trySync(): Promise<void> {
    if (this.syncInProgress) {
        console.log('⏸️ Sync already in progress, skipping...');
        return;
    }

    if (!this.syncStatus.isOnline) {
        console.log('📡 No internet connection - cannot sync');
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
    
    console.log('🔄 Starting sync process...');

    try {
        const apiBaseUrl = await NetworkScanner.findServerIP();
        
        if (apiBaseUrl === 'demo') {
            console.log('🎮 Demo mode - clearing pending items');
            await this.setItem('pendingItems', '[]');
            await this.updateSyncStatus({ 
                isSyncing: false, 
                lastSync: Date.now(),
                pendingItems: 0 
            });
            return;
        }

        const baseUrl = `http://${apiBaseUrl}/backend/api`;
        const pendingItems = await this.getPendingItems();
        
        if (pendingItems.length === 0) {
            console.log('✅ No pending items to sync');
            await this.updateSyncStatus({ 
                isSyncing: false,
                lastSync: Date.now()
            });
            return;
        }

        console.log('📤 Syncing', pendingItems.length, 'pending items to server...');

        let successCount = 0;
        let failCount = 0;
        const updatedPendingItems = [...pendingItems]; // Create a copy to modify

        for (let i = 0; i < pendingItems.length; i++) {
            const pendingItem = pendingItems[i];
            try {
                console.log(`🔄 Syncing item: ${pendingItem.data.name} (Attempt: ${pendingItem.retryCount + 1})`);

                let success = false;
                let serverId: string | number | null = null;

                switch (pendingItem.type) {
                    case 'CREATE_ITEM':
                        const response = await fetch(`${baseUrl}/items.php`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(pendingItem.data),
                        });

                        // Check if response is OK first
                        if (!response.ok) {
                            // Handle specific HTTP errors
                            if (response.status === 409) {
                                console.log(`⚠️ Item already exists on server: ${pendingItem.data.name}`);
                                
                                // Try to get the existing item from server and update local storage
                                try {
                                    const existingItemsResponse = await fetch(`${baseUrl}/items.php`);
                                    if (existingItemsResponse.ok) {
                                        const existingItems = await existingItemsResponse.json();
                                        const existingItem = existingItems.find((item: any) => 
                                            item.code === pendingItem.data.code || 
                                            item.name === pendingItem.data.name
                                        );
                                        
                                        if (existingItem) {
                                            // Update local storage with existing server item
                                            const localItems = await this.getLocalItems();
                                            const updatedItems = localItems.map(item => 
                                                item.id === pendingItem.id 
                                                    ? { 
                                                        ...item, 
                                                        id: String(existingItem.id), 
                                                        isOffline: false, 
                                                        syncStatus: 'synced',
                                                        serverId: String(existingItem.id),
                                                        lastSynced: Date.now()
                                                    }
                                                    : item
                                            );
                                            await this.setItem('localItems', JSON.stringify(updatedItems));
                                            console.log('✅ Updated local item with existing server item:', pendingItem.data.name);
                                            success = true;
                                            successCount++;
                                            
                                            // Remove from pending items array
                                            const index = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
                                            if (index !== -1) {
                                                updatedPendingItems.splice(index, 1);
                                            }
                                        } else {
                                            throw new Error('Existing item not found on server');
                                        }
                                    }
                                } catch (updateError) {
                                    console.log('❌ Failed to update local item with server data:', updateError);
                                    // Mark as duplicate and remove from pending
                                    console.log(`🗑️ Removing duplicate item from sync queue: ${pendingItem.data.name}`);
                                    const index = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
                                    if (index !== -1) {
                                        updatedPendingItems.splice(index, 1);
                                    }
                                    successCount++; // Count as "success" since we handled the duplicate
                                }
                                break;
                            }
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }

                        const responseText = await response.text();
                        console.log('📄 Server response:', responseText);

                        let result;
                        try {
                            result = JSON.parse(responseText);
                        } catch (parseError) {
                            console.error('❌ Failed to parse JSON response:', parseError);
                            throw new Error('Invalid JSON response from server');
                        }

                        success = result.success === true || result.success === 'true';
                        serverId = result.item_id || result.id;

                        if (success && serverId) {
                            // Update local storage with server ID
                            const localItems = await this.getLocalItems();
                            const updatedItems = localItems.map(item => 
                                item.id === pendingItem.id 
                                    ? { 
                                        ...item, 
                                        id: String(serverId), 
                                        isOffline: false, 
                                        syncStatus: 'synced',
                                        serverId: String(serverId),
                                        lastSynced: Date.now()
                                    }
                                    : item
                            );
                            await this.setItem('localItems', JSON.stringify(updatedItems));
                            console.log('✅ Item synced successfully:', pendingItem.data.name);
                            successCount++;
                            
                            // Remove from pending items array
                            const index = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
                            if (index !== -1) {
                                updatedPendingItems.splice(index, 1);
                            }
                        } else {
                            console.log('❌ Server rejected item:', pendingItem.data.name, result.message);
                            // Increment retry count for this item
                            updatedPendingItems[i].retryCount += 1;
                            failCount++;
                        }
                        break;

                    case 'CREATE_CATEGORY':
                        const categoryResponse = await fetch(`${baseUrl}/categories.php`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(pendingItem.data),
                        });

                        if (!categoryResponse.ok) {
                            // Handle category conflicts
                            if (categoryResponse.status === 409) {
                                console.log(`⚠️ Category already exists on server: ${pendingItem.data.name}`);
                                
                                // Try to get the existing category from server
                                try {
                                    const existingCategoriesResponse = await fetch(`${baseUrl}/categories.php`);
                                    if (existingCategoriesResponse.ok) {
                                        const existingCategories = await existingCategoriesResponse.json();
                                        const existingCategory = existingCategories.find((cat: any) => 
                                            cat.name === pendingItem.data.name
                                        );
                                        
                                        if (existingCategory) {
                                            // Update local storage with existing server category
                                            const localCategories = await this.getLocalCategories();
                                            const updatedCategories = localCategories.map(cat => 
                                                cat.id === pendingItem.id 
                                                    ? { 
                                                        ...cat, 
                                                        id: String(existingCategory.id), 
                                                        isOffline: false, 
                                                        syncStatus: 'synced',
                                                        serverId: String(existingCategory.id),
                                                        lastSynced: Date.now()
                                                    }
                                                    : cat
                                            );
                                            await this.setItem('localCategories', JSON.stringify(updatedCategories));
                                            console.log('✅ Updated local category with existing server category:', pendingItem.data.name);
                                            success = true;
                                            successCount++;
                                            
                                            // Remove from pending items array
                                            const index = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
                                            if (index !== -1) {
                                                updatedPendingItems.splice(index, 1);
                                            }
                                        }
                                    }
                                } catch (updateError) {
                                    console.log('❌ Failed to update local category with server data:', updateError);
                                    // Remove duplicate category from pending
                                    console.log(`🗑️ Removing duplicate category from sync queue: ${pendingItem.data.name}`);
                                    const index = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
                                    if (index !== -1) {
                                        updatedPendingItems.splice(index, 1);
                                    }
                                    successCount++;
                                }
                                break;
                            }
                            throw new Error(`HTTP error! status: ${categoryResponse.status}`);
                        }

                        const categoryResponseText = await categoryResponse.text();
                        console.log('📄 Category server response:', categoryResponseText);

                        let categoryResult;
                        try {
                            categoryResult = JSON.parse(categoryResponseText);
                        } catch (parseError) {
                            console.error('❌ Failed to parse category JSON response:', parseError);
                            throw new Error('Invalid JSON response from server for category');
                        }

                        const categorySuccess = categoryResult.success === true || categoryResult.success === 'true';
                        const categoryServerId = categoryResult.category_id || categoryResult.id;

                        if (categorySuccess && categoryServerId) {
                            // Update local storage with server ID
                            const localCategories = await this.getLocalCategories();
                            const updatedCategories = localCategories.map(cat => 
                                cat.id === pendingItem.id 
                                    ? { 
                                        ...cat, 
                                        id: String(categoryServerId), 
                                        isOffline: false, 
                                        syncStatus: 'synced',
                                        serverId: String(categoryServerId),
                                        lastSynced: Date.now()
                                    }
                                    : cat
                            );
                            await this.setItem('localCategories', JSON.stringify(updatedCategories));
                            console.log('✅ Category synced successfully:', pendingItem.data.name);
                            successCount++;
                            
                            // Remove from pending items array
                            const index = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
                            if (index !== -1) {
                                updatedPendingItems.splice(index, 1);
                            }
                        } else {
                            console.log('❌ Server rejected category:', pendingItem.data.name, categoryResult.message);
                            updatedPendingItems[i].retryCount += 1;
                            failCount++;
                        }
                        break;

                    case 'DELETE_CATEGORY':
                        console.log('🗑️ [SYNC] Deleting category from server:', pendingItem.data.name);
                        
                        const deleteResponse = await fetch(`${baseUrl}/categories.php?id=${pendingItem.data.id}`, {
                            method: 'DELETE',
                        });

                        if (!deleteResponse.ok) {
                            throw new Error(`HTTP error! status: ${deleteResponse.status}`);
                        }

                        const deleteResult = await deleteResponse.json();
                        const deleteSuccess = deleteResult.success === true || deleteResult.success === 'true';

                        if (deleteSuccess) {
                            console.log('✅ Category deleted successfully from server:', pendingItem.data.name);
                            successCount++;
                            
                            // Remove from pending items array
                            const index = updatedPendingItems.findIndex(item => item.id === pendingItem.id);
                            if (index !== -1) {
                                updatedPendingItems.splice(index, 1);
                            }
                        } else {
                            throw new Error(deleteResult.message || 'Server returned success: false');
                        }
                        break;
                }

            } catch (error) {
                
                updatedPendingItems[i].retryCount += 1;
                failCount++;
            }

            // Small delay between requests to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Remove items that have exceeded max retries (10 instead of 5 for more tolerance)
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

        console.log('📊 Sync completed:', {
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
        console.error('❌ Sync process failed:', error);
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
      console.log('📡 Cannot sync - no internet connection');
      Alert.alert('Offline', 'Cannot sync without internet connection');
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
  async saveCups(cups: CupItem[]): Promise<void> {
    try {
        console.log('💽 [LOCAL STORAGE] Starting cups save process...');
        console.log('📊 [LOCAL STORAGE] Saving cups:', cups.length, 'cups');
        
        cups.forEach((cup: CupItem, index: number) => {
            console.log(`🥤 [LOCAL STORAGE] Cup ${index + 1}:`, {
                name: cup.name,
                stocks: cup.stocks,
                size: cup.size
            });
        });
        
        await AsyncStorage.setItem('cups_data', JSON.stringify(cups));
        console.log('💾 [LOCAL STORAGE] ✅ Cups saved to local storage successfully!');
        console.log('📈 [LOCAL STORAGE] Total cups saved:', cups.length);
    } catch (error) {
        console.error('❌ [LOCAL STORAGE] ERROR saving cups to local storage:', error);
        throw error;
    }
}

async getCups(): Promise<CupItem[]> {
  try {
      const cupsData = await AsyncStorage.getItem('cups_data');
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

// Add to OfflineSyncService class in offline-sync.ts

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

}