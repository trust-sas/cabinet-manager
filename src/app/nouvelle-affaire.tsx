/**
 * src/app/nouvelle-affaire.tsx
 * Écran de création d'un dossier / affaire juridique.
 * Respecte le modèle de données : Dossier lié à un Client, avec juridiction,
 * statut initial "Ouvert", avocat responsable = utilisateur connecté.
 */
import { extractErrorMessage } from '@/lib/api';
import { AppColors as C } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useClients } from '@/hooks/useClients';
import { useDossiers } from '@/hooks/useDossiers';
import { createDossier } from '@/services/dossiers.service';
import { ajouterAccèsDossier, hasDossierAccess, hasClientAccess } from '@/services/dossierInvitations.service';
import { useRouter } from 'expo-router';
import { ArrowLeft, Building2, FileText, Plus, Save, User } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const JURIDICTIONS = [
  'TGI Douala (Bonanjo)',
  'TGI Yaoundé (Centre)',
  'Tribunal de Commerce Douala',
  'Cour d\'Appel du Littoral',
  'Cour Suprême du Cameroun',
  'Autre',
];

export default function NouvelleAffaireScreen() {
  const router = useRouter();
  const { colors: K, isDark } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardSpace, setKeyboardSpace] = useState(0);

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

  const { clients, isLoading: loadingClients } = useClients({ pageSize: 100 });
  const userClients = clients;

  // Champs du formulaire
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedClientId && userClients.length > 0) {
      setSelectedClientId(Number(userClients[0].id));
    }
  }, [userClients, selectedClientId]);

  const [titre, setTitre] = useState('');
  const [juridiction, setJuridiction] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!selectedClientId) {
      setError('Veuillez sélectionner un client pour ce dossier.');
      return;
    }
    if (!titre.trim()) {
      setError("Veuillez saisir l'intitulé / titre du dossier.");
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const created = await createDossier({
        clientId: selectedClientId,
        titre: titre.trim(),
        juridiction: juridiction.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (created?.id) {
        ajouterAccèsDossier(Number(created.id));
      }
      Alert.alert(
        'Dossier créé !',
        `Numéro : ${created.numeroAffaire}\nStatut : Ouvert`,
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/affaires') }],
      );
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[s.root, { backgroundColor: K.bg }]}>
      {/* Header */}
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: K.bgSecondary }}>
        <View style={[s.header, { backgroundColor: K.bgSecondary }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backRow} activeOpacity={0.7}>
            <ArrowLeft color={K.textMuted} size={20} />
            <Text style={[s.backText, { color: K.textMuted }]}>Retour</Text>
          </TouchableOpacity>
          <View style={s.titleRow}>
            <View style={[s.titleIcon, { backgroundColor: K.primaryLight }]}>
              <FileText color={K.primary} size={22} />
            </View>
            <View>
              <Text style={[s.title, { color: K.text }]}>Nouveau Dossier</Text>
              <Text style={[s.sub, { color: K.primary }]}>Ouverture d'une affaire juridique</Text>
            </View>
          </View>
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
          {/* ── 1. Sélection du client ── */}
          <View style={[s.section, { backgroundColor: K.surface, borderColor: K.border }]}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionNum}>1</Text>
              <Text style={[s.sectionTitle, { color: K.text }]}>Client du dossier *</Text>
              <TouchableOpacity onPress={() => router.push('/nouveau-client')} style={s.addLink}>
                <Plus color={K.primary} size={14} />
                <Text style={[s.addLinkText, { color: K.primary }]}>Créer un client</Text>
              </TouchableOpacity>
            </View>

            {loadingClients ? (
              <ActivityIndicator color={C.amber500} style={{ marginVertical: 12 }} />
            ) : userClients.length === 0 ? (
              <View style={s.emptyClients}>
                <User color={K.textMuted} size={32} />
                <Text style={[s.emptyClientsTitle, { color: K.textMuted }]}>Aucun client dans votre répertoire</Text>
                <TouchableOpacity style={s.createClientBtn} onPress={() => router.push('/nouveau-client')}>
                  <Text style={s.createClientBtnText}>+ Créer un client d'abord</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 4 }}
              >
                {userClients.map((c) => {
                  const id = Number(c.id);
                  const isSelected = selectedClientId === id;
                  return (
                    <TouchableOpacity
                      key={String(c.id)}
                      onPress={() => setSelectedClientId(id)}
                      style={[
                        s.clientCard,
                        { backgroundColor: K.bgSecondary, borderColor: K.border },
                        isSelected && { borderColor: K.primary, backgroundColor: isDark ? 'rgba(217,119,6,0.15)' : C.amber50 },
                        { marginRight: 10 }
                      ]}
                      activeOpacity={0.8}
                    >
                      <View style={[s.clientAvatar, { backgroundColor: isSelected ? K.primary : (isDark ? K.surface : C.amber50) }]}>
                        {c.nomComplet.toLowerCase().startsWith('s') ||
                        c.nomComplet.toLowerCase().includes(' sa') ||
                        c.nomComplet.toLowerCase().includes(' ltd') ? (
                          <Building2 color={isSelected ? (isDark ? C.gray900 : C.white) : K.primary} size={18} />
                        ) : (
                          <User color={isSelected ? (isDark ? C.gray900 : C.white) : K.primary} size={18} />
                        )}
                      </View>
                      <View style={{ flex: 1, minWidth: 80 }}>
                        <Text style={[s.clientName, { color: K.text }, isSelected && { color: K.primary, fontWeight: '700' }]} numberOfLines={2}>
                          {c.nomComplet}
                        </Text>
                        {c.email ? (
                          <Text style={[s.clientEmail, { color: K.textMuted }]} numberOfLines={1}>{c.email}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* ── 2. Informations du dossier ── */}
          <View style={[s.section, { backgroundColor: K.surface, borderColor: K.border }]}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionNum}>2</Text>
              <Text style={[s.sectionTitle, { color: K.text }]}>Informations du dossier</Text>
            </View>

            <View style={s.field}>
              <Text style={[s.label, { color: K.text }]}>
                Intitulé / Titre de l'affaire <Text style={{ color: C.red500 }}>*</Text>
              </Text>
              <TextInput
                style={[s.input, { backgroundColor: K.inputBg, borderColor: K.inputBorder, color: K.inputText }]}
                value={titre}
                onChangeText={setTitre}
                placeholder="Ex: Litige commercial Brasseries vs Distributeur"
                placeholderTextColor={K.inputPlaceholder}
                returnKeyType="next"
              />
            </View>

            <View style={s.field}>
              <Text style={[s.label, { color: K.text }]}>Juridiction compétente</Text>
              <TextInput
                style={[s.input, { backgroundColor: K.inputBg, borderColor: K.inputBorder, color: K.inputText }]}
                value={juridiction}
                onChangeText={setJuridiction}
                placeholder="Sélectionnez ou saisissez..."
                placeholderTextColor={K.inputPlaceholder}
                onFocus={handleScrollToBottom}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 4 }}
              >
                {JURIDICTIONS.map((j) => (
                  <TouchableOpacity
                    key={j}
                    onPress={() => setJuridiction(j)}
                    style={[
                      s.jurPill,
                      { backgroundColor: K.bgSecondary, borderColor: K.border },
                      juridiction === j && { backgroundColor: K.primary, borderColor: K.primary },
                      { marginRight: 6 }
                    ]}
                  >
                    <Text style={[s.jurPillText, { color: K.textSecondary }, juridiction === j && { color: C.gray900, fontWeight: '700' }]}>
                      {j}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={s.field}>
              <Text style={[s.label, { color: K.text }]}>Notes internes / Faits clés</Text>
              <TextInput
                style={[s.input, { backgroundColor: K.inputBg, borderColor: K.inputBorder, color: K.inputText, height: 100, textAlignVertical: 'top', paddingTop: 12 }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Description des faits, éléments de preuve, dates importantes..."
                placeholderTextColor={K.inputPlaceholder}
                onFocus={handleScrollToBottom}
                multiline
              />
            </View>
          </View>

          {/* ── Erreur ── */}
          {error !== '' && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {/* ── Boutons ── */}
          <View style={s.btnRow}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => router.back()} activeOpacity={0.8}>
              <Text style={s.cancelText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.saveBtn, (!selectedClientId || !titre.trim()) && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator color={C.gray900} />
              ) : (
                <>
                  <Save color={C.gray900} size={20} />
                  <Text style={s.saveText}>Créer le dossier</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  header: { padding: 16, paddingBottom: 14 },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  backText: { fontSize: 14, color: C.gray400, marginLeft: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '700', color: C.white },
  sub: { fontSize: 13, color: C.amber400, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 160, gap: 14 },
  section: {
    backgroundColor: C.white, borderRadius: 16, padding: 16,
    shadowColor: C.black, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 3, elevation: 2,
    gap: 14,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionNum: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: C.amber500,
    textAlign: 'center', lineHeight: 24, fontSize: 12, fontWeight: '700', color: C.gray900,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.gray900, flex: 1 },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addLinkText: { fontSize: 13, fontWeight: '600', color: C.amber600 },
  emptyClients: { alignItems: 'center', paddingVertical: 16, gap: 10 },
  emptyClientsTitle: { fontSize: 14, color: C.gray500 },
  createClientBtn: { backgroundColor: C.amber500, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  createClientBtnText: { fontSize: 13, fontWeight: '700', color: C.gray900 },
  clientCard: {
    width: 140, borderWidth: 1.5, borderColor: C.gray200, borderRadius: 14,
    padding: 12, backgroundColor: C.gray50, alignItems: 'flex-start', gap: 8,
  },
  clientCardSelected: {
    borderColor: C.amber500, backgroundColor: C.amber50,
  },
  clientAvatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  clientName: { fontSize: 13, fontWeight: '600', color: C.gray900 },
  clientEmail: { fontSize: 11, color: C.gray500 },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: C.gray900 },
  input: {
    borderWidth: 1, borderColor: C.gray200, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: C.gray900, backgroundColor: C.white,
  },
  jurPill: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: C.gray200, backgroundColor: C.gray50,
  },
  jurPillActive: { backgroundColor: C.amber500, borderColor: C.amber500 },
  jurPillText: { fontSize: 11, color: C.gray600 },
  jurPillTextActive: { color: C.gray900, fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: C.gray300,
    borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: C.gray700 },
  saveBtn: {
    flex: 2, borderRadius: 14, backgroundColor: C.amber500,
    paddingVertical: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  saveText: { fontSize: 15, fontWeight: '600', color: C.gray900 },
  errorBox: {
    backgroundColor: C.red50, borderWidth: 1, borderColor: C.red200,
    borderRadius: 12, padding: 14,
  },
  errorText: { color: C.red700, fontSize: 13, textAlign: 'center' },
});
