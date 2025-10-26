// app/_layout.tsx
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import 'react-native-reanimated';

// Import with proper typing
import * as ScreenOrientation from 'expo-screen-orientation';

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    GreatVibes: require('../assets/fonts/GreatVibes-Regular.ttf'),
    LobsterTwoItalic: require('../assets/fonts/LobsterTwo-Italic.ttf'),
    LobsterTwoRegular: require('../assets/fonts/LobsterTwo-Regular.ttf'),
  });

  useEffect(() => {
    // Lock to landscape orientation
    async function setOrientation() {
      try {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE
        );
      } catch (error) {
        console.error('Failed to set orientation:', error);
      }
    }

    setOrientation();

    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}