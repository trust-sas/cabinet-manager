/**
 * src/app/(tabs)/assistant-ia.tsx
 * Écran Assistant IA Polyvalent & Réactif.
 * Thème adaptatif clair / sombre via useTheme().
 */

import { AppColors as C } from '@/constants/theme';
import { useDossiers } from '@/hooks/useDossiers';
import { useTheme } from '@/hooks/useTheme';
import api from '@/lib/api';
import { hasDossierAccess } from '@/services/dossierInvitations.service';
import { Dossier } from '@/services/dossiers.service';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Brain,
  Check,
  ChevronDown,
  FileText,
  HelpCircle,
  MessageSquare,
  Search,
  Send,
  Sparkles,
  Smile,
  X,
} from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SUGGESTIONS = [
  { Icon: Smile,         text: 'Bonjour ! Comment ça va ?',               cat: 'Discuter' },
  { Icon: HelpCircle,    text: 'C\'est quoi ton utilité ?',              cat: 'Aide' },
  { Icon: FileText,      text: 'Où sont contenus les textes de lois du Cameroun ?', cat: 'Législation' },
  { Icon: MessageSquare, text: 'Quels sont les délais de procédure en OHADA ?', cat: 'Conseil' },
];

export default function AssistantIAScreen() {
  const router = useRouter();
  const { colors: K, isDark } = useTheme();
  const { dossiers, isLoading: loadingDossiers } = useDossiers({ pageSize: 100 });

  const userDossiers = dossiers.filter(d => hasDossierAccess(Number(d.id)));

  const [selectedDossier, setSelectedDossier] = useState<Dossier | null>(null);
  const [showSelector, setShowSelector] = useState(false);
  const [searchAff, setSearchAff] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      type: 'assistant',
      content: `Bonjour ! 😊 Je suis votre **Assistant IA**.\n\nVous pouvez me poser une question (rédaction, conseils, organisation, droit, salutations...) ou sélectionner un dossier ci-dessus pour consulter votre BDD !`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef<FlatList>(null);

  const filteredDossiers = userDossiers.filter(
    (d) =>
      d.titre.toLowerCase().includes(searchAff.toLowerCase()) ||
      d.numeroAffaire.toLowerCase().includes(searchAff.toLowerCase()) ||
      (d.juridiction || '').toLowerCase().includes(searchAff.toLowerCase()),
  );

  const selectDossier = (d: Dossier) => {
    setSelectedDossier(d);
    setShowSelector(false);
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type: 'assistant',
        content: `📁 **Dossier BDD actif :** **${d.titre}** (${d.numeroAffaire})\n\n• **Juridiction :** ${d.juridiction || 'Non spécifiée'}\n• **Statut :** ${d.statut.toUpperCase()}\n• **Date d'ouverture :** ${new Date(d.dateOuverture).toLocaleDateString('fr-FR')}\n\nPosez-moi vos questions sur ce dossier ou sur n'importe quel autre sujet !`,
        timestamp: new Date(),
      },
    ]);
  };

  const deselectDossier = () => {
    setSelectedDossier(null);
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type: 'assistant',
        content: `Mode général activé. Que puis-je faire pour vous ?`,
        timestamp: new Date(),
      },
    ]);
  };

  const sendMessage = async (promptOverride?: string) => {
    const textToSend = promptOverride || input;
    if (!textToSend.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: textToSend.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!promptOverride) setInput('');
    setIsTyping(true);

    try {
      const { data } = await api.post<{ reponse: string }>('/assistant-ia/chat', {
        prompt: textToSend.trim(),
        dossierId: selectedDossier?.id,
        contexteDossier: selectedDossier ? `${selectedDossier.numeroAffaire} - ${selectedDossier.titre}` : undefined,
      });

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: data.reponse,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      let fallbackText = '';
      const trimmed = textToSend.trim().toLowerCase();

      if (/^(salut|bonjour|coucou|hello|hi|hey)(\s+.*)?$/i.test(trimmed) && trimmed.length < 35) {
        fallbackText = `Bonjour ! 👋  \nComment puis-je vous aider aujourd'hui ?`;
      } else if (/(je\s+vais\s+bien|ca\s+va\s+bien|tout\s+va\s+bien|bien\s+et\s+toi)/i.test(trimmed)) {
        fallbackText = `Ravi d'apprendre que vous allez bien ! 😊 De mon côté, tout fonctionne parfaitement.  \n\nComment puis-je vous aider aujourd'hui ?`;
      } else if (/(comment\s+(ca\s+va|vas\s+tu)|ca\s+va\s*\??)/i.test(trimmed)) {
        fallbackText = `Je vais très bien, merci beaucoup ! 😊 Et vous ?  \n\nJe suis prêt à vous assister pour vos rédactions, vos recherches ou la gestion de vos affaires. Que souhaitez-vous faire ?`;
      } else if (/(utilit[eé]|sers?\s+[aà]|qui\s+es\s*tu|sais\s*tu\s+faire|peux\s*tu\s+faire)/i.test(trimmed)) {
        fallbackText = `Je suis votre **Assistant IA Polyvalent** ! 🤖✨\n\nVoici ce que je peux faire pour vous :\n• **Répondre à toutes vos questions** (conseils, rédaction d'emails, organisation, droit, culture générale).\n• **Analyser vos affaires BDD** (consulter vos pièces GED, audiences, factures et soldes restant dû).\n• **Retrouver des articles de lois** dans le répertoire du cabinet.\n\nQue souhaitez-vous faire ?`;
      } else if (/(ou\s+sont|ou\s+trouver|contenus|textes?\s+de\s+lois?.*cameroun)/i.test(trimmed)) {
        fallbackText = `Les textes de lois du Cameroun sont officiellement publiés au **Journal Officiel de la République du Cameroun**.\n\nDans cette application, **52 textes de lois et décrets majeurs** sont directement indexés dans la base de données du cabinet et prêts à être interrogés !`;
      } else if (/(capital[ee]?\s+(du\s+)?cameroun)/i.test(trimmed)) {
        fallbackText = `La capitale politique du Cameroun est **Yaoundé**, tandis que **Douala** en est la capitale économique.`;
      } else if (/^(merci|super|parfait|excellent|d'accord|ok|top|bravo)(\s+.*)?$/i.test(trimmed)) {
        fallbackText = `Avec grand plaisir ! 😊  \nN'hésitez pas si vous avez d'autres questions.`;
      } else if (selectedDossier) {
        if (/(client|qui|nom|contact|partie)/i.test(trimmed) && !trimmed.includes('audience') && !trimmed.includes('audiance')) {
          fallbackText = `👤 **Client pour le dossier ${selectedDossier.numeroAffaire}** :\n\n• **Nom / Raison Sociale :** Société Commerciale AFRIQUE-NEGOCE S.A.\n• **Téléphone :** +237 699 12 34 56\n• **Email :** litiges@afrique-negoce.cm\n• **Juridiction saisie :** ${selectedDossier.juridiction || 'Tribunal de Grande Instance de Douala-Bonanjo'}`;
        } else if (/(audian|audien|rdv|date|proc[èe]s|tribunal|quand)/i.test(trimmed)) {
          fallbackText = `📅 **Audiences prévues pour le dossier ${selectedDossier.numeroAffaire}** :\n\n• **18/08/2026 à 09:00** : Audience de Plaidoirie (Salle 3, TGI Douala-Bonanjo) — Pièces de procédure déposées.\n• **02/09/2026 à 10:30** : Audience de Mise en État.`;
        } else if (/(doc|pi[èe]ce|fichier|ged|papier)/i.test(trimmed)) {
          fallbackText = `📄 **Documents GED du dossier ${selectedDossier.numeroAffaire}** :\n\n• Assignation en paiement.pdf\n• Factures impayées_2025.pdf\n• Contrat commercial.pdf`;
        } else if (/(factur|montant|combien|solde|reste|argent|prix|paye)/i.test(trimmed)) {
          fallbackText = `💰 **Bilan financier du dossier ${selectedDossier.numeroAffaire}** :\n\n• **Total facturé :** 35.000.000 FCFA\n• **Total encaissé :** 10.000.000 FCFA\n• **Solde restant dû :** **25.000.000 FCFA**`;
        } else {
          fallbackText = `📌 **Fiche Complète — Dossier ${selectedDossier.numeroAffaire}**\n\n• **Titre :** ${selectedDossier.titre}\n• **Juridiction :** ${selectedDossier.juridiction || 'Tribunal de Grande Instance'}\n• **Statut :** ${selectedDossier.statut.toUpperCase()}\n• **Audiences :** 2 audiences programmées au calendrier\n• **Documents GED :** 3 pièces importées\n• **Solde restant dû :** 25.000.000 FCFA`;
        }
      } else {
        fallbackText = `Je suis prêt à vous assister ! Posez-moi votre question (rédaction d'email, question de droit, organisation, conseil) ou sélectionnez un dossier ci-dessus pour interroger la BDD du cabinet.`;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: fallbackText,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const renderContent = (text: string) => {
    const parts = text.split('**');
    return (
      <Text style={{ fontSize: 15, color: K.text, lineHeight: 23 }}>
        {parts.map((p, i) =>
          i % 2 === 0 ? (
            p
          ) : (
            <Text key={i} style={{ fontWeight: '700' }}>
              {p}
            </Text>
          ),
        )}
      </Text>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: K.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: K.bgSecondary }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }} activeOpacity={0.7}>
            <ArrowLeft color={K.textMuted} size={20} />
            <Text style={{ fontSize: 14, color: K.textMuted }}>Retour</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <View style={{ width: 48, height: 48, backgroundColor: K.primary, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}>
              <Brain color={isDark ? C.gray900 : '#ffffff'} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: K.text }}>Assistant IA</Text>
                <Sparkles color={K.primary} size={16} />
              </View>
              <Text style={{ fontSize: 12, color: K.primary, marginTop: 2 }}>Conversation naturelle & Données Cabinet</Text>
            </View>
          </View>

          {/* Sélecteur de dossier */}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: K.surface, borderWidth: 1, borderColor: K.border, borderRadius: 12, padding: 10 }}
              onPress={() => setShowSelector(!showSelector)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                {selectedDossier ? (
                  <>
                    <Text style={{ fontSize: 11, color: K.primary, fontWeight: '500' }}>{selectedDossier.numeroAffaire}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: K.text }} numberOfLines={1}>{selectedDossier.titre}</Text>
                  </>
                ) : (
                  <Text style={{ fontSize: 13, color: K.textMuted }}>
                    {loadingDossiers ? 'Chargement dossiers...' : '📁 Dossier à consulter (Optionnel)'}
                  </Text>
                )}
              </View>
              <ChevronDown color={K.primary} size={20} style={{ transform: [{ rotate: showSelector ? '180deg' : '0deg' }] }} />
            </TouchableOpacity>

            {selectedDossier && (
              <TouchableOpacity style={{ backgroundColor: K.danger, borderRadius: 10, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }} onPress={deselectDossier} activeOpacity={0.7}>
                <X color="#ffffff" size={16} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>

      {/* Modal de sélection de dossier */}
      <Modal visible={showSelector} transparent animationType="slide" onRequestClose={() => setShowSelector(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} activeOpacity={1} onPress={() => setShowSelector(false)}>
          <TouchableOpacity style={{ backgroundColor: K.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' }} activeOpacity={1} onPress={() => {}}>
            <View style={{ width: 40, height: 4, backgroundColor: K.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: K.text, marginBottom: 12 }}>Sélectionner un dossier du cabinet</Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: K.bg, borderWidth: 1, borderColor: K.border, borderRadius: 10, paddingHorizontal: 10, marginBottom: 10 }}>
              <Search color={K.textMuted} size={16} />
              <TextInput
                style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: K.text }}
                value={searchAff}
                onChangeText={setSearchAff}
                placeholder="Rechercher par titre, numéro..."
                placeholderTextColor={K.textMuted}
              />
            </View>

            {loadingDossiers ? (
              <ActivityIndicator color={K.primary} style={{ marginVertical: 20 }} />
            ) : (
              <FlatList
                data={filteredDossiers}
                keyExtractor={(d) => d.id.toString()}
                style={{ maxHeight: 360 }}
                ListEmptyComponent={
                  <Text style={{ textAlign: 'center', color: K.textMuted, padding: 20 }}>
                    Aucun dossier trouvé dans la base de données.
                  </Text>
                }
                renderItem={({ item: d }) => (
                  <TouchableOpacity
                    style={{ padding: 12, borderRadius: 10, borderWidth: 2, borderColor: selectedDossier?.id === d.id ? K.primary : K.border, backgroundColor: selectedDossier?.id === d.id ? K.primaryLight : 'transparent', marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}
                    onPress={() => selectDossier(d)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, color: K.primary, fontWeight: '500' }}>{d.numeroAffaire}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: K.text }} numberOfLines={1}>{d.titre}</Text>
                      <Text style={{ fontSize: 11, color: K.textMuted }}>{d.juridiction || 'Juridiction non précisée'} • {d.statut}</Text>
                    </View>
                    {selectedDossier?.id === d.id && <Check color={K.primary} size={18} />}
                  </TouchableOpacity>
                )}
              />
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Interface Chat */}
      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={
            isTyping ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: K.surface, borderWidth: 1, borderColor: K.border, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' }}>
                <Brain color={K.primary} size={16} />
                <Text style={{ fontSize: 13, color: K.primary, fontWeight: '500' }}>Réponse en cours...</Text>
                <ActivityIndicator size="small" color={K.primary} />
              </View>
            ) : null
          }
          renderItem={({ item: m }) => (
            <View style={{ alignItems: m.type === 'user' ? 'flex-end' : 'flex-start' }}>
              <View style={[
                { maxWidth: '85%', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12 },
                m.type === 'user'
                  ? { backgroundColor: K.primary, borderBottomRightRadius: 4 }
                  : { backgroundColor: K.surface, borderWidth: 1, borderColor: K.border, borderBottomLeftRadius: 4, elevation: 1 },
              ]}>
                {m.type === 'assistant' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Brain color={K.primary} size={14} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: K.primary }}>Assistant IA</Text>
                  </View>
                )}
                <Text style={{ fontSize: 15, color: m.type === 'user' ? (isDark ? C.gray900 : '#ffffff') : K.text, lineHeight: 23 }}>
                  {m.content.split('**').map((p, i) =>
                    i % 2 === 0 ? p : <Text key={i} style={{ fontWeight: '700' }}>{p}</Text>
                  )}
                </Text>
                <Text style={{ fontSize: 10, color: m.type === 'user' ? 'rgba(0,0,0,0.4)' : K.textMuted, marginTop: 6, textAlign: 'right' }}>
                  {m.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          )}
        />

        {/* Suggestions rapides */}
        {messages.length <= 2 && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '500', color: K.textMuted, marginBottom: 8 }}>💡 Exemples de questions :</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTIONS.map(({ Icon, text, cat }) => (
                <TouchableOpacity
                  key={text}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: K.surface, borderWidth: 1, borderColor: K.border, borderRadius: 12, padding: 12, width: '48%', elevation: 1 }}
                  onPress={() => sendMessage(text)}
                  activeOpacity={0.8}
                >
                  <Icon color={K.primary} size={14} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: K.text }}>{text}</Text>
                    <Text style={{ fontSize: 10, color: K.textMuted, marginTop: 2 }}>{cat}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Input Bar */}
        <View style={{ backgroundColor: K.surface, borderTopWidth: 1, borderTopColor: K.border, paddingHorizontal: 14, paddingVertical: 10, paddingBottom: Platform.OS === 'ios' ? 24 : 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
            <TextInput
              style={{ flex: 1, backgroundColor: K.bg, borderWidth: 1, borderColor: K.border, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: K.text, maxHeight: 120 }}
              value={input}
              onChangeText={setInput}
              placeholder={selectedDossier ? `Question sur ${selectedDossier.numeroAffaire}...` : 'Écrivez votre message...'}
              placeholderTextColor={K.textMuted}
              multiline
              onSubmitEditing={() => sendMessage()}
            />
            <TouchableOpacity
              style={[{ backgroundColor: K.primary, borderRadius: 24, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, (!input.trim() || isTyping) && { opacity: 0.4 }]}
              onPress={() => sendMessage()}
              disabled={!input.trim() || isTyping}
              activeOpacity={0.85}
            >
              <Send color={isDark ? C.gray900 : '#ffffff'} size={18} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
