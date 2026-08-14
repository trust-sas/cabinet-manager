/**
 * src/components/ui/CustomAlertModal.tsx
 * Composant d'Alerte Stylisé (Design 2026) avec animations, icônes réactives,
 * thème adaptatif et boutons d'actions élégants.
 */

import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';
import { AppColors as C } from '@/constants/theme';

export type AlertType = 'success' | 'danger' | 'warning' | 'info';

export interface CustomAlertOptions {
  visible: boolean;
  type?: AlertType;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export function CustomAlertModal({
  visible,
  type = 'info',
  title,
  message,
  confirmText = 'OK',
  cancelText,
  onConfirm,
  onCancel,
}: CustomAlertOptions) {
  const { colors: K, isDark } = useTheme();

  if (!visible) return null;

  const getConfig = () => {
    switch (type) {
      case 'success':
        return {
          icon: CheckCircle2,
          color: K.success,
          bg: K.successLight,
        };
      case 'danger':
        return {
          icon: XCircle,
          color: K.danger,
          bg: K.dangerLight,
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          color: K.warning,
          bg: K.warningLight,
        };
      default:
        return {
          icon: Info,
          color: K.info,
          bg: K.infoLight,
        };
    }
  };

  const config = getConfig();
  const IconComponent = config.icon;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel || onConfirm}>
      <View style={s.overlay}>
        <View style={[s.card, { backgroundColor: K.surface, borderColor: K.border }]}>
          {/* Entête avec Icône de statut */}
          <View style={s.headerRow}>
            <View style={[s.iconCircle, { backgroundColor: config.bg }]}>
              <IconComponent color={config.color} size={28} />
            </View>
            <TouchableOpacity
              onPress={onCancel || onConfirm}
              style={[s.closeBtn, { backgroundColor: K.bgTertiary }]}
            >
              <X color={K.textMuted} size={16} />
            </TouchableOpacity>
          </View>

          {/* Titre & Message */}
          <Text style={[s.title, { color: K.text }]}>{title}</Text>
          <Text style={[s.message, { color: K.textMuted }]}>{message}</Text>

          {/* Actions */}
          <View style={s.actionsRow}>
            {cancelText && (
              <TouchableOpacity
                style={[s.btn, s.btnCancel, { backgroundColor: K.bgTertiary, borderColor: K.border }]}
                onPress={onCancel}
                activeOpacity={0.8}
              >
                <Text style={[s.btnCancelText, { color: K.textSecondary }]}>{cancelText}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                s.btn,
                s.btnConfirm,
                { backgroundColor: type === 'danger' ? K.danger : K.primary },
                cancelText ? { flex: 1 } : { width: '100%' },
              ]}
              onPress={onConfirm}
              activeOpacity={0.85}
            >
              <Text style={[s.btnConfirmText, { color: type === 'danger' ? '#ffffff' : (isDark ? C.gray900 : '#ffffff') }]}>
                {confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancel: {
    flex: 1,
    borderWidth: 1,
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  btnConfirm: {
    elevation: 2,
  },
  btnConfirmText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
