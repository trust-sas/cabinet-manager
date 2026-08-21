import { Tabs } from 'expo-router';
import { LayoutDashboard, Briefcase, Users, Calendar, FolderOpen } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { View, StyleSheet, Platform } from 'react-native';
import { AppColors as C } from '@/constants/theme';

function TabIcon({ icon: Icon, color, focused }: { icon: any; color: string; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Icon color={color} size={22} />
    </View>
  );
}

export default function TabsLayout() {
  const { colors, isDark } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 6,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: C.amber500,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarLabel: 'Accueil',
          tabBarIcon: ({ color, focused }) =>
            <TabIcon icon={LayoutDashboard} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="affaires"
        options={{
          title: 'Affaires',
          tabBarLabel: 'Affaires',
          tabBarIcon: ({ color, focused }) =>
            <TabIcon icon={Briefcase} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarLabel: 'Clients',
          tabBarIcon: ({ color, focused }) =>
            <TabIcon icon={Users} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: 'Documents',
          tabBarLabel: 'Docs',
          tabBarIcon: ({ color, focused }) =>
            <TabIcon icon={FolderOpen} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="audiences"
        options={{
          title: 'Calendrier',
          tabBarLabel: 'Agenda',
          tabBarIcon: ({ color, focused }) =>
            <TabIcon icon={Calendar} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen name="facturation"  options={{ href: null, title: 'Facturation' }} />
      <Tabs.Screen name="assistant-ia" options={{ href: null, title: 'IA', tabBarStyle: { display: 'none' } }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 40, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
});
