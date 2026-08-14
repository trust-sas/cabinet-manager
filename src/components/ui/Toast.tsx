/**
 * src/components/ui/Toast.tsx
 * Notification légère slide-in depuis le haut.
 * Usage : importer ToastProvider dans _layout.tsx, puis appeler showToast() depuis n'importe quel écran.
 */
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  Animated, StyleSheet, Text, TouchableOpacity, View, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react-native';
import { AppColors as C } from '@/constants/theme';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastMessage {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

let _toastIdCounter = 0;

const TOAST_DURATION = 3500;

const CONFIG: Record<ToastType, { bg: string; icon: React.ReactNode; border: string }> = {
  success: { bg: '#052e16', border: '#16a34a', icon: <CheckCircle2 color="#22c55e" size={20} /> },
  error:   { bg: '#450a0a', border: '#dc2626', icon: <XCircle color="#ef4444" size={20} /> },
  info:    { bg: '#0c1a3d', border: '#2563eb', icon: <Info color="#3b82f6" size={20} /> },
  warning: { bg: '#431407', border: '#ea580c', icon: <AlertTriangle color="#f97316" size={20} /> },
};

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const config = CONFIG[toast.type];

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => dismiss(), TOAST_DURATION);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -120, duration: 250, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onDismiss(toast.id));
  };

  return (
    <Animated.View
      style={[
        styles.toastCard,
        { backgroundColor: config.bg, borderLeftColor: config.border },
        { transform: [{ translateY }], opacity },
      ]}
    >
      <View style={styles.toastIconWrap}>{config.icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.toastTitle}>{toast.title}</Text>
        {toast.message ? <Text style={styles.toastMsg}>{toast.message}</Text> : null}
      </View>
      <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <X color={C.gray400} size={16} />
      </TouchableOpacity>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++_toastIdCounter;
    setToasts(prev => [...prev, { id, type, title, message }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <SafeAreaView
        edges={['top']}
        style={styles.container}
        pointerEvents="box-none"
      >
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </SafeAreaView>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999,
    paddingHorizontal: 16, gap: 8, pointerEvents: 'box-none',
  },
  toastCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 14, borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
    marginTop: Platform.OS === 'android' ? 8 : 0,
  },
  toastIconWrap: { flexShrink: 0 },
  toastTitle: { fontSize: 13, fontWeight: '700', color: '#f8fafc' },
  toastMsg:   { fontSize: 12, color: '#94a3b8', marginTop: 2 },
});
