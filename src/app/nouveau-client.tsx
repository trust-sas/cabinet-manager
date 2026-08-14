import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Save, User, Building2 } from 'lucide-react-native';
import { AppColors as C } from '@/constants/theme';
import { createClient } from '@/services/clients.service';
import { ajouterAccèsClient } from '@/services/dossierInvitations.service';
import { extractErrorMessage } from '@/lib/api';

type ClientType = 'personne_physique' | 'personne_morale';

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', required = false }: any) {
  return (
    <View style={sf.field}>
      <Text style={sf.label}>{label}{required && <Text style={{ color: C.red500 }}> *</Text>}</Text>
      <TextInput
        style={[sf.input, { borderColor: C.gray200 }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.gray400}
        keyboardType={keyboardType}
      />
    </View>
  );
}

export default function NouveauClientScreen() {
  const router = useRouter();
  const [type, setType] = useState<ClientType>('personne_physique');

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
    <View style={sf.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.gray900 }}>
        <View style={sf.header}>
          <TouchableOpacity onPress={() => router.back()} style={sf.backBtn} activeOpacity={0.7}>
            <ArrowLeft color={C.gray400} size={20} />
            <Text style={sf.backText}>Retour</Text>
          </TouchableOpacity>
          <Text style={sf.title}>Nouveau Client</Text>
          <Text style={sf.sub}>Ajouter un client au répertoire</Text>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 160, gap: 14 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Type selector */}
          <View style={sf.card}>
            <Text style={sf.sectionTitle}>Type de client</Text>
            <View style={sf.typeGrid}>
              {([
                { key: 'personne_physique', label: 'Particulier', Icon: User },
                { key: 'personne_morale', label: 'Entreprise', Icon: Building2 },
              ] as { key: ClientType; label: string; Icon: any }[]).map(({ key, label, Icon }) => {
                const isActive = type === key;
                const color = key === 'personne_morale' ? C.blue600 : C.amber600;
                const bg = key === 'personne_morale' ? C.blue50 : C.amber50;
                const border = key === 'personne_morale' ? C.blue500 : C.amber500;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setType(key)}
                    style={[sf.typeBtn, isActive && { borderColor: border, backgroundColor: bg }]}
                    activeOpacity={0.8}
                  >
                    <Icon color={isActive ? color : C.gray400} size={28} />
                    <Text style={[sf.typeLabel, { color: isActive ? color : C.gray600 }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {type === 'personne_physique' ? (
            <>
              <View style={sf.card}>
                <Field label="Nom" value={nom} onChangeText={setNom} placeholder="ATANGANA" required />
                <Field label="Prénom" value={prenom} onChangeText={setPrenom} placeholder="Michel" />
              </View>
              <View style={sf.card}>
                <Field label="Téléphone" value={tel} onChangeText={setTel} placeholder="+237 6XX XX XX XX" keyboardType="phone-pad" />
                <Field label="Email" value={email} onChangeText={setEmail} placeholder="email@exemple.com" keyboardType="email-address" />
              </View>
            </>
          ) : (
            <>
              <View style={sf.card}>
                <Field label="Raison sociale" value={raisonSociale} onChangeText={setRaisonSociale} placeholder="Ex: CAMTEL SA" required />
              </View>
              <View style={sf.card}>
                <Field label="Téléphone" value={telEnt} onChangeText={setTelEnt} placeholder="+237 6XX XX XX XX" keyboardType="phone-pad" />
                <Field label="Email" value={emailEnt} onChangeText={setEmailEnt} placeholder="juridique@entreprise.cm" keyboardType="email-address" />
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
