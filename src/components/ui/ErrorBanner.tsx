/**
 * src/components/ui/ErrorBanner.tsx
 * Bandeau d'erreur inline animé pour les formulaires.
 * S'affiche/se cache en douceur selon la prop `message`.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { AlertCircle, XCircle } from 'lucide-react-native';

interface ErrorBannerProps {
  message: string;
  /** Variante visuelle. Par défaut : 'error' */
  type?: 'error' | 'warning' | 'info';
}

const CONFIG = {
  error:   { bg: 'rgba(239,68,68,0.12)',  border: '#ef4444', text: '#fca5a5', icon: XCircle },
  warning: { bg: 'rgba(249,115,22,0.12)', border: '#f97316', text: '#fdba74', icon: AlertCircle },
  info:    { bg: 'rgba(59,130,246,0.12)', border: '#3b82f6', text: '#93c5fd', icon: AlertCircle },
};

export function ErrorBanner({ message, type = 'error' }: ErrorBannerProps) {
  const opacity   = useRef(new Animated.Value(0)).current;
  const maxHeight = useRef(new Animated.Value(0)).current;

  const config = CONFIG[type];
  const IconComponent = config.icon;

  useEffect(() => {
    if (message) {
      Animated.parallel([
        Animated.timing(opacity,   { toValue: 1,  duration: 220, useNativeDriver: false }),
        Animated.timing(maxHeight, { toValue: 80, duration: 220, useNativeDriver: false }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity,   { toValue: 0, duration: 160, useNativeDriver: false }),
        Animated.timing(maxHeight, { toValue: 0, duration: 160, useNativeDriver: false }),
      ]).start();
    }
  }, [message]);

  if (!message) return null;

  return (
    <Animated.View style={[styles.wrap, { opacity, maxHeight, borderColor: config.border, backgroundColor: config.bg }]}>
      <IconComponent color={config.text} size={16} />
      <Text style={[styles.text, { color: config.text }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1,
    overflow: 'hidden',
  },
  text: { flex: 1, fontSize: 13, lineHeight: 18 },
});
