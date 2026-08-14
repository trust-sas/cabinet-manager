/**
 * src/app/login.tsx
 * Écran de connexion — Numéro de téléphone + Mot de passe.
 * Design 2026 : thème adaptatif, keyboard fix Android, ErrorBanner animé, LoadingOverlay.
 */
import { extractErrorMessage } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, ChevronRight, Eye, EyeOff, Lock, Phone, Shield,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppColors as C } from '@/constants/theme';

type Step = 'credentials' | '2fa';

export default function LoginScreen() {
  const router = useRouter();
  const { login, verify2fa } = useAuth();
  const { colors, isDark } = useTheme();

  const [step, setStep] = useState<Step>('credentials');
  const [telephone, setTelephone] = useState('');
  /* Authentification par email mise en commentaire / optionnelle
  const [email, setEmail] = useState('');
  */
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code2fa, setCode2fa] = useState('');
  const [preAuthToken, setPreAuthToken] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const clearError = () => { if (error) setError(''); };

  // ── Connexion par Numéro de Téléphone ────────────────────────────────────

  const handleCredentials = async (e?: any) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();

    if (!telephone.trim()) {
      setError('Veuillez renseigner votre numéro de téléphone.');
      return;
    }
    if (!password) {
      setError('Veuillez renseigner votre mot de passe.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const outcome = await login(telephone.trim(), password);
      if ('requiresTwoFactor' in outcome && outcome.requiresTwoFactor) {
        setPreAuthToken(outcome.preAuthToken);
        setStep('2fa');
      }
    } catch (err: any) {
      setError('Numéro de téléphone ou mot de passe incorrect. Veuillez vérifier vos identifiants.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Vérification 2FA ─────────────────────────────────────────────────────

  const handle2FA = async (e?: any) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (code2fa.length !== 6) return;
    setError('');
    setIsLoading(true);
    try {
      await verify2fa(preAuthToken, code2fa);
    } catch (e) {
      setError("Code d'authentification invalide. Veuillez vérifier votre application.");
      setCode2fa('');
    } finally {
      setIsLoading(false);
    }
  };

  const inputBorderColor = (hasValue: boolean) =>
    hasValue ? colors.primary : colors.inputBorder;

  return (
    <View style={[s.root, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'android' ? 20 : 0}
        >
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Logo */}
            <View style={s.logoWrap}>
              <View style={[s.logoBox, { shadowColor: C.amber500 }]}>
                <Lock color={C.gray900} size={36} />
              </View>
              <Text style={[s.appTitle, { color: colors.text }]}>Cabinet Manager</Text>
              <Text style={[s.appSub, { color: colors.primary }]}>Gestion d'Affaires Juridiques</Text>
            </View>

            {step === 'credentials' ? (
              <View style={s.form}>

                {/* Titre */}
                <View style={{ marginBottom: 4 }}>
                  <Text style={[s.formTitle, { color: colors.text }]}>Connexion</Text>
                  <Text style={[s.formSub, { color: colors.textMuted }]}>
                    Connectez-vous à votre espace avocat
                  </Text>
                </View>

                {/* Numéro de téléphone */}
                <View style={s.field}>
                  <Text style={[s.label, { color: colors.textSecondary }]}>Numéro de téléphone</Text>
                  <View style={[s.inputWrap, {
                    backgroundColor: colors.inputBg,
                    borderColor: inputBorderColor(telephone.length > 0),
                  }]}>
                    <Phone color={telephone.length > 0 ? colors.primary : colors.textMuted} size={18} />
                    <TextInput
                      style={[s.input, { color: colors.inputText }]}
                      value={telephone}
                      onChangeText={(t) => { setTelephone(t); clearError(); }}
                      placeholder="6XX XX XX XX"
                      placeholderTextColor={colors.inputPlaceholder}
                      keyboardType="phone-pad"
                      autoCapitalize="none"
                      returnKeyType="next"
                    />
                  </View>
                </View>

                {/* Mot de passe */}
                <View style={s.field}>
                  <Text style={[s.label, { color: colors.textSecondary }]}>Mot de passe</Text>
                  <View style={[s.inputWrap, {
                    backgroundColor: colors.inputBg,
                    borderColor: inputBorderColor(password.length > 0),
                  }]}>
                    <Lock color={password.length > 0 ? colors.primary : colors.textMuted} size={18} />
                    <TextInput
                      style={[s.input, { flex: 1, color: colors.inputText }]}
                      value={password}
                      onChangeText={(t) => { setPassword(t); clearError(); }}
                      placeholder="••••••••"
                      placeholderTextColor={colors.inputPlaceholder}
                      secureTextEntry={!showPassword}
                      autoComplete="password"
                      returnKeyType="done"
                      onSubmitEditing={handleCredentials}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={s.eyeBtn}
                      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                    >
                      {showPassword
                        ? <EyeOff color={colors.textMuted} size={18} />
                        : <Eye color={colors.textMuted} size={18} />}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Erreur */}
                <ErrorBanner message={error} />

                {/* Bouton connexion */}
                <TouchableOpacity
                  style={[s.primaryBtn, (isLoading || !telephone || !password) && s.btnDisabled]}
                  onPress={handleCredentials}
                  disabled={isLoading || !telephone || !password}
                  activeOpacity={0.85}
                >
                  {isLoading
                    ? <ActivityIndicator color={C.gray900} />
                    : <>
                        <Text style={s.primaryBtnText}>Se connecter</Text>
                        <ChevronRight color={C.gray900} size={18} />
                      </>}
                </TouchableOpacity>

              </View>

            ) : (
              /* ── Étape 2FA ── */
              <View style={s.form}>
                <TouchableOpacity
                  onPress={() => { setStep('credentials'); setCode2fa(''); setError(''); }}
                  style={s.backBtn}
                >
                  <ArrowLeft color={colors.textMuted} size={18} />
                  <Text style={[s.backText, { color: colors.textMuted }]}>Retour</Text>
                </TouchableOpacity>

                <View style={[s.tfaCard, {
                  backgroundColor: colors.surface,
                  borderColor: colors.primaryLight,
                }]}>
                  <View style={[s.tfaIconWrap, { backgroundColor: colors.primaryLight }]}>
                    <Shield color={colors.primary} size={28} />
                  </View>
                  <Text style={[s.tfaTitle, { color: colors.text }]}>Vérification en 2 étapes</Text>
                  <Text style={[s.tfaDesc, { color: colors.textMuted }]}>
                    Entrez le code à 6 chiffres généré par votre application d'authentification.
                  </Text>
                </View>

                <View style={s.field}>
                  <Text style={[s.label, { color: colors.textSecondary, textAlign: 'center' }]}>
                    Code d'authentification
                  </Text>
                  <TextInput
                    style={[s.codeInput, {
                      color: colors.text,
                      backgroundColor: colors.inputBg,
                      borderColor: code2fa.length > 0 ? colors.primary : colors.inputBorder,
                    }]}
                    value={code2fa}
                    onChangeText={t => setCode2fa(t.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    placeholderTextColor={colors.inputPlaceholder}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                    onSubmitEditing={handle2FA}
                  />
                </View>

                <ErrorBanner message={error} />

                <TouchableOpacity
                  style={[s.primaryBtn, (isLoading || code2fa.length < 6) && s.btnDisabled]}
                  onPress={handle2FA}
                  disabled={isLoading || code2fa.length < 6}
                  activeOpacity={0.85}
                >
                  {isLoading
                    ? <ActivityIndicator color={C.gray900} />
                    : <Text style={s.primaryBtnText}>Vérifier et accéder</Text>}
                </TouchableOpacity>
              </View>
            )}

            {/* Footer */}
            <View style={s.footer}>
              <View style={s.registerRow}>
                <Text style={[s.registerText, { color: colors.textMuted }]}>Pas encore de compte ? </Text>
                <TouchableOpacity onPress={() => router.push('/register' as any)} activeOpacity={0.7}>
                  <Text style={[s.registerLink, { color: colors.primary }]}>Créer un compte</Text>
                </TouchableOpacity>
              </View>
              <Text style={[s.footerText, { color: colors.textMuted }]}>Cabinet d'Avocats • Cameroun</Text>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <LoadingOverlay visible={isLoading} message="Connexion en cours…" />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  logoWrap: { alignItems: 'center', marginTop: 48, marginBottom: 36 },
  logoBox: {
    width: 80, height: 80, backgroundColor: C.amber500, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 10,
  },
  appTitle: { fontSize: 28, fontWeight: '800', marginBottom: 4, letterSpacing: -0.5 },
  appSub: { fontSize: 14, fontWeight: '500' },
  form: { gap: 18 },
  formTitle: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  formSub: { fontSize: 14 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: 14,
    paddingHorizontal: 14, height: 52,
  },
  input: { flex: 1, fontSize: 15 },
  eyeBtn: { padding: 4 },
  primaryBtn: {
    backgroundColor: C.amber500, borderRadius: 14, height: 54,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: C.amber500, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
    marginTop: 4,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: C.gray900 },
  btnDisabled: { opacity: 0.5, shadowOpacity: 0 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backText: { fontSize: 14 },
  tfaCard: {
    borderWidth: 1, borderRadius: 20, padding: 24, alignItems: 'center', gap: 8,
  },
  tfaIconWrap: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  tfaTitle: { fontSize: 18, fontWeight: '700' },
  tfaDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  codeInput: {
    textAlign: 'center', fontSize: 32, fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 12, borderWidth: 1.5, borderRadius: 14,
    paddingVertical: 16, paddingHorizontal: 20,
  },
  footer: { alignItems: 'center', marginTop: 40, gap: 8 },
  registerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  registerText: { fontSize: 14 },
  registerLink: { fontSize: 14, fontWeight: '600' },
  footerText: { fontSize: 12 },
});
