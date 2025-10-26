// app/(tabs)/_layout.tsx
import { Tabs, Redirect } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: { display: 'none' },
      }}
      initialRouteName="pos" // Set POS as initial route
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
        listeners={{
          tabPress: (e) => {
            // Prevent default navigation, redirect to POS instead
            e.preventDefault();
          },
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
          },
        }}
      />
      <Tabs.Screen
        name="restaurant"
        options={{
          title: 'Restaurant',
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
    </Tabs>
  );
}