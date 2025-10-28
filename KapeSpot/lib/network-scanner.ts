// lib/network-scanner.ts

export class NetworkScanner {
    // Common local IP ranges
    private static commonRanges = [
        '192.168.1',  // Most common home network
        '192.168.0',  // Alternative home network  
        '10.0.0',     // Business networks
        '172.16.0',   // Private networks
    ];

    // Scan for working server IP
    static async findServerIP(): Promise<string> {
        console.log('🔍 Scanning for server...');
        
        // Try common specific IPs first (fast)
        const quickIPs = ['192.168.1.3', '192.168.1.7', '10.0.2.2', 'localhost'];
        
        for (const ip of quickIPs) {
            if (await this.testIP(ip)) {
                console.log(`✅ Found server at: ${ip}`);
                return ip;
            }
        }

        // If quick scan fails, do full network scan
        console.log('🔄 Quick scan failed, starting network scan...');
        const foundIP = await this.scanNetwork();
        
        if (foundIP) {
            console.log(`✅ Found server at: ${foundIP}`);
            return foundIP;
        }

        // Fallback to demo mode
        console.log('❌ No server found, using demo mode');
        return 'demo';
    }

    // Scan entire network range
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

    private static async testIP(ip: string): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            
            const response = await fetch(`http://${ip}/backend/api/test.php`, {
                method: 'GET',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            return response.ok;
        } catch (error) {
            return false;
        }
    }
}