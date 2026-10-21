import { Stack } from "expo-router";
import { ShareIntentProvider } from "expo-share-intent";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/lib/auth";
import { SyncProvider } from "@/lib/sync";
import { useTheme } from "@/lib/theme";

export default function RootLayout() {
  const theme = useTheme();
  return (
    // ShareIntentProvider must sit above everything else (library requirement).
    <ShareIntentProvider options={{ resetOnBackground: true }}>
      <SafeAreaProvider>
        <AuthProvider>
          <SyncProvider>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.paper } }}>
              <Stack.Screen name="capture" options={{ presentation: "modal" }} />
            </Stack>
          </SyncProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </ShareIntentProvider>
  );
}
