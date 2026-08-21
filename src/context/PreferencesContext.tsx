/**
 * src/context/PreferencesContext.tsx
 * Gestion globale du thème et des préférences de notifications.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppThemeMode = 'dark' | 'light' | 'system';

export interface NotificationSettings {
  pushEnabled: boolean;
  soundEnabled: boolean;
  audienceRemindersEnabled: boolean;
}

interface PreferencesContextValue {
  themeMode: AppThemeMode;
  setThemeMode: (mode: AppThemeMode) => Promise<void>;
  notifications: NotificationSettings;
  toggleNotificationSetting: (key: keyof NotificationSettings) => Promise<void>;
  isDark: boolean;
}

const PREF_THEME_KEY = '@cabinet_manager_theme_mode';
const PREF_NOTIF_KEY = '@cabinet_manager_notif_settings';

const defaultNotifs: NotificationSettings = {
  pushEnabled: true,
  soundEnabled: true,
  audienceRemindersEnabled: true,
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<AppThemeMode>('dark');
  const [notifications, setNotifications] = useState<NotificationSettings>(defaultNotifs);

  useEffect(() => {
    async function loadPreferences() {
      try {
        const savedTheme = await AsyncStorage.getItem(PREF_THEME_KEY);
        if (savedTheme === 'dark' || savedTheme === 'light' || savedTheme === 'system') {
          setThemeModeState(savedTheme);
        }

        const savedNotifs = await AsyncStorage.getItem(PREF_NOTIF_KEY);
        if (savedNotifs) {
          setNotifications(JSON.parse(savedNotifs));
        }
      } catch (err) {
        console.warn('Erreur chargement des préférences:', err);
      }
    }
    loadPreferences();
  }, []);

  const setThemeMode = async (mode: AppThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(PREF_THEME_KEY, mode);
    } catch (err) {
      console.warn('Erreur sauvegarde thème:', err);
    }
  };

  const toggleNotificationSetting = async (key: keyof NotificationSettings) => {
    const updated = { ...notifications, [key]: !notifications[key] };
    setNotifications(updated);
    try {
      await AsyncStorage.setItem(PREF_NOTIF_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn('Erreur sauvegarde notifications:', err);
    }
  };

  const isDark = themeMode === 'system' ? systemColorScheme === 'dark' : themeMode === 'dark';

  return (
    <PreferencesContext.Provider
      value={{
        themeMode,
        setThemeMode,
        notifications,
        toggleNotificationSetting,
        isDark,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences doit être utilisé au sein de <PreferencesProvider>');
  }
  return ctx;
}
