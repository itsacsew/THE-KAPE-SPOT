import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function ConnectionTest() {
    const [loading, setLoading] = useState(false);
    const [testResults, setTestResults] = useState<any[]>([]);
    const [apiBaseUrl, setApiBaseUrl] = useState('');

    // Your InfinityFree domain - CHANGE THIS!
    const INFINITY_FREE_DOMAIN = 'your-site.epizy.com'; // ← PALIHUG ILISI NI!

    useEffect(() => {
        setApiBaseUrl(`https://${INFINITY_FREE_DOMAIN}/backend/api`);
    }, []);

    const addTestResult = (testName: string, success: boolean, message: string, data?: any) => {
        setTestResults(prev => [...prev, {
            testName,
            success,
            message,
            data,
            timestamp: new Date().toLocaleTimeString()
        }]);
    };

    const testBackendConnection = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${apiBaseUrl}/test.php`);
            const result = await response.json();

            addTestResult(
                'Backend Connection',
                response.ok,
                response.ok ? 'Backend is running!' : 'Backend connection failed',
                result
            );

            return response.ok;
        } catch (error) {
            addTestResult('Backend Connection', false, `Error: ${error}`);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const testDatabaseConnection = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${apiBaseUrl}/items.php`);
            const result = await response.json();

            addTestResult(
                'Database Connection',
                response.ok,
                response.ok ? 'Database connected successfully!' : 'Database connection failed',
                { itemsCount: Array.isArray(result) ? result.length : 'N/A' }
            );

            return response.ok;
        } catch (error) {
            addTestResult('Database Connection', false, `Error: ${error}`);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const testCategoriesConnection = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${apiBaseUrl}/categories.php`);
            const result = await response.json();

            addTestResult(
                'Categories API',
                response.ok,
                response.ok ? 'Categories loaded successfully!' : 'Categories API failed',
                { categoriesCount: Array.isArray(result) ? result.length : 'N/A' }
            );

            return response.ok;
        } catch (error) {
            addTestResult('Categories API', false, `Error: ${error}`);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const testFileUpload = async () => {
        setLoading(true);
        try {
            // Test if upload endpoint is accessible
            const response = await fetch(`${apiBaseUrl}/upload-image.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ test: true })
            });

            const result = await response.text();

            addTestResult(
                'Upload Endpoint',
                true,
                'Upload endpoint is accessible',
                { response: result.substring(0, 100) }
            );

            return true;
        } catch (error) {
            addTestResult('Upload Endpoint', false, `Error: ${error}`);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const runAllTests = async () => {
        setTestResults([]);

        await testBackendConnection();
        await testDatabaseConnection();
        await testCategoriesConnection();
        await testFileUpload();

        Alert.alert('Tests Complete', 'Check the results below');
    };

    return (
        <ThemedView style={{ flex: 1, padding: 16 }}>
            <ThemedText style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>
                🧪 Connection Tests
            </ThemedText>

            <ThemedText style={{ marginBottom: 8 }}>
                API Base URL: {apiBaseUrl}
            </ThemedText>

            <TouchableOpacity
                style={{
                    backgroundColor: '#874E3B',
                    padding: 16,
                    borderRadius: 8,
                    marginBottom: 16
                }}
                onPress={runAllTests}
                disabled={loading}
            >
                <ThemedText style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
                    {loading ? 'Testing...' : '🚀 Run All Tests'}
                </ThemedText>
            </TouchableOpacity>

            <ScrollView style={{ flex: 1 }}>
                {testResults.map((result, index) => (
                    <ThemedView
                        key={index}
                        style={{
                            padding: 12,
                            marginBottom: 8,
                            borderRadius: 8,
                            backgroundColor: result.success ? '#DCFCE7' : '#FEE2E2',
                            borderColor: result.success ? '#16A34A' : '#DC2626',
                            borderWidth: 1
                        }}
                    >
                        <ThemedText style={{ fontWeight: 'bold', marginBottom: 4 }}>
                            {result.success ? '✅' : '❌'} {result.testName}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 12, marginBottom: 4 }}>
                            {result.message}
                        </ThemedText>
                        <ThemedText style={{ fontSize: 10, color: '#666' }}>
                            Time: {result.timestamp}
                        </ThemedText>
                        {result.data && (
                            <ThemedText style={{ fontSize: 10, marginTop: 4 }}>
                                Data: {JSON.stringify(result.data)}
                            </ThemedText>
                        )}
                    </ThemedView>
                ))}
            </ScrollView>
        </ThemedView>
    );
}