// app/_layout.tsx
import { useFonts } from 'expo-font';
import { Stack, Redirect } from 'expo-router';
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import 'react-native-reanimated';
import { NetworkScanner } from '@/lib/network-scanner';

// Import with proper typing
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { OfflineSyncService } from '@/lib/offline-sync';

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    GreatVibes: require('../assets/fonts/GreatVibes-Regular.ttf'),
    LobsterTwoItalic: require('../assets/fonts/LobsterTwo-Italic.ttf'),
    LobsterTwoRegular: require('../assets/fonts/LobsterTwo-Regular.ttf'),
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if user is already logged in
    const checkAuthStatus = async () => {
      try {
        const syncService = OfflineSyncService.getInstance();
        const currentUser = await syncService.getItem('currentUser');
        setIsAuthenticated(!!currentUser);
      } catch (error) {
        setIsAuthenticated(false);
      }
    };

    checkAuthStatus();
  }, []);

  useEffect(() => {
    // Initialize network monitoring
    console.log('🚀 Starting network connection monitoring...');
  }, []);

  useEffect(() => {
    async function initializeApp() {
      try {
        // Lock to landscape orientation
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE
        );

        // Hide Android navigation bar
        (NavigationBar as any).setVisibilityAsync('hidden');

        // Hide status bar (top)
        StatusBar.setHidden(true);

        if (loaded) {
          await SplashScreen.hideAsync();
        }
      } catch (error) {
        console.error('Initialization error:', error);
      }
    }

    initializeApp();

    // Restore bars if component unmounts
    return () => {
      NavigationBar.setVisibilityAsync('visible').catch(() => { });
      StatusBar.setHidden(false);
    };
  }, [loaded]);

  if (!loaded || isAuthenticated === null) {
    return null;
  }

  // Redirect to login if not authenticated, otherwise show tabs
  if (!isAuthenticated) {
    return (
      <>
        <StatusBar hidden={true} />
        <Stack>
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
      </>
    );
  }

  return (
    <>
      <StatusBar hidden={true} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}