/**
 * src/components/ui/LoadingOverlay.tsx
 * Overlay semi-transparent avec spinner et message contextuel.
 * Usage : <LoadingOverlay visible={isLoading} message="Connexion en cours..." />
 */
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Modal, StyleSheet, Text, View } from 'react-native';
import { AppColors as C } from '@/constants/theme';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export function LoadingOverlay({ visible, message }: LoadingOverlayProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={C.amber500} />
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
      </Animated.View>
    </Modal>
  );
}

/**
 * Spinner inline (sans overlay) pour les boutons ou sections.
 */
export function InlineSpinner({ size = 20, color }: { size?: number; color?: string }) {
  return <ActivityIndicator size={size} color={color ?? C.amber500} />;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 36,
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  message: {
    fontSize: 14,
    color: '#cbd5e1',
    textAlign: 'center',
    fontWeight: '500',
  },
});
