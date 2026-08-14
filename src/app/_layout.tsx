import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { useNetworkSync } from '@/hooks/useNetworkSync';
import { AppColors as C } from '@/constants/theme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { CloudOff, RefreshCw } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { PreferencesProvider, usePreferences } from '@/context/PreferencesContext';
import { ToastProvider } from '@/components/ui/Toast';

SplashScreen.preventAutoHideAsync();

/** Bandeau Hors-ligne — affiché globalement quand le réseau est absent */
function OfflineBanner() {
  const { user } = useAuth();
  const { isOnline, queueCount, isSyncing, syncNow } = useNetworkSync(user?.cabinetId ?? 0);

  if (isOnline && queueCount === 0) return null;

  return (
    <View style={[
      styles.offlineBanner,
      isOnline ? styles.offlineBannerSyncing : styles.offlineBannerOffline,
    ]}>
      {isOnline ? (
        <>
          {isSyncing
            ? <ActivityIndicator size={14} color={C.white} />
            : <RefreshCw color={C.white} size={14} />}
          <Text style={styles.offlineText}>
            {isSyncing
              ? `Synchronisation de ${queueCount} modification(s)…`
              : `${queueCount} modification(s) en attente — `}
          </Text>
          {!isSyncing && (
            <TouchableOpacity onPress={() => syncNow()}>
              <Text style={styles.offlineSyncBtn}>Synchroniser</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <>
          <CloudOff color={C.white} size={14} />
          <Text style={styles.offlineText}>
            Mode hors-ligne{queueCount > 0 ? ` — ${queueCount} modification(s) en attente` : ''}
          </Text>
        </>
      )}
    </View>
  );
}

function AppNavigator() {
  const { isDark } = usePreferences();
  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="notifications" options={{ presentation: 'card' }} />
        <Stack.Screen name="nouveau-client" options={{ presentation: 'card' }} />
        <Stack.Screen name="nouvelle-affaire" options={{ presentation: 'card' }} />
        <Stack.Screen name="affaire/[id]" options={{ presentation: 'card' }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <PreferencesProvider>
      <AuthProvider>
        <ToastProvider>
          <AppNavigator />
        </ToastProvider>
      </AuthProvider>
    </PreferencesProvider>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingHorizontal: 16, paddingVertical: 6, zIndex: 999,
  },
  offlineBannerOffline:  { backgroundColor: C.gray700 },
  offlineBannerSyncing:  { backgroundColor: C.amber600 },
  offlineText:    { fontSize: 12, color: C.white, fontWeight: '500', flex: 1 },
  offlineSyncBtn: { fontSize: 12, color: C.white, fontWeight: '700', textDecorationLine: 'underline' },
});
