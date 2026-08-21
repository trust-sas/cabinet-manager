/**
 * src/hooks/useTheme.ts
 * Hook centralisé de thème — retourne les bonnes couleurs selon isDark.
 * Utilise PreferencesContext pour réagir en temps réel au changement de thème.
 */
import { usePreferences } from '@/context/PreferencesContext';

export interface ThemeColors {
  // Fond principal
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  // Surface / Cartes
  surface: string;
  surfaceElevated: string;
  // Texte
  text: string;
  textSecondary: string;
  textMuted: string;
  // Bordures
  border: string;
  borderLight: string;
  // Champs de saisie
  inputBg: string;
  inputBorder: string;
  inputText: string;
  inputPlaceholder: string;
  // Couleur primaire (amber)
  primary: string;
  primaryLight: string;
  primaryText: string;
  // Statuts
  danger: string;
  dangerLight: string;
  success: string;
  successLight: string;
  info: string;
  infoLight: string;
  warning: string;
  warningLight: string;
}

const DARK: ThemeColors = {
  bg:               '#0f172a',
  bgSecondary:      '#1e293b',
  bgTertiary:       '#334155',
  surface:          '#1e293b',
  surfaceElevated:  '#334155',
  text:             '#f8fafc',
  textSecondary:    '#cbd5e1',
  textMuted:        '#64748b',
  border:           '#334155',
  borderLight:      '#1e293b',
  inputBg:          '#1e293b',
  inputBorder:      '#334155',
  inputText:        '#f8fafc',
  inputPlaceholder: '#475569',
  primary:          '#f59e0b',
  primaryLight:     'rgba(245,158,11,0.15)',
  primaryText:      '#0f172a',
  danger:           '#ef4444',
  dangerLight:      'rgba(239,68,68,0.15)',
  success:          '#22c55e',
  successLight:     'rgba(34,197,94,0.15)',
  info:             '#3b82f6',
  infoLight:        'rgba(59,130,246,0.15)',
  warning:          '#f97316',
  warningLight:     'rgba(249,115,22,0.15)',
};

const LIGHT: ThemeColors = {
  bg:               '#f8fafc',
  bgSecondary:      '#f1f5f9',
  bgTertiary:       '#e2e8f0',
  surface:          '#ffffff',
  surfaceElevated:  '#ffffff',
  text:             '#0f172a',
  textSecondary:    '#475569',
  textMuted:        '#94a3b8',
  border:           '#e2e8f0',
  borderLight:      '#f1f5f9',
  inputBg:          '#ffffff',
  inputBorder:      '#e2e8f0',
  inputText:        '#0f172a',
  inputPlaceholder: '#94a3b8',
  primary:          '#d97706',
  primaryLight:     'rgba(217,119,6,0.1)',
  primaryText:      '#ffffff',
  danger:           '#dc2626',
  dangerLight:      'rgba(220,38,38,0.08)',
  success:          '#16a34a',
  successLight:     'rgba(22,163,74,0.08)',
  info:             '#2563eb',
  infoLight:        'rgba(37,99,235,0.08)',
  warning:          '#ea580c',
  warningLight:     'rgba(234,88,12,0.08)',
};

export function useTheme(): { colors: ThemeColors; isDark: boolean } {
  const { isDark } = usePreferences();
  return { colors: isDark ? DARK : LIGHT, isDark };
}
