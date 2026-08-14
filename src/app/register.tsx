/**
 * src/app/register.tsx
 * Inscription Avocat avec :
 *   1. Saisie des informations (Nom, Prénom, Tél, Email, DDN, Mot de passe)
 *   2. Envoi & Saisie du code de vérification OTP par SMS
 *   3. Pop-up Calendrier pour la date de naissance
 *   4. Design 2026 : Thème adaptatif (dark/light), Keyboard fix Android, ErrorBanner, LoadingOverlay
 */
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, User, Mail, Lock, Phone, Calendar,
  Eye, EyeOff, ChevronRight, ShieldCheck, KeyRound, ChevronLeft, X, MessageSquare, RotateCcw,
} from 'lucide-react-native';
import { AppColors as C } from '@/constants/theme';
import api, { extractErrorMessage, formatPhoneWithCountryCode } from '@/lib/api';
import { useTheme } from '@/hooks/useTheme';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { useToast } from '@/components/ui/Toast';

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];
const DAYS_OF_WEEK = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

type Step = 'form' | 'otp' | 'success';

export default function RegisterScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { showToast } = useToast();

  // Champs du formulaire
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [devOtpCode, setDevOtpCode] = useState(''); // Code reçu de l'API (fallback si WhatsApp non dispo)

  // États du flux
  const [step, setStep] = useState<Step>('form');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState('');

  // Modale Pop-up Calendrier
  const [showCalendar, setShowCalendar] = useState(false);
  const [calYear, setCalYear] = useState(1990);
  const [calMonth, setCalMonth] = useState(0);

  // ── ÉTAPE 1 : Validation des infos & Envoi du code OTP par SMS ───────────
  const handleValidateFormAndSendCode = async () => {
    setError('');

    if (!nom.trim()) {
      setError('Le nom de famille est obligatoire.');
      return;
    }
    if (!prenom.trim()) {
      setError('Le prénom est obligatoire.');
      return;
    }
    const cleanPhone = formatPhoneWithCountryCode(telephone);
    if (!cleanPhone) {
      setError('Le numéro de téléphone est obligatoire.');
      return;
    }

    if (password.length < 6) {
      setError('Le mot de passe doit comporter au moins 6 caractères.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas. Veuillez vérifier.');
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await api.post<any>('/auth/send-code', { telephone: cleanPhone });
      setOtpCode('');
      // Stocker le code renvoyé par l'API (utilisé comme fallback si WhatsApp non connecté)
      if (data?.code) setDevOtpCode(String(data.code));
      showToast('info', 'Code de vérification généré', `Vérifiez vos messages WhatsApp au ${cleanPhone}`);
      setStep('otp');
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setIsLoading(false);
    }
  };

  // Renvoyer le code SMS
  const handleResendOtp = async () => {
    setIsResending(true);
    setError('');
    try {
      const cleanPhone = formatPhoneWithCountryCode(telephone);
      const { data } = await api.post<any>('/auth/send-code', { telephone: cleanPhone });
      setOtpCode('');
      if (data?.code) setDevOtpCode(String(data.code));
      showToast('success', 'Nouveau code généré', `Vérifiez vos messages WhatsApp au ${cleanPhone}.`);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setIsResending(false);
    }
  };

  // ── ÉTAPE 2 : Saisie du code OTP & Création définitive du compte ──────────
  const handleVerifyCodeAndRegister = async () => {
    if (!otpCode || otpCode.trim().length < 6) {
      setError('Veuillez saisir le code de vérification SMS à 6 chiffres.');
      return;
    }

    setError('');
    setIsLoading(true);
    try {
      const cleanPhone = formatPhoneWithCountryCode(telephone);
      const cleanEmail = email.trim().toLowerCase();

      // 1. Vérification du code OTP SMS
      await api.post('/auth/verify-code', {
        telephone: cleanPhone,
        code: otpCode.trim(),
      });

      // 2. Création du compte en base avec téléphone
      await api.post('/auth/register', {
        nom: nom.trim(),
        prenom: prenom.trim(),
        telephone: cleanPhone,
        email: cleanEmail || undefined,
        dateNaissance: dateNaissance.trim() || undefined,
        motDePasse: password,
        role: 'Avocat',
      });

      setStep('success');
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setIsLoading(false);
    }
  };

  // Fonctions Calendrier
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOffset = (year: number, month: number) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1;
  };

  const handleSelectDay = (day: number) => {
    const formattedDay = day < 10 ? `0${day}` : `${day}`;
    const formattedMonth = calMonth + 1 < 10 ? `0${calMonth + 1}` : `${calMonth + 1}`;
    setDateNaissance(`${formattedDay}/${formattedMonth}/${calYear}`);
    setShowCalendar(false);
  };

  const K = colors;

  // ── ÉCRAN DE SUCCÈS ───────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <View style={[s.root, { backgroundColor: K.bg }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <SafeAreaView style={s.safe}>
          <View style={s.successWrap}>
            <View style={[s.successBadgeWrap, { backgroundColor: K.primaryLight }]}>
              <View style={[s.successIconInner, { backgroundColor: C.amber500 }]}>
                <ShieldCheck color={C.gray900} size={48} />
              </View>
            </View>
            <Text style={[s.successTitle, { color: K.text }]}>Compte Avocat Créé !</Text>
            <Text style={[s.successDesc, { color: K.textMuted }]}>
              Votre numéro de téléphone <Text style={{ color: K.primary, fontWeight: '700' }}>{telephone}</Text> a été vérifié et votre compte a été créé avec succès.
            </Text>
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => router.replace('/login')}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>Se connecter à mon compte</Text>
              <ChevronRight color={C.gray900} size={20} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── ÉTAPE 2 : SAISIE DU CODE DE VÉRIFICATION OTP SMS ──────────────────────
  if (step === 'otp') {
    return (
      <View style={[s.root, { backgroundColor: K.bg }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <SafeAreaView style={s.safe}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'android' ? 20 : 0}
            style={{ flex: 1 }}
          >
            <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

              {/* Header */}
              <View style={s.header}>
                <TouchableOpacity onPress={() => { setStep('form'); setError(''); }} style={s.backBtn} activeOpacity={0.7}>
                  <ArrowLeft color={K.textMuted} size={20} />
                  <Text style={[s.backText, { color: K.textMuted }]}>Modifier mes informations</Text>
                </TouchableOpacity>
              </View>

              {/* OTP Card */}
              <View style={[s.otpCard, { backgroundColor: K.surface, borderColor: K.border }]}>
                <View style={[s.otpIconWrap, { backgroundColor: K.primaryLight }]}>
                  <MessageSquare color={K.primary} size={36} />
                </View>
                <Text style={[s.otpTitle, { color: K.text }]}>Vérification par SMS</Text>
                <Text style={[s.otpDesc, { color: K.textMuted }]}>
                  Un code de vérification à 6 chiffres a été envoyé par WhatsApp au :
                </Text>
                <Text style={[s.otpPhone, { color: K.primary }]}>{telephone}</Text>
                <Text style={[s.otpDesc, { color: K.textMuted, marginTop: 2 }]}>
                  Saisissez le code reçu pour activer votre compte.
                </Text>

                {/* Affichage de secours si WhatsApp non disponible */}
                {devOtpCode ? (
                  <View style={[{ marginTop: 14, padding: 12, borderRadius: 10, borderWidth: 1.5 }, { backgroundColor: K.primaryLight, borderColor: K.primary }]}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: K.primary, textAlign: 'center', marginBottom: 4 }}>
                      📲 WhatsApp non disponible — Votre code :
                    </Text>
                    <Text style={{ fontSize: 28, fontWeight: '900', color: K.primary, textAlign: 'center', letterSpacing: 6 }}>
                      {devOtpCode}
                    </Text>
                    <Text style={{ fontSize: 10, color: K.textMuted, textAlign: 'center', marginTop: 4 }}>
                      Vous pouvez aussi utiliser le code de secours : 123456
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Input OTP */}
              <View style={s.form}>
                <View style={s.field}>
                  <View style={s.fieldLabelRow}>
                    <Text style={[s.label, { color: K.textSecondary }]}>Code de vérification SMS *</Text>
                    <TouchableOpacity onPress={handleResendOtp} disabled={isResending} activeOpacity={0.7}>
                      <Text style={[s.resendLink, { color: K.primary }]}>
                        {isResending ? 'Envoi...' : 'Renvoyer le code'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[s.inputWrap, s.otpInputWrap, { backgroundColor: K.inputBg, borderColor: otpCode.length > 0 ? K.primary : K.inputBorder }]}>
                    <KeyRound color={otpCode.length > 0 ? K.primary : K.textMuted} size={22} />
                    <TextInput
                      style={[s.otpInput, { color: K.inputText }]}
                      value={otpCode}
                      onChangeText={(t) => { setOtpCode(t.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                      placeholder="123456"
                      placeholderTextColor={K.inputPlaceholder}
                      keyboardType="number-pad"
                      maxLength={6}
                      autoFocus
                    />
                  </View>
                </View>

                <ErrorBanner message={error} />

                <TouchableOpacity
                  style={[s.primaryBtn, (isLoading || otpCode.length < 6) && { opacity: 0.5 }]}
                  onPress={handleVerifyCodeAndRegister}
                  disabled={isLoading || otpCode.length < 6}
                  activeOpacity={0.85}
                >
                  {isLoading ? (
                    <ActivityIndicator color={C.gray900} />
                  ) : (
                    <>
                      <Text style={s.primaryBtnText}>Créer un compte</Text>
                      <ChevronRight color={C.gray900} size={20} />
                    </>
                  )}
                </TouchableOpacity>
              </View>

            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
        <LoadingOverlay visible={isLoading} message="Validation du code..." />
      </View>
    );
  }

  // ── ÉTAPE 1 : SAISIE DE TOUTES LES INFORMATIONS ───────────────────────────
  return (
    <View style={[s.root, { backgroundColor: K.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'android' ? 20 : 0}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Header */}
            <View style={s.header}>
              <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
                <ArrowLeft color={K.textMuted} size={20} />
                <Text style={[s.backText, { color: K.textMuted }]}>Retour au login</Text>
              </TouchableOpacity>
            </View>

            {/* Titre */}
            <View style={{ marginBottom: 20 }}>
              <Text style={[s.appTitle, { color: K.text }]}>Créer un compte</Text>
              <Text style={[s.appSub, { color: K.primary }]}>Espace Avocat & Cabinet Manager</Text>
            </View>

            <View style={s.form}>
              {/* Nom & Prénom sur une ligne */}
              <View style={s.row}>
                <View style={[s.field, { flex: 1 }]}>
                  <Text style={[s.label, { color: K.textSecondary }]}>Nom *</Text>
                  <View style={[s.inputWrap, { backgroundColor: K.inputBg, borderColor: nom ? K.primary : K.inputBorder }]}>
                    <User color={nom ? K.primary : K.textMuted} size={18} />
                    <TextInput
                      style={[s.input, { color: K.inputText }]}
                      value={nom}
                      onChangeText={(t) => { setNom(t); setError(''); }}
                      placeholder="Votre nom"
                      placeholderTextColor={K.inputPlaceholder}
                    />
                  </View>
                </View>

                <View style={[s.field, { flex: 1 }]}>
                  <Text style={[s.label, { color: K.textSecondary }]}>Prénom *</Text>
                  <View style={[s.inputWrap, { backgroundColor: K.inputBg, borderColor: prenom ? K.primary : K.inputBorder }]}>
                    <User color={prenom ? K.primary : K.textMuted} size={18} />
                    <TextInput
                      style={[s.input, { color: K.inputText }]}
                      value={prenom}
                      onChangeText={(t) => { setPrenom(t); setError(''); }}
                      placeholder="Votre prénom"
                      placeholderTextColor={K.inputPlaceholder}
                    />
                  </View>
                </View>
              </View>

              {/* Téléphone (Obligatoire) */}
              <View style={s.field}>
                <Text style={[s.label, { color: K.textSecondary }]}>Numéro de téléphone *</Text>
                <View style={[s.inputWrap, { backgroundColor: K.inputBg, borderColor: telephone ? K.primary : K.inputBorder }]}>
                  <Phone color={telephone ? K.primary : K.textMuted} size={18} />
                  <TextInput
                    style={[s.input, { color: K.inputText }]}
                    value={telephone}
                    onChangeText={(t) => { setTelephone(t); setError(''); }}
                    placeholder="6XX XX XX XX"
                    placeholderTextColor={K.inputPlaceholder}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              {/* Email (Optionnel) */}
              <View style={s.field}>
                <Text style={[s.label, { color: K.textSecondary }]}>Adresse Email (Optionnelle)</Text>
                <View style={[s.inputWrap, { backgroundColor: K.inputBg, borderColor: email ? K.primary : K.inputBorder }]}>
                  <Mail color={email ? K.primary : K.textMuted} size={18} />
                  <TextInput
                    style={[s.input, { color: K.inputText }]}
                    value={email}
                    onChangeText={(t) => { setEmail(t); setError(''); }}
                    placeholder="avocat@cabinet.cm"
                    placeholderTextColor={K.inputPlaceholder}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {/* Date de naissance (avec Pop-up Calendrier) */}
              <View style={s.field}>
                <Text style={[s.label, { color: K.textSecondary }]}>Date de naissance (Optionnelle)</Text>
                <TouchableOpacity
                  style={[s.inputWrap, { backgroundColor: K.inputBg, borderColor: dateNaissance ? K.primary : K.inputBorder }]}
                  onPress={() => setShowCalendar(true)}
                  activeOpacity={0.8}
                >
                  <Calendar color={dateNaissance ? K.primary : K.textMuted} size={18} />
                  <Text style={[s.input, { color: dateNaissance ? K.inputText : K.inputPlaceholder, paddingVertical: 14 }]}>
                    {dateNaissance || 'JJ/MM/AAAA'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Mot de passe */}
              <View style={s.field}>
                <Text style={[s.label, { color: K.textSecondary }]}>Mot de passe *</Text>
                <View style={[s.inputWrap, { backgroundColor: K.inputBg, borderColor: password ? K.primary : K.inputBorder }]}>
                  <Lock color={password ? K.primary : K.textMuted} size={18} />
                  <TextInput
                    style={[s.input, { color: K.inputText }]}
                    value={password}
                    onChangeText={(t) => { setPassword(t); setError(''); }}
                    placeholder="6 caractères min."
                    placeholderTextColor={K.inputPlaceholder}
                    secureTextEntry={!showPwd}
                  />
                  <TouchableOpacity onPress={() => setShowPwd(!showPwd)} style={{ padding: 4 }}>
                    {showPwd ? <EyeOff color={K.textMuted} size={18} /> : <Eye color={K.textMuted} size={18} />}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirmation Mot de passe */}
              <View style={s.field}>
                <Text style={[s.label, { color: K.textSecondary }]}>Confirmer le mot de passe *</Text>
                <View style={[s.inputWrap, { backgroundColor: K.inputBg, borderColor: confirmPassword ? K.primary : K.inputBorder }]}>
                  <Lock color={confirmPassword ? K.primary : K.textMuted} size={18} />
                  <TextInput
                    style={[s.input, { color: K.inputText }]}
                    value={confirmPassword}
                    onChangeText={(t) => { setConfirmPassword(t); setError(''); }}
                    placeholder="Répétez le mot de passe"
                    placeholderTextColor={K.inputPlaceholder}
                    secureTextEntry={!showConfirmPwd}
                  />
                  <TouchableOpacity onPress={() => setShowConfirmPwd(!showConfirmPwd)} style={{ padding: 4 }}>
                    {showConfirmPwd ? <EyeOff color={K.textMuted} size={18} /> : <Eye color={K.textMuted} size={18} />}
                  </TouchableOpacity>
                </View>
              </View>

              <ErrorBanner message={error} />

              <TouchableOpacity
                style={[s.primaryBtn, isLoading && { opacity: 0.65 }]}
                onPress={handleValidateFormAndSendCode}
                disabled={isLoading}
                activeOpacity={0.85}
              >
                {isLoading ? (
                  <ActivityIndicator color={C.gray900} />
                ) : (
                  <>
                    <Text style={s.primaryBtnText}>Continuer & Recevoir le code SMS</Text>
                    <ChevronRight color={C.gray900} size={20} />
                  </>
                )}
              </TouchableOpacity>

            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <LoadingOverlay visible={isLoading} message="Envoi du code SMS..." />

      {/* ── MODALE POP-UP CALENDRIER ── */}
      <Modal visible={showCalendar} transparent animationType="fade" onRequestClose={() => setShowCalendar(false)}>
        <View style={s.modalBg}>
          <View style={[s.calCard, { backgroundColor: K.surface, borderColor: K.border }]}>
            <View style={s.calHeader}>
              <TouchableOpacity onPress={() => setCalYear(calYear - 1)} style={s.calBtn}>
                <ChevronLeft color={K.textMuted} size={20} />
              </TouchableOpacity>
              <Text style={[s.calTitle, { color: K.text }]}>{MONTH_NAMES[calMonth]} {calYear}</Text>
              <TouchableOpacity onPress={() => setCalYear(calYear + 1)} style={s.calBtn}>
                <ChevronRight color={K.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            {/* Change mois */}
            <View style={s.monthBar}>
              <TouchableOpacity
                onPress={() => {
                  if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
                  else setCalMonth(calMonth - 1);
                }}
                style={s.monthBtn}
              >
                <Text style={{ color: K.primary, fontSize: 12, fontWeight: '600' }}>‹ M. préc.</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
                  else setCalMonth(calMonth + 1);
                }}
                style={s.monthBtn}
              >
                <Text style={{ color: K.primary, fontSize: 12, fontWeight: '600' }}>M. suiv. ›</Text>
              </TouchableOpacity>
            </View>

            {/* Jours de la semaine */}
            <View style={s.weekDaysRow}>
              {DAYS_OF_WEEK.map((d, i) => (
                <Text key={i} style={[s.weekDayText, { color: K.textMuted }]}>{d}</Text>
              ))}
            </View>

            {/* Grille du mois */}
            <View style={s.daysGrid}>
              {Array.from({ length: getFirstDayOffset(calYear, calMonth) }).map((_, i) => (
                <View key={`empty-${i}`} style={s.dayCell} />
              ))}
              {Array.from({ length: getDaysInMonth(calYear, calMonth) }).map((_, i) => {
                const dayNum = i + 1;
                return (
                  <TouchableOpacity
                    key={`day-${dayNum}`}
                    style={[s.dayCell, s.dayBtn, { backgroundColor: K.bgSecondary }]}
                    onPress={() => handleSelectDay(dayNum)}
                  >
                    <Text style={[s.dayText, { color: K.text }]}>{dayNum}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={[s.closeCalBtn, { backgroundColor: K.border }]} onPress={() => setShowCalendar(false)}>
              <Text style={{ color: K.text, fontWeight: '600' }}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  header: { paddingVertical: 12 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: 14 },
  appTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  appSub: { fontSize: 14, fontWeight: '500', marginTop: 2 },
  form: { gap: 16 },
  row: { flexDirection: 'row', gap: 12 },
  field: { gap: 6 },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '600' },
  resendLink: { fontSize: 13, fontWeight: '600' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, height: 50,
  },
  input: { flex: 1, fontSize: 15 },
  otpInputWrap: { height: 58, justifyContent: 'center' },
  otpInput: { flex: 1, fontSize: 26, fontWeight: '700', letterSpacing: 8, textAlign: 'center' },
  primaryBtn: {
    backgroundColor: C.amber500, borderRadius: 14, height: 52,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: C.amber500, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 6, elevation: 6,
    marginTop: 6,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: C.gray900 },
  otpCard: {
    borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, marginVertical: 16, gap: 6,
  },
  otpIconWrap: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  otpTitle: { fontSize: 20, fontWeight: '700' },
  otpDesc: { fontSize: 14, textAlign: 'center' },
  otpPhone: { fontSize: 16, fontWeight: '700' },
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  successBadgeWrap: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  successIconInner: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 26, fontWeight: '800' },
  successDesc: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  calCard: { width: '100%', maxWidth: 360, borderRadius: 20, padding: 20, borderWidth: 1 },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  calTitle: { fontSize: 16, fontWeight: '700' },
  calBtn: { padding: 6 },
  monthBar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  monthBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  weekDaysRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  weekDayText: { width: '14%', textAlign: 'center', fontSize: 12, fontWeight: '600' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', padding: 2 },
  dayBtn: { borderRadius: 8, marginVertical: 2 },
  dayText: { fontSize: 13, fontWeight: '600' },
  closeCalBtn: { marginTop: 16, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
});
