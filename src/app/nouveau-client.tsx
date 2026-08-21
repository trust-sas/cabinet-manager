import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, StatusBar, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Save, User, Building2 } from 'lucide-react-native';
import { AppColors as C } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { createClient } from '@/services/clients.service';
import { ajouterAccèsClient } from '@/services/dossierInvitations.service';
import { extractErrorMessage } from '@/lib/api';

type ClientType = 'personne_physique' | 'personne_morale';

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  required?: boolean;
  onFocus?: () => void;
  K: any;
}

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', required = false, onFocus, K }: FieldProps) {
  return (
    <View style={sf.field}>
      <Text style={[sf.label, { color: K.text }]}>{label}{required && <Text style={{ color: C.red500 }}> *</Text>}</Text>
      <TextInput
        style={[sf.input, { backgroundColor: K.inputBg, borderColor: K.inputBorder, color: K.inputText }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={K.inputPlaceholder}
        keyboardType={keyboardType}
        onFocus={onFocus}
      />
    </View>
  );
}

export default function NouveauClientScreen() {
  const router = useRouter();
  const { colors: K, isDark } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardSpace, setKeyboardSpace] = useState(0);
  const [type, setType] = useState<ClientType>('personne_physique');

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardSpace(e.endCoordinates.height);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardSpace(0);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleScrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');

  const [raisonSociale, setRaisonSociale] = useState('');
  const [telEnt, setTelEnt] = useState('');
  const [emailEnt, setEmailEnt] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const accent = type === 'personne_morale' ? C.blue600 : C.amber500;

  const handleSubmit = async () => {
    const nomComplet = type === 'personne_physique'
      ? `${nom.trim()} ${prenom.trim()}`.trim()
      : raisonSociale.trim();

    const phone = type === 'personne_physique' ? tel.trim() : telEnt.trim();
    const mail = type === 'personne_physique' ? email.trim() : emailEnt.trim();

    if (!nomComplet) {
      setError('Veuillez saisir le nom du client.');
      return;
    }

    setError('');
    setIsLoading(true);
    try {
      const created = await createClient({
        nomComplet,
        telephone: phone,
        email: mail,
      });
      if (created?.id) {
        ajouterAccèsClient(Number(created.id));
      }
      Alert.alert('Succès', 'Client enregistré avec succès.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[sf.root, { backgroundColor: K.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: K.bgSecondary }}>
        <View style={[sf.header, { backgroundColor: K.bgSecondary }]}>
          <TouchableOpacity onPress={() => router.back()} style={sf.backBtn} activeOpacity={0.7}>
            <ArrowLeft color={K.textMuted} size={20} />
            <Text style={[sf.backText, { color: K.textMuted }]}>Retour</Text>
          </TouchableOpacity>
          <Text style={[sf.title, { color: K.text }]}>Nouveau Client</Text>
          <Text style={[sf.sub, { color: K.primary }]}>Ajouter un client au répertoire</Text>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ flexGrow: 1, padding: 16, paddingBottom: keyboardSpace > 0 ? keyboardSpace + 140 : 120, gap: 14 }}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
          nestedScrollEnabled={true}
        >
          {/* Type selector */}
          <View style={[sf.card, { backgroundColor: K.surface, borderColor: K.border }]}>
            <Text style={[sf.sectionTitle, { color: K.text }]}>Type de client</Text>
            <View style={sf.typeGrid}>
              {([
                { key: 'personne_physique', label: 'Particulier', Icon: User },
                { key: 'personne_morale', label: 'Entreprise', Icon: Building2 },
              ] as { key: ClientType; label: string; Icon: any }[]).map(({ key, label, Icon }) => {
                const isActive = type === key;
                const color = key === 'personne_morale' ? C.blue600 : C.amber600;
                const bg = key === 'personne_morale' ? (isDark ? 'rgba(37,99,235,0.15)' : C.blue50) : (isDark ? 'rgba(217,119,6,0.15)' : C.amber50);
                const border = key === 'personne_morale' ? C.blue500 : C.amber500;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setType(key)}
                    style={[sf.typeBtn, { backgroundColor: K.bgSecondary, borderColor: K.border }, isActive && { borderColor: border, backgroundColor: bg }]}
                    activeOpacity={0.8}
                  >
                    <Icon color={isActive ? color : K.textMuted} size={28} />
                    <Text style={[sf.typeLabel, { color: isActive ? color : K.textSecondary }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {type === 'personne_physique' ? (
            <>
              <View style={[sf.card, { backgroundColor: K.surface, borderColor: K.border }]}>
                <Field label="Nom" value={nom} onChangeText={setNom} placeholder="ATANGANA" required K={K} />
                <Field label="Prénom" value={prenom} onChangeText={setPrenom} placeholder="Michel" K={K} />
              </View>
              <View style={[sf.card, { backgroundColor: K.surface, borderColor: K.border }]}>
                <Field label="Téléphone" value={tel} onChangeText={setTel} placeholder="+237 6XX XX XX XX" keyboardType="phone-pad" onFocus={handleScrollToBottom} K={K} />
                <Field label="Email" value={email} onChangeText={setEmail} placeholder="email@exemple.com" keyboardType="email-address" onFocus={handleScrollToBottom} K={K} />
              </View>
            </>
          ) : (
            <>
              <View style={[sf.card, { backgroundColor: K.surface, borderColor: K.border }]}>
                <Field label="Raison sociale" value={raisonSociale} onChangeText={setRaisonSociale} placeholder="Ex: CAMTEL SA" required K={K} />
              </View>
              <View style={[sf.card, { backgroundColor: K.surface, borderColor: K.border }]}>
                <Field label="Téléphone" value={telEnt} onChangeText={setTelEnt} placeholder="+237 6XX XX XX XX" keyboardType="phone-pad" onFocus={handleScrollToBottom} K={K} />
                <Field label="Email" value={emailEnt} onChangeText={setEmailEnt} placeholder="juridique@entreprise.cm" keyboardType="email-address" onFocus={handleScrollToBottom} K={K} />
              </View>
            </>
          )}

          {error !== '' && (
            <View style={sf.errorBox}>
              <Text style={sf.errorText}>{error}</Text>
            </View>
          )}

          {/* Buttons */}
          <View style={sf.btnRow}>
            <TouchableOpacity style={sf.cancelBtn} onPress={() => router.back()} activeOpacity={0.8}>
              <Text style={sf.cancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sf.saveBtn, { backgroundColor: accent }]} onPress={handleSubmit} disabled={isLoading} activeOpacity={0.85}>
              {isLoading ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <>
                  <Save color={type === 'personne_morale' ? C.white : C.gray900} size={20} />
                  <Text style={[sf.saveText, { color: type === 'personne_morale' ? C.white : C.gray900 }]}>Enregistrer</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const sf = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  header: { padding: 16, paddingBottom: 12 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  backText: { fontSize: 14, color: C.gray400 },
  title: { fontSize: 22, fontWeight: '700', color: C.white },
  sub: { fontSize: 13, color: C.amber400, marginTop: 2 },
  card: { backgroundColor: C.white, borderRadius: 16, padding: 16, gap: 14, shadowColor: C.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3, elevation: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: C.gray900 },
  typeGrid: { flexDirection: 'row', gap: 12, marginTop: 8 },
  typeBtn: { flex: 1, borderWidth: 2, borderColor: C.gray200, borderRadius: 14, paddingVertical: 16, alignItems: 'center', gap: 8, backgroundColor: C.white },
  typeLabel: { fontSize: 13, fontWeight: '600' },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: C.gray900 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.gray900 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: C.gray300, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600', color: C.gray700 },
  saveBtn: { flex: 1, borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveText: { fontSize: 15, fontWeight: '600' },
  errorBox: { backgroundColor: C.red50, borderWidth: 1, borderColor: C.red200, borderRadius: 12, padding: 12 },
  errorText: { color: C.red700, fontSize: 13, textAlign: 'center' },
});
