// lib/network-scanner.ts

export class NetworkScanner {
    // Common local IP ranges
    private static commonRanges = [
        '192.168.1',  // Most common home network
        '192.168.0',  // Alternative home network  
        '10.0.0',     // Business networks
        '172.16.0',   // Private networks
    ];

    private static currentServerIP: string = 'local';
    private static connectionListeners: ((isConnected: boolean, ip: string) => void)[] = [];
    private static isMonitoring: boolean = false;
    private static syncService: any = null;

    // Scan for working server IP
    static async findServerIP(): Promise<string> {
        console.log('🔍 Scanning network for server...');
        
        // Direct network scan only - no hardcoded IPs
        const foundIP = await this.scanNetwork();
        
        if (foundIP) {
            console.log(`✅ Found server at: ${foundIP}`);
            return foundIP;
        }

        // No server found, use local storage
        console.log('❌ No server found, using local storage only');
        return 'local';
    }

    // Add connection monitoring
    static async monitorServerConnection(): Promise<void> {
        if (this.isMonitoring) {
            console.log('🔍 Server monitoring already running...');
            return;
        }

        this.isMonitoring = true;
        console.log('🔍 Starting server connection monitoring...');
        
        // Initial scan
        const initialIP = await this.findServerIP();
        const previousIP = this.currentServerIP;
        this.currentServerIP = initialIP;
        
        if (previousIP !== initialIP) {
            const isConnected = initialIP !== 'local' && initialIP !== 'demo';
            this.connectionListeners.forEach(listener => listener(isConnected, initialIP));
            
            if (isConnected) {
                console.log('🎯 Initial server connection detected, triggering auto-sync...');
                await this.triggerAutoSync();
            }
        }

        // Continuous monitoring
        setInterval(async () => {
            try {
                const previousIP = this.currentServerIP;
                const newIP = await this.findServerIP();
                
                if (previousIP !== newIP) {
                    console.log(`🔄 Server connection changed: ${previousIP} -> ${newIP}`);
                    this.currentServerIP = newIP;
                    
                    // Notify all listeners
                    const isConnected = newIP !== 'local' && newIP !== 'demo';
                    this.connectionListeners.forEach(listener => listener(isConnected, newIP));
                    
                    if (isConnected) {
                        console.log('🎯 Server connected, triggering auto-sync...');
                        // Trigger auto-sync when server is found
                        await this.triggerAutoSync();
                    }
                }
            } catch (error) {
                console.error('❌ Connection monitoring error:', error);
            }
        }, 10000); // Check every 10 seconds
    }

    // Add listener for connection changes
    static addConnectionListener(listener: (isConnected: boolean, ip: string) => void): void {
        this.connectionListeners.push(listener);
        
        // Immediately notify new listener of current status
        const isConnected = this.currentServerIP !== 'local' && this.currentServerIP !== 'demo';
        listener(isConnected, this.currentServerIP);
    }

    static removeConnectionListener(listener: (isConnected: boolean, ip: string) => void): void {
        const index = this.connectionListeners.indexOf(listener);
        if (index > -1) {
            this.connectionListeners.splice(index, 1);
        }
    }

    // Get current connection status
    static getCurrentConnection(): { isConnected: boolean; serverIP: string } {
        const isConnected = this.currentServerIP !== 'local' && this.currentServerIP !== 'demo';
        return { isConnected, serverIP: this.currentServerIP };
    }

    // Set sync service instance (to be called from other components)
    static setSyncService(service: any): void {
        this.syncService = service;
    }

    // Trigger automatic sync when server is found
    private static async triggerAutoSync(): Promise<void> {
        try {
            if (this.syncService && typeof this.syncService.autoSyncWhenOnline === 'function') {
                console.log('🔄 Triggering auto-sync via sync service...');
                await this.syncService.autoSyncWhenOnline();
            } else {
                console.log('ℹ️  Sync service not available, auto-sync will happen when user navigates to screens');
                // Auto-sync will happen naturally when user goes to items/pos screens
            }
        } catch (error) {
            console.error('❌ Auto-sync error:', error);
        }
    }

    // Force refresh connection status
    static async refreshConnection(): Promise<{ isConnected: boolean; serverIP: string }> {
        console.log('🔄 Manually refreshing connection...');
        const previousIP = this.currentServerIP;
        const newIP = await this.findServerIP();
        
        if (previousIP !== newIP) {
            this.currentServerIP = newIP;
            const isConnected = newIP !== 'local' && newIP !== 'demo';
            this.connectionListeners.forEach(listener => listener(isConnected, newIP));
        }
        
        return this.getCurrentConnection();
    }

    // Network scanning methods
    private static async scanNetwork(): Promise<string | null> {
        const promises = [];

        // Generate IPs to scan (1-20 for common devices)
        for (const range of this.commonRanges) {
            for (let i = 1; i <= 20; i++) {
                const ip = `${range}.${i}`;
                promises.push(this.testIPWithTimeout(ip));
            }
        }

        const results = await Promise.all(promises);
        return results.find(ip => ip !== null) || null;
    }

    private static async testIPWithTimeout(ip: string): Promise<string | null> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);
            
            const response = await fetch(`http://${ip}/backend/api/test.php`, {
                method: 'GET',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                return ip;
            }
        } catch (error) {
            // Ignore errors, just try next IP
        }
        return null;
    }

    // Test a specific IP (for manual testing)
    private static async testIP(ip: string): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(`http://${ip}/backend/api/test.php`, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                }
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.text();
                console.log(`✅ Server ${ip} responded:`, data);
                return true;
            }
            return false;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            console.log(`❌ Server ${ip} not reachable:`, errorMessage);
            return false;
        }
    }

    // Utility method to get base URL for API calls
    static async getApiBaseUrl(): Promise<string> {
        const { isConnected, serverIP } = this.getCurrentConnection();
        
        if (!isConnected) {
            console.log('📱 No server connection, using local storage');
            return 'local';
        }
        
        const baseUrl = `http://${serverIP}/backend/api`;
        console.log(`🌐 Using server API: ${baseUrl}`);
        return baseUrl;
    }

    // Check if currently connected
    static isConnected(): boolean {
        return this.currentServerIP !== 'local' && this.currentServerIP !== 'demo';
    }

    // Get current server IP
    static getCurrentServerIP(): string {
        return this.currentServerIP;
    }

    // Manual test for specific IP (useful for debugging)
    static async testSpecificIP(ip: string): Promise<boolean> {
        console.log(`🔍 Manually testing IP: ${ip}`);
        return await this.testIP(ip);
    }

    // Get network status summary
    static getNetworkStatus(): {
        isConnected: boolean;
        serverIP: string;
        isMonitoring: boolean;
        listenerCount: number;
    } {
        return {
            isConnected: this.isConnected(),
            serverIP: this.currentServerIP,
            isMonitoring: this.isMonitoring,
            listenerCount: this.connectionListeners.length
        };
    }
}

// Start monitoring when this module is loaded
NetworkScanner.monitorServerConnection().catch(error => {
    console.error('❌ Failed to start network monitoring:', error);
});