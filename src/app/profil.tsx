/**
 * src/app/profil.tsx
 * Écran Profil Utilisateur — Design 2026 avec thème adaptatif.
 * Affiche le numéro de téléphone, permet le changement de mot de passe
 * et propose le sélecteur de thème (Sombre / Clair / Système).
 */

import { useTheme } from '@/hooks/useTheme';
import { usePreferences, AppThemeMode } from '@/context/PreferencesContext';
import { useAuth } from '@/hooks/useAuth';
import { changePassword } from '@/services/users.service';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Lock, LogOut,
  Mail, Moon, Monitor, Phone, Shield, Sun, User,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useToast } from '@/components/ui/Toast';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

const THEME_OPTIONS: { mode: AppThemeMode; label: string; icon: any }[] = [
  { mode: 'dark',   label: 'Sombre',  icon: Moon },
  { mode: 'light',  label: 'Clair',   icon: Sun },
  { mode: 'system', label: 'Système', icon: Monitor },
];

export default function ProfilScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { colors, isDark } = useTheme();
  const { themeMode, setThemeMode } = usePreferences();
  const { showToast } = useToast();

  const [ancienMdp,   setAncienMdp]   = useState('');
  const [nouveauMdp,  setNouveauMdp]  = useState('');
  const [confirmMdp,  setConfirmMdp]  = useState('');
  const [showAncien,  setShowAncien]  = useState(false);
  const [showNouveau, setShowNouveau] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pwdError, setPwdError] = useState('');

  const initials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const handleChangePassword = async () => {
    setPwdError('');
    if (!ancienMdp || !nouveauMdp || !confirmMdp) {
      setPwdError('Veuillez remplir tous les champs.');
      return;
    }
    if (nouveauMdp.length < 6) {
      setPwdError('Le nouveau mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (nouveauMdp !== confirmMdp) {
      setPwdError('Le nouveau mot de passe et sa confirmation ne correspondent pas.');
      return;
    }
    setIsSubmitting(true);
    try {
      await changePassword({ ancienMotDePasse: ancienMdp, nouveauMotDePasse: nouveauMdp });
      setAncienMdp(''); setNouveauMdp(''); setConfirmMdp('');
      showToast('success', 'Mot de passe mis à jour', 'Votre mot de passe a été modifié avec succès.');
    } catch (e: any) {
      setPwdError(e?.message ?? 'Impossible de modifier le mot de passe.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Déconnexion', 'Êtes-vous sûr de vouloir vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Se déconnecter',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  const C = colors;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.surface }}>
        <View style={[s.header, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.8}>
            <ArrowLeft color={C.textMuted} size={20} />
            <Text style={[s.backText, { color: C.textMuted }]}>Retour</Text>
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: C.text }]}>Profil & Sécurité</Text>
          <View style={{ width: 60 }} />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 20 : 0}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Avatar & Infos */}
          <View style={[s.profileCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={s.avatarWrap}>
              <Text style={s.avatarText}>{initials(user?.nom || 'Avocat')}</Text>
            </View>
            <Text style={[s.userName, { color: C.text }]}>{user?.nom || 'Maître Avocat'}</Text>
            <Text style={[s.userSub, { color: C.textMuted }]}>
              {(user as any)?.telephone || user?.email || 'Non renseigné'}
            </Text>
            <View style={[s.roleBadge, { backgroundColor: C.primaryLight }]}>
              <Shield color={C.primary} size={13} />
              <Text style={[s.roleBadgeText, { color: C.primary }]}>{user?.role || 'Administrateur'}</Text>
            </View>
          </View>

          {/* Informations Compte */}
          <View style={[s.sectionCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[s.sectionTitle, { color: C.text }]}>Informations du Compte</Text>

            <View style={s.infoRow}>
              <View style={[s.infoIcon, { backgroundColor: C.primaryLight }]}>
                <User color={C.primary} size={16} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.infoLabel, { color: C.textMuted }]}>Nom complet</Text>
                <Text style={[s.infoVal, { color: C.text }]}>{user?.nom || 'Non renseigné'}</Text>
              </View>
            </View>

            <View style={[s.divider, { backgroundColor: C.border }]} />

            <View style={s.infoRow}>
              <View style={[s.infoIcon, { backgroundColor: C.primaryLight }]}>
                <Phone color={C.primary} size={16} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.infoLabel, { color: C.textMuted }]}>Numéro de téléphone</Text>
                <Text style={[s.infoVal, { color: C.text }]}>
                  {(user as any)?.telephone || 'Non renseigné'}
                </Text>
              </View>
            </View>

            {user?.email ? (
              <>
                <View style={[s.divider, { backgroundColor: C.border }]} />
                <View style={s.infoRow}>
                  <View style={[s.infoIcon, { backgroundColor: C.primaryLight }]}>
                    <Mail color={C.primary} size={16} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.infoLabel, { color: C.textMuted }]}>Email (optionnel)</Text>
                    <Text style={[s.infoVal, { color: C.text }]}>{user.email}</Text>
                  </View>
                </View>
              </>
            ) : null}

            <View style={[s.divider, { backgroundColor: C.border }]} />
            <View style={s.infoRow}>
              <View style={[s.infoIcon, { backgroundColor: C.primaryLight }]}>
                <Shield color={C.primary} size={16} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.infoLabel, { color: C.textMuted }]}>Authentification 2FA</Text>
                <Text style={[s.infoVal, { color: user?.authentif2faActif ? C.success : C.textMuted }]}>
                  {user?.authentif2faActif ? '✅ Activée' : 'Désactivée (recommandée)'}
                </Text>
              </View>
            </View>
          </View>

          {/* Sélecteur de thème */}
          <View style={[s.sectionCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[s.sectionTitle, { color: C.text }]}>Apparence</Text>
            <View style={s.themeRow}>
              {THEME_OPTIONS.map(({ mode, label, icon: Icon }) => {
                const active = themeMode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      s.themeOption,
                      {
                        backgroundColor: active ? C.primaryLight : C.bgSecondary,
                        borderColor: active ? C.primary : C.border,
                      },
                    ]}
                    onPress={() => setThemeMode(mode)}
                    activeOpacity={0.8}
                  >
                    <Icon color={active ? C.primary : C.textMuted} size={20} />
                    <Text style={[s.themeLabel, { color: active ? C.primary : C.textMuted }]}>
                      {label}
                    </Text>
                    {active && (
                      <View style={[s.themeCheck, { backgroundColor: C.primary }]}>
                        <CheckCircle2 color={isDark ? '#0f172a' : '#fff'} size={12} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Changement de Mot de Passe */}
          <View style={[s.sectionCard, { backgroundColor: C.surface, borderColor: C.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <KeyRound color={C.primary} size={20} />
              <Text style={[s.sectionTitle, { color: C.text }]}>Changer le mot de passe</Text>
            </View>

            {/* Mot de passe actuel */}
            <View style={s.field}>
              <Text style={[s.fieldLabel, { color: C.textSecondary }]}>Mot de passe actuel *</Text>
              <View style={[s.passWrap, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                <Lock color={C.textMuted} size={16} />
                <TextInput
                  style={[s.passInput, { color: C.inputText }]}
                  value={ancienMdp}
                  onChangeText={t => { setAncienMdp(t); if (pwdError) setPwdError(''); }}
                  placeholder="••••••••"
                  placeholderTextColor={C.inputPlaceholder}
                  secureTextEntry={!showAncien}
                />
                <TouchableOpacity onPress={() => setShowAncien(!showAncien)} style={{ paddingHorizontal: 8 }}>
                  {showAncien ? <EyeOff color={C.textMuted} size={18} /> : <Eye color={C.textMuted} size={18} />}
                </TouchableOpacity>
              </View>
            </View>

            {/* Nouveau mot de passe */}
            <View style={s.field}>
              <Text style={[s.fieldLabel, { color: C.textSecondary }]}>Nouveau mot de passe *</Text>
              <View style={[s.passWrap, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                <Lock color={C.textMuted} size={16} />
                <TextInput
                  style={[s.passInput, { color: C.inputText }]}
                  value={nouveauMdp}
                  onChangeText={t => { setNouveauMdp(t); if (pwdError) setPwdError(''); }}
                  placeholder="6 caractères minimum"
                  placeholderTextColor={C.inputPlaceholder}
                  secureTextEntry={!showNouveau}
                />
                <TouchableOpacity onPress={() => setShowNouveau(!showNouveau)} style={{ paddingHorizontal: 8 }}>
                  {showNouveau ? <EyeOff color={C.textMuted} size={18} /> : <Eye color={C.textMuted} size={18} />}
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirmer */}
            <View style={s.field}>
              <Text style={[s.fieldLabel, { color: C.textSecondary }]}>Confirmer le nouveau mot de passe *</Text>
              <View style={[s.passWrap, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                <Lock color={C.textMuted} size={16} />
                <TextInput
                  style={[s.passInput, { color: C.inputText }]}
                  value={confirmMdp}
                  onChangeText={t => { setConfirmMdp(t); if (pwdError) setPwdError(''); }}
                  placeholder="••••••••"
                  placeholderTextColor={C.inputPlaceholder}
                  secureTextEntry={!showNouveau}
                />
              </View>
            </View>

            <ErrorBanner message={pwdError} />

            <TouchableOpacity
              style={[s.saveBtn, isSubmitting && { opacity: 0.6 }]}
              onPress={handleChangePassword}
              disabled={isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator color={isDark ? '#0f172a' : '#fff'} />
              ) : (
                <>
                  <CheckCircle2 color={isDark ? '#0f172a' : '#fff'} size={18} />
                  <Text style={[s.saveBtnText, { color: isDark ? '#0f172a' : '#fff' }]}>
                    Mettre à jour le mot de passe
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Déconnexion */}
          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
            <LogOut color={C.danger} size={18} />
            <Text style={[s.logoutBtnText, { color: C.danger }]}>Se déconnecter de l'application</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: 13 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  scroll: { padding: 16, gap: 14, paddingBottom: 120 },

  profileCard: {
    alignItems: 'center', borderRadius: 20, padding: 24, borderWidth: 1, gap: 6,
  },
  avatarWrap: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: '#f59e0b',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#0f172a' },
  userName: { fontSize: 18, fontWeight: '700' },
  userSub: { fontSize: 13 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, marginTop: 4,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '600' },

  sectionCard: {
    borderRadius: 16, padding: 16, gap: 14, borderWidth: 1,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700' },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 11, marginBottom: 2 },
  infoVal: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1, marginVertical: 2 },

  themeRow: { flexDirection: 'row', gap: 8 },
  themeOption: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, position: 'relative',
  },
  themeLabel: { fontSize: 12, fontWeight: '600' },
  themeCheck: {
    position: 'absolute', top: 6, right: 6,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },

  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600' },
  passWrap: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderRadius: 12, paddingHorizontal: 12, height: 50, gap: 8,
  },
  passInput: { flex: 1, fontSize: 14 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#f59e0b', borderRadius: 12, paddingVertical: 14, marginTop: 4,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700' },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 14, paddingVertical: 14,
    backgroundColor: 'rgba(239,68,68,0.06)',
  },
  logoutBtnText: { fontSize: 14, fontWeight: '700' },
});
