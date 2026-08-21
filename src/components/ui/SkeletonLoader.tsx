/**
 * src/components/ui/SkeletonLoader.tsx
 * Effet shimmer pour les listes et cartes en cours de chargement.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) {
  const { isDark } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] });
  const baseColor = isDark ? '#334155' : '#e2e8f0';

  return (
    <Animated.View
      style={[{ width: width as any, height, borderRadius, backgroundColor: baseColor, opacity }, style]}
    />
  );
}

/** Carte de dossier/affaire en squelette */
export function SkeletonCard() {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardRow}>
        <Skeleton width={40} height={40} borderRadius={10} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="45%" height={11} />
        </View>
        <Skeleton width={60} height={22} borderRadius={11} />
      </View>
      <Skeleton width="90%" height={11} style={{ marginTop: 10 }} />
      <Skeleton width="60%" height={11} style={{ marginTop: 6 }} />
    </View>
  );
}

/** Liste de squelettes */
export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <View style={{ gap: 10, padding: 16 }}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </View>
  );
}

/** Squelette de ligne simple */
export function SkeletonRow() {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Skeleton width={44} height={44} borderRadius={22} />
      <View style={{ flex: 1, gap: 5 }}>
        <Skeleton width="60%" height={13} />
        <Skeleton width="40%" height={11} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14, padding: 14, borderWidth: 1,
  },
  cardRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1,
  },
});
