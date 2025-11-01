// lib/network-scanner.ts
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { app } from './firebase-config';

export class NetworkScanner {
    private static currentConnection: 'online' | 'offline' = 'offline';
    private static connectionListeners: ((isConnected: boolean, mode: 'online' | 'offline') => void)[] = [];
    private static isMonitoring: boolean = false;
    private static syncService: any = null;
    private static db = getFirestore(app);
    private static auth = getAuth(app);
    private static connectionCheckInterval: number | null = null;

    // Check Firebase connectivity
    static async checkFirebaseConnection(): Promise<'online' | 'offline'> {
        console.log('🔍 Checking Firebase connection...');
        
        try {
            // Test Firestore connection
            const testDocRef = doc(this.db, 'connection_test', 'test');
            await getDoc(testDocRef);
            
            console.log('✅ Firebase connection successful');
            return 'online';
        } catch (error) {
            console.log('❌ Firebase connection failed, using offline mode');
            return 'offline';
        }
    }

    // Main method to determine connection mode
    static async findServerIP(): Promise<'online' | 'offline'> {
        console.log('🔍 Determining connection mode (Firebase Online/Offline)...');
        
        const connectionStatus = await this.checkFirebaseConnection();
        
        if (connectionStatus === 'online') {
            console.log('🔥 Connected to Firebase (Online Mode)');
            return 'online';
        } else {
            console.log('📱 Using Local Storage (Offline Mode)');
            return 'offline';
        }
    }

    // Add connection monitoring
    static async monitorServerConnection(): Promise<void> {
        if (this.isMonitoring) {
            console.log('🔍 Firebase connection monitoring already running...');
            return;
        }

        this.isMonitoring = true;
        console.log('🔍 Starting Firebase connection monitoring...');
        
        // Initial connection check
        const initialStatus = await this.findServerIP();
        const previousStatus = this.currentConnection;
        this.currentConnection = initialStatus;
        
        if (previousStatus !== initialStatus) {
            const isConnected = initialStatus === 'online';
            this.connectionListeners.forEach(listener => listener(isConnected, initialStatus));
            
            if (isConnected) {
                console.log('🎯 Initial Firebase connection detected, triggering auto-sync...');
                await this.triggerAutoSync();
            }
        }

        // Monitor Firebase Auth state changes
        const authUnsubscribe = onAuthStateChanged(this.auth, async (user) => {
            if (user) {
                // User is signed in, check Firestore connection
                const newStatus = await this.checkFirebaseConnection();
                if (this.currentConnection !== newStatus) {
                    console.log(`🔄 Firebase connection changed: ${this.currentConnection} -> ${newStatus}`);
                    this.currentConnection = newStatus;
                    
                    const isConnected = newStatus === 'online';
                    this.connectionListeners.forEach(listener => listener(isConnected, newStatus));
                    
                    if (isConnected) {
                        console.log('🎯 Firebase reconnected, triggering auto-sync...');
                        await this.triggerAutoSync();
                    }
                }
            } else {
                // User signed out, switch to offline mode
                if (this.currentConnection !== 'offline') {
                    console.log('👤 User signed out, switching to offline mode');
                    this.currentConnection = 'offline';
                    this.connectionListeners.forEach(listener => listener(false, 'offline'));
                }
            }
        });

        // Continuous Firestore connection monitoring
        this.connectionCheckInterval = setInterval(async () => {
            try {
                if (this.auth.currentUser) {
                    const previousStatus = this.currentConnection;
                    const newStatus = await this.checkFirebaseConnection();
                    
                    if (previousStatus !== newStatus) {
                        console.log(`🔄 Firebase connection status changed: ${previousStatus} -> ${newStatus}`);
                        this.currentConnection = newStatus;
                        
                        const isConnected = newStatus === 'online';
                        this.connectionListeners.forEach(listener => listener(isConnected, newStatus));
                        
                        if (isConnected) {
                            console.log('🎯 Firebase reconnected, triggering auto-sync...');
                            await this.triggerAutoSync();
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Connection monitoring error:', error);
            }
        }, 15000) as unknown as number; // Check every 15 seconds

        // Store unsubscribe function for cleanup
        this.authUnsubscribe = authUnsubscribe;
    }

    // Stop connection monitoring
    static stopMonitoring(): void {
        if (this.connectionCheckInterval !== null) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
        
        if (this.authUnsubscribe) {
            this.authUnsubscribe();
            this.authUnsubscribe = null;
        }
        
        this.isMonitoring = false;
        console.log('🔍 Firebase connection monitoring stopped');
    }

    // Add listener for connection changes
    static addConnectionListener(listener: (isConnected: boolean, mode: 'online' | 'offline') => void): void {
        this.connectionListeners.push(listener);
        
        // Immediately notify new listener of current status
        const isConnected = this.currentConnection === 'online';
        listener(isConnected, this.currentConnection);
    }

    static removeConnectionListener(listener: (isConnected: boolean, mode: 'online' | 'offline') => void): void {
        const index = this.connectionListeners.indexOf(listener);
        if (index > -1) {
            this.connectionListeners.splice(index, 1);
        }
    }

    // Get current connection status
    static getCurrentConnection(): { isConnected: boolean; mode: 'online' | 'offline' } {
        const isConnected = this.currentConnection === 'online';
        return { isConnected, mode: this.currentConnection };
    }

    // Set sync service instance (to be called from other components)
    static setSyncService(service: any): void {
        this.syncService = service;
    }

    // Trigger automatic sync when Firebase is connected
    private static async triggerAutoSync(): Promise<void> {
        try {
            if (this.syncService && typeof this.syncService.autoSyncWhenOnline === 'function') {
                console.log('🔄 Triggering auto-sync via sync service...');
                await this.syncService.autoSyncWhenOnline();
            } else {
                console.log('ℹ️ Sync service not available, auto-sync will happen when user navigates to screens');
                // Auto-sync will happen naturally when user goes to items/pos screens
            }
        } catch (error) {
            console.error('❌ Auto-sync error:', error);
        }
    }

    // Force refresh connection status
    static async refreshConnection(): Promise<{ isConnected: boolean; mode: 'online' | 'offline' }> {
        console.log('🔄 Manually refreshing Firebase connection...');
        const previousStatus = this.currentConnection;
        const newStatus = await this.findServerIP();
        
        if (previousStatus !== newStatus) {
            this.currentConnection = newStatus;
            const isConnected = newStatus === 'online';
            this.connectionListeners.forEach(listener => listener(isConnected, newStatus));
        }
        
        return this.getCurrentConnection();
    }

    // Utility method to get base URL for API calls (now returns mode)
    static async getApiBaseUrl(): Promise<'online' | 'offline'> {
        const { isConnected, mode } = this.getCurrentConnection();
        
        if (!isConnected) {
            console.log('📱 No Firebase connection, using local storage');
            return 'offline';
        }
        
        console.log(`🔥 Using Firebase (Online Mode)`);
        return 'online';
    }

    // Check if currently connected to Firebase
    static isConnected(): boolean {
        return this.currentConnection === 'online';
    }

    // Get current connection mode
    static getCurrentServerIP(): 'online' | 'offline' {
        return this.currentConnection;
    }

    // Manual test for Firebase connection (useful for debugging)
    static async testSpecificIP(ip: string): Promise<boolean> {
        console.log(`🔍 Manual Firebase connection test...`);
        // For backward compatibility, but now we only test Firebase
        return await this.checkFirebaseConnection() === 'online';
    }

    // Get network status summary
    static getNetworkStatus(): {
        isConnected: boolean;
        mode: 'online' | 'offline';
        isMonitoring: boolean;
        listenerCount: number;
        firebaseUser: boolean;
    } {
        return {
            isConnected: this.isConnected(),
            mode: this.currentConnection,
            isMonitoring: this.isMonitoring,
            listenerCount: this.connectionListeners.length,
            firebaseUser: this.auth.currentUser !== null
        };
    }

    // Test Firebase write capability
    static async testFirebaseWrite(): Promise<boolean> {
        if (!this.isConnected()) {
            return false;
        }

        try {
            const testDocRef = doc(this.db, 'connection_test', 'write_test');
            await setDoc(testDocRef, {
                timestamp: new Date().toISOString(),
                test: true
            }, { merge: true });
            
            console.log('✅ Firebase write test successful');
            return true;
        } catch (error) {
            console.error('❌ Firebase write test failed:', error);
            return false;
        }
    }

    // Check if user is authenticated with Firebase
    static isUserAuthenticated(): boolean {
        return this.auth.currentUser !== null;
    }

    // Get Firebase authentication state
    static getAuthState(): {
        isAuthenticated: boolean;
        userId: string | null;
        email: string | null;
    } {
        const user = this.auth.currentUser;
        return {
            isAuthenticated: user !== null,
            userId: user?.uid || null,
            email: user?.email || null
        };
    }

    // Store auth unsubscribe function
    private static authUnsubscribe: (() => void) | null = null;
}

// Start monitoring when this module is loaded
NetworkScanner.monitorServerConnection().catch(error => {
    console.error('❌ Failed to start Firebase connection monitoring:', error);
});