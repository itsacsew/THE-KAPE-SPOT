// app/(tabs)/index.tsx
import { Redirect } from 'expo-router';

export default function Index() {
    // Redirect to POS screen as default
    return <Redirect href="/(tabs)/pos" />;
}