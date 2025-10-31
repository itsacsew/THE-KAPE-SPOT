// app/(tabs)/_layout.tsx
import { Tabs, Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { OfflineSyncService } from '@/lib/offline-sync';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const syncService = OfflineSyncService.getInstance();
        const currentUser = await syncService.getItem('currentUser');
        setIsAuthenticated(!!currentUser);
      } catch (error) {
        console.log('Tab auth check error:', error);
        setIsAuthenticated(false);
      }
    };

    checkAuth();
  }, []);

  // Show loading state
  if (isAuthenticated === null) {
    return null;
  }

  // Redirect to login if not authenticated
  if (isAuthenticated === false) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: { display: 'none' },
      }}
      initialRouteName="pos"
    >
      <Tabs.Screen
        name="login"
        options={{
          title: 'Home',
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
          },
        }}
      />
      <Tabs.Screen
        name="pos"
        options={{
          title: 'POS',
        }}
      />
      <Tabs.Screen
        name="items"
        options={{
          title: 'Items',
        }}
      />
      <Tabs.Screen
        name="sales-expense"
        options={{
          title: 'Sales & Expense',
        }}
      />
    </Tabs>
  );
}