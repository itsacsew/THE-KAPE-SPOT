// lib/offline-sync.ts
import * as SecureStore from 'expo-secure-store';
import { NetworkScanner } from './network-scanner';
import { Alert } from 'react-native';

interface PendingItem {
  id: string;
  type: 'CREATE_ITEM' | 'UPDATE_ITEM' | 'DELETE_ITEM';
  data: any;
  timestamp: number;
  retryCount: number;
  serverId?: string;
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
  private async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
    console.log('💾 Saved to local storage:', key);
  }

  private async getItem(key: string): Promise<string | null> {
    return await SecureStore.getItemAsync(key);
  }

  // ALWAYS SAVE TO LOCAL STORAGE (both online and offline)
  async saveItem(itemData: any, isOnline: boolean = false): Promise<{ success: boolean; id: string; isOffline: boolean }> {
    try {
      console.log('💽 Starting item save process...', { 
        itemName: itemData.name, 
        isOnline 
      });

      const itemId = isOnline ? `server_${Date.now()}` : `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // ALWAYS SAVE TO LOCAL STORAGE FOR BACKUP
      const localItems = await this.getLocalItems();
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
        console.log('📝 Updated existing item in local storage:', itemData.name);
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
        console.log('✅ Added new item to local storage:', itemData.name);
      }

      await this.setItem('localItems', JSON.stringify(localItems));
      console.log('💾 Local storage updated with', localItems.length, 'items');

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
        pendingItems.push(pendingItem);
        await this.setItem('pendingItems', JSON.stringify(pendingItems));
        
        await this.updateSyncStatus({ 
          pendingItems: pendingItems.length,
          lastSyncAttempt: Date.now()
        });
        console.log('📬 Item added to pending sync queue');

        // Try to sync immediately if online
        if (this.syncStatus.isOnline) {
          this.trySync();
        } else {
          console.log('📡 Offline - item will sync when connection is available');
        }
      } else {
        console.log('🌐 Item saved online, local backup complete');
      }

      return { success: true, id: itemId, isOffline: !isOnline };

    } catch (error) {
      console.error('❌ Error saving item:', error);
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
      console.log('🔍 Local storage contains', items.length, 'items');
      return items;
    } catch (error) {
      console.error('❌ Error reading local items:', error);
      return [];
    }
  }

  private async getPendingItems(): Promise<PendingItem[]> {
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

      for (const pendingItem of pendingItems) {
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

              const result = await response.json();
              success = result.success;
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
              } else {
                console.log('❌ Server rejected item:', pendingItem.data.name, result.message);
                failCount++;
              }
              break;
          }

          if (success) {
            // Remove from pending items
            const updatedPending = pendingItems.filter(item => item.id !== pendingItem.id);
            await this.setItem('pendingItems', JSON.stringify(updatedPending));
          } else {
            // Increment retry count
            pendingItem.retryCount += 1;
            if (pendingItem.retryCount > 5) {
              console.log('🚫 Max retries reached for item:', pendingItem.data.name);
            }
          }

        } catch (error) {
          console.error(`❌ Error syncing item ${pendingItem.data.name}:`, error);
          pendingItem.retryCount += 1;
          failCount++;
        }
      }

      // Update sync status
      const updatedPending = await this.getPendingItems();
      await this.updateSyncStatus({
        isSyncing: false,
        lastSync: Date.now(),
        pendingItems: updatedPending.length
      });

      await this.setItem('lastSync', Date.now().toString());

      console.log('📊 Sync completed:', {
        successful: successCount,
        failed: failCount,
        remaining: updatedPending.length,
        totalTime: 'Completed at ' + new Date().toLocaleTimeString()
      });

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
}