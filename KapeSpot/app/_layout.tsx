// app/_layout.tsx
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import 'react-native-reanimated';

// Import with proper typing
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    GreatVibes: require('../assets/fonts/GreatVibes-Regular.ttf'),
    LobsterTwoItalic: require('../assets/fonts/LobsterTwo-Italic.ttf'),
    LobsterTwoRegular: require('../assets/fonts/LobsterTwo-Regular.ttf'),
  });

  useEffect(() => {
    async function initializeApp() {
      try {
        // Lock to landscape orientation
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE
        );

        // Hide Android navigation bar
        (NavigationBar as any).setVisibilityAsync('hidden');
        // Optional: make background transparent
        // await NavigationBar.setBackgroundColorAsync('transparent');

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

  if (!loaded) {
    return null;
  }

  return (
    <>
      <StatusBar hidden={true} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}
