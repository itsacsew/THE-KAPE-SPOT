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

  const [appIsReady, setAppIsReady] = useState(false);

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
          setAppIsReady(true);
        }
      } catch (error) {
        console.error('Initialization error:', error);
        setAppIsReady(true);
      }
    }

    initializeApp();

    // Restore bars if component unmounts
    return () => {
      NavigationBar.setVisibilityAsync('visible').catch(() => { });
      StatusBar.setHidden(false);
    };
  }, [loaded]);

  if (!loaded || !appIsReady) {
    return null;
  }

  // ALWAYS show login screen first
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