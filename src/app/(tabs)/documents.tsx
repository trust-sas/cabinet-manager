/**
 * src/app/(tabs)/documents.tsx
 * ─────────────────────────────────────────────────────────────────
 * Onglet Fusionné : GED & Assistant IA Juridique
 *
 * Contient 2 sous-onglets :
 *  1. 📁 Documents & GED (Stockage, Recherche, Filtres, Téléversement, Téléchargement & Consultation externe)
 *  2. 🤖 Assistant IA (Analyse d'affaires, Jurisprudence, Rédaction de conclusions & Conseils juridiques)
 * ─────────────────────────────────────────────────────────────────
 */

import { AppColors as C } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useDocuments } from '@/hooks/useDocuments';
import { useDossiers } from '@/hooks/useDossiers';
import { useAudiences } from '@/hooks/useAudiences';
import { useAuth } from '@/hooks/useAuth';
import { extractErrorMessage } from '@/lib/api';
import { Document, getDocumentDownloadUrl, getDocumentAccessStatus, demanderAccesDocument } from '@/services/documents.service';
import { hasDossierAccess } from '@/services/dossierInvitations.service';
import { apercuAvecAppCompatible, telechargerDansTelephone } from '@/lib/fileViewerManager';
import { getAccessToken } from '@/lib/secureStorage';
import * as DocumentPicker from 'expo-document-picker';
import { cacheDirectory, downloadAsync, getInfoAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import api from '@/lib/api';
import {
  AlertTriangle, Archive, Brain, Calendar, Camera, Check, ChevronDown, Download,
  ExternalLink, Eye, File as FileIcon, FileText, FilmIcon, FolderOpen,
  Image as ImageIcon, Music, Paperclip, Plus, Scale, Scan, Search, Send, Shield, ShieldAlert,
  ShieldCheck, Sparkles, Trash2, Upload, X,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform,
  RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ── Types GED ─────────────────────────────────────────────────────────────────
type Confidentialite = 'public' | 'confidentiel' | 'secret';

function formatSize(ko: number | null): string {
  if (!ko) return '—';
  if (ko < 1024) return `${ko} Ko`;
  return `${(ko / 1024).toFixed(1)} Mo`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function getMimeIcon(type: string | null) {
  if (!type) return FileIcon;
  if (type.startsWith('image/')) return ImageIcon;
  if (type.startsWith('video/')) return FilmIcon;
  if (type.startsWith('audio/')) return Music;
  if (type.includes('pdf') || type.includes('word') || type.includes('text')) return FileText;
  if (type.includes('zip') || type.includes('tar') || type.includes('rar')) return Archive;
  return FileIcon;
}

const CONFIDENTIALITE_CONFIG: Record<Confidentialite, { label: string; color: string; bg: string; Icon: any }> = {
  public:       { label: 'Public',       color: C.green600,   bg: C.green50,   Icon: ShieldCheck },
  confidentiel: { label: 'Confidentiel', color: C.amber600,   bg: C.amber50,   Icon: Shield },
  secret:       { label: 'Secret',       color: C.red600,     bg: C.red50,     Icon: ShieldAlert },
};

const FILTRES_GED: Array<{ id: Confidentialite | 'all'; label: string }> = [
  { id: 'all',         label: 'Tous' },
  { id: 'public',      label: 'Public' },
  { id: 'confidentiel', label: 'Confidentiel' },
  { id: 'secret',      label: 'Secret' },
];

// ── Types IA ──────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const IA_SUGGESTIONS = [
  { Icon: FileText,      text: 'Résume cette affaire',                 cat: 'Analyse' },
  { Icon: Calendar,      text: 'Prépare-moi pour la prochaine audience', cat: 'Audience' },
  { Icon: Scale,         text: 'Textes légaux et jurisprudence ?',     cat: 'Législation' },
  { Icon: AlertTriangle, text: 'Analyse les risques juridiques',        cat: 'Risques' },
  { Icon: Shield,        text: 'Recommandations de défense',            cat: 'Stratégie' },
];

export default function DocumentsScreen() {
  const { colors: K, isDark } = useTheme();
  // ── Onglet actif principal : GED vs IA ───────────────────────────────────────
  const [mainTab, setMainTab] = useState<'ged' | 'ia'>('ged');

  // ── States GED ─────────────────────────────────────────────────────────────
  const { user } = useAuth();
  const [searchQuery,   setSearchQuery]   = useState('');
  const [activeFilter,  setActiveFilter]  = useState<Confidentialite | 'all'>('all');
  const [uploading,     setUploading]     = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [previewDoc,    setPreviewDoc]    = useState<Document | null>(null);
  const [refreshing,    setRefreshing]    = useState(false);

  // Modal Demande de Permission pour Document Secret
  const [secretDocModal, setSecretDocModal] = useState<{
    visible: boolean;
    doc: Document | null;
    hasPending: boolean;
    loading: boolean;
  }>({
    visible: false,
    doc: null,
    hasPending: false,
    loading: false,
  });

  const { documents, isLoading, total, refetch, remove } = useDocuments({
    confidentialite: activeFilter !== 'all' ? activeFilter : undefined,
    search: searchQuery.length >= 2 ? searchQuery : undefined,
  });

  // ── States Import Document (Drive, Photo, Scan, Dossier) ───────────────────
  const [showUploadModal,      setShowUploadModal]      = useState(false);
  const [selectedFileUri,      setSelectedFileUri]      = useState<string | null>(null);
  const [selectedFileName,     setSelectedFileName]     = useState<string>('');
  const [selectedFileType,     setSelectedFileType]     = useState<string>('application/pdf');
  const [uploadNom,            setUploadNom]            = useState('');
  const [uploadConfidentialite,setUploadConfidentialite]= useState<Confidentialite>('public');
  const [uploadDossierId,      setUploadDossierId]      = useState<number | undefined>(undefined);

  const { dossiers }  = useDossiers({ pageSize: 50 });
  const { audiences } = useAudiences({ pageSize: 50 });

  // ── States IA ──────────────────────────────────────────────────────────────
  const [selectedDossier, setSelectedDossier] = useState<any | null>(null);
  const [showDossierModal, setShowDossierModal] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      type: 'assistant',
      content: "Bonjour Maître ! Je suis votre **Assistant IA Juridique**. Sélectionnez une affaire ou posez directement votre question ci-dessous.",
      timestamp: new Date(),
    },
  ]);
  const [iaInput, setIaInput]   = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [keyboardSpace, setKeyboardSpace] = useState(0);
  const chatScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardSpace(e.endCoordinates.height);
        setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
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

  // ── Handlers GED & Import Document ─────────────────────────────────────────
  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      setSelectedFileUri(asset.uri);
      setSelectedFileName(asset.name);
      setSelectedFileType(asset.mimeType ?? 'application/octet-stream');
      setUploadNom(asset.name);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'L\'accès à l\'appareil photo est nécessaire.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const name = `Photo_${Date.now()}.jpg`;
      setSelectedFileUri(asset.uri);
      setSelectedFileName(name);
      setSelectedFileType('image/jpeg');
      setUploadNom(name);
    } catch (e: any) {
      Alert.alert('Erreur photo', e?.message);
    }
  };

  const handleScanDocument = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.9, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const name = `Scan_${Date.now()}.jpg`;
      setSelectedFileUri(asset.uri);
      setSelectedFileName(name);
      setSelectedFileType('image/jpeg');
      setUploadNom(name);
    } catch (e: any) {
      Alert.alert('Erreur scan', e?.message);
    }
  };

  const handleSaveUpload = async () => {
    if (!selectedFileUri) {
      Alert.alert('Erreur', 'Veuillez sélectionner, photographier ou numériser un fichier d\'abord.');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: selectedFileUri,
        name: selectedFileName || 'document.pdf',
        type: selectedFileType,
      } as unknown as Blob);

      if (uploadNom.trim()) formData.append('nom', uploadNom.trim());
      formData.append('confidentialite', uploadConfidentialite);
      if (uploadDossierId) formData.append('dossierId', String(uploadDossierId));

      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setShowUploadModal(false);
      setSelectedFileUri(null);
      setUploadNom('');
      refetch();
      Alert.alert('Succès', 'Document importé et enregistré avec succès.');
    } catch (err: any) {
      Alert.alert('Erreur d\'upload', err?.message ?? 'Une erreur est survenue');
    } finally {
      setUploading(false);
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleUpload = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setUploading(true);

      const formData = new FormData();
      formData.append('file', {
        uri:  asset.uri,
        name: asset.name,
        type: asset.mimeType ?? 'application/octet-stream',
      } as unknown as Blob);

      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      await refetch();
      Alert.alert('✅ Succès', `"${asset.name}" a été téléversé avec succès.`);
    } catch (err: any) {
      Alert.alert('Erreur d\'upload', err?.message ?? 'Une erreur est survenue');
    } finally {
      setUploading(false);
    }
  }, [refetch]);

  const checkSecretAccessAndExecute = useCallback(async (doc: Document, action: () => void) => {
    if (doc.confidentialite !== 'secret') {
      action();
      return;
    }

    if (doc.creePar && Number(doc.creePar) === Number(user?.id)) {
      action();
      return;
    }

    try {
      const status = await getDocumentAccessStatus(doc.id);
      if (status.canAccess) {
        action();
        return;
      }

      setSecretDocModal({
        visible: true,
        doc,
        hasPending: status.hasPendingRequest,
        loading: false,
      });
    } catch {
      setSecretDocModal({
        visible: true,
        doc,
        hasPending: false,
        loading: false,
      });
    }
  }, [user]);

  const handleDemanderAccesSecret = async () => {
    if (!secretDocModal.doc) return;
    setSecretDocModal(prev => ({ ...prev, loading: true }));
    try {
      const res = await demanderAccesDocument(secretDocModal.doc.id);
      setSecretDocModal(prev => ({ ...prev, loading: false, hasPending: true }));
      Alert.alert(
        'Demande transmise',
        res.message || 'Votre demande d\'autorisation a été envoyée au créateur du dossier.',
      );
    } catch (e) {
      setSecretDocModal(prev => ({ ...prev, loading: false }));
      Alert.alert('Erreur', extractErrorMessage(e));
    }
  };

  const handleDownload = useCallback(async (doc: Document) => {
    checkSecretAccessAndExecute(doc, async () => {
      if (downloadingId === doc.id) return;
      setDownloadingId(doc.id);
      try {
        const url = getDocumentDownloadUrl(doc.id);
        await telechargerDansTelephone(url, doc.nom, doc.typeDocument ?? 'application/pdf');
      } finally {
        setDownloadingId(null);
      }
    });
  }, [downloadingId, checkSecretAccessAndExecute]);

  const handleApercu = useCallback(async (doc: Document) => {
    checkSecretAccessAndExecute(doc, async () => {
      const url = getDocumentDownloadUrl(doc.id);
      await apercuAvecAppCompatible(url, doc.nom, doc.typeDocument ?? 'application/pdf');
    });
  }, [checkSecretAccessAndExecute]);

  const handleDeleteDoc = useCallback((doc: Document) => {
    Alert.alert(
      'Supprimer le document',
      `Voulez-vous supprimer "${doc.nom}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            try {
              await remove(doc.id);
              if (previewDoc?.id === doc.id) setPreviewDoc(null);
            } catch (err: any) {
              Alert.alert('Erreur', err?.message);
            }
          },
        },
      ],
    );
  }, [remove, previewDoc]);

  // ── Handlers IA ────────────────────────────────────────────────────────────
  const handleSelectDossier = (d: any) => {
    setSelectedDossier(d);
    setShowDossierModal(false);
    setMessages([
      {
        id: Date.now().toString(),
        type: 'assistant',
        content: `J'ai chargé le dossier **${d.titre}** (${d.numeroAffaire}).\n\n📊 **Contexte :** Juridiction ${d.juridiction || 'non spécifiée'} · Statut: ${d.statut}\n\nQue souhaitez-vous analyser ?`,
        timestamp: new Date(),
      },
    ]);
  };

  const handleSendIaMessage = async (textToSend?: string) => {
    const query = textToSend || iaInput;
    if (!query.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), type: 'user', content: query, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setIaInput('');
    setIsTyping(true);

    try {
      const { data } = await api.post<{ reponse: string }>('/assistant-ia/chat', {
        prompt: query,
        contexteDossier: selectedDossier ? selectedDossier.titre : undefined,
      });
      if (data?.reponse) {
        setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), type: 'assistant', content: data.reponse, timestamp: new Date() }]);
        setIsTyping(false);
        return;
      }
    } catch {
      // En cas d'indisponibilité du backend, utiliser la réponse de secours
    }

    setTimeout(() => {
      let resp = "";
      const lower = query.toLowerCase();
      const dossierName = selectedDossier ? selectedDossier.titre : 'dossier global';

      if (lower.includes('résum') || lower.includes('resume')) {
        resp = `**📋 Résumé Juridique — ${dossierName}**\n\n• **Juridiction :** ${selectedDossier?.juridiction || 'TGI de Yaoundé'}\n• **Statut :** ${selectedDossier?.statut || 'En cours'}\n• **Pièces numérisées :** ${documents.length} document(s) présent(s) en GED.\n\n**Recommandation :** Le dossier comporte les éléments de preuve principaux. Procéder à la synthèse des conclusions.`;
      } else if (lower.includes('audience') || lower.includes('prépare')) {
        resp = `**📅 Préparation de la Prochaine Audience**\n\n1. **Vérification des Pièces** : ${documents.length} pièces archivées en GED.\n2. **Bordereau** : S'assurer de la notification au confrère adverse 48h avant.\n3. **Moyens de Droit** : Invoquer l'exception d'irrecevabilité et les dispositions légales applicables.`;
      } else if (lower.includes('loi') || lower.includes('texte') || lower.includes('légal') || lower.includes('ohada')) {
        resp = `**📚 Références Légales & Jurisprudence**\n\n• Code de Procédure Civile et Commerciale du Cameroun\n• Actes Uniformes OHADA applicables au contentieux des affaires\n• Loi n° 2006/015 sur l'organisation judiciaire\n\n_Note : Vérifier l'applicabilité des textes spécifiques aux faits de la cause._`;
      } else {
        resp = `J'ai analysé votre requête concernant **${dossierName}**.\n\nEn m'appuyant sur les pièces enregistrées en GED et la réglementation en vigueur, je vous recommande d'articuler votre moyen de défense sur les pièces probantes et la jurisprudence constante.`;
      }

      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), type: 'assistant', content: resp, timestamp: new Date() }]);
      setIsTyping(false);
    }, 800);
  };

  return (
    <KeyboardAvoidingView style={[s.root, { backgroundColor: K.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={K.bgSecondary} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: K.bgSecondary }}>
        {/* Header Executive Fusionne */}
        <View style={[s.headerBar, { backgroundColor: K.bgSecondary }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTitleMain, { color: K.text }]}>Documents & IA</Text>
            <Text style={s.headerSubMain}>Gestion documentaire et intelligence juridique</Text>
          </View>
        </View>

        {/* Sous-Onglets Navigation : Documents vs IA */}
        <View style={[s.tabNavRow, { backgroundColor: K.bgSecondary }]}>
          <TouchableOpacity
            style={[s.tabNavBtn, { backgroundColor: K.bgTertiary }, mainTab === 'ged' && s.tabNavBtnActive]}
            onPress={() => setMainTab('ged')}
            activeOpacity={0.8}
          >
            <FolderOpen color={mainTab === 'ged' ? (isDark ? C.gray900 : '#ffffff') : K.textMuted} size={16} />
            <Text style={[s.tabNavText, { color: K.textMuted }, mainTab === 'ged' && s.tabNavTextActive]}>Documents</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.tabNavBtn, { backgroundColor: K.bgTertiary }, mainTab === 'ia' && s.tabNavBtnActive]}
            onPress={() => setMainTab('ia')}
            activeOpacity={0.8}
          >
            <Brain color={mainTab === 'ia' ? C.amber500 : K.textMuted} size={16} />
            <Text style={[s.tabNavText, { color: K.textMuted }, mainTab === 'ia' && s.tabNavTextActive]}>Assistant IA</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* ── MODE 1 : GED DOCUMENTS ── */}
      {mainTab === 'ged' && (
        <View style={{ flex: 1 }}>
          {/* Recherche & Téléversement */}
          <View style={[s.searchBarRow, { backgroundColor: K.surface, borderBottomColor: K.border }]}>
            <View style={[s.searchBox, { backgroundColor: K.bg }]}>
              <Search color={K.textMuted} size={16} />
              <TextInput
                style={[s.searchInput, { color: K.text }]}
                placeholder="Rechercher un document…"
                placeholderTextColor={K.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <X color={K.textMuted} size={16} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={s.uploadBtn} onPress={() => setShowUploadModal(true)} disabled={uploading} activeOpacity={0.8}>
              {uploading ? <ActivityIndicator size={16} color={isDark ? C.gray900 : '#ffffff'} /> : <Upload color={isDark ? C.gray900 : '#ffffff'} size={16} />}
              <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? C.gray900 : '#ffffff', marginLeft: 4 }}>+ Importer</Text>
            </TouchableOpacity>
          </View>

          {/* Filtres Confidentialité */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44 }} contentContainerStyle={[s.filtresRow, { backgroundColor: K.surface }]}>
            {FILTRES_GED.map(f => {
              const active = activeFilter === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  style={[s.filterChip, { backgroundColor: K.bgTertiary }, active && s.filterChipActive]}
                  onPress={() => setActiveFilter(f.id)}
                >
                  <Text style={[s.filterChipText, { color: K.textSecondary }, active && s.filterChipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Liste Documents */}
          <FlatList
            data={documents.filter(doc => {
              const isPublic = doc.confidentialite === 'public';
              const hasAccess = !doc.dossierId || hasDossierAccess(doc.dossierId);
              if (!isPublic && !hasAccess) return false;
              if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                if (!doc.nom.toLowerCase().includes(q) && !(doc.description || '').toLowerCase().includes(q)) return false;
              }
              if (activeFilter !== 'all' && doc.confidentialite !== activeFilter) return false;
              return true;
            })}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={s.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.amber500} />}
            ListEmptyComponent={
              isLoading ? (
                <View style={s.center}><ActivityIndicator color={K.primary} size="large" /></View>
              ) : (
                <View style={s.center}>
                  <FolderOpen color={K.textMuted} size={44} />
                  <Text style={[s.emptyText, { color: K.textMuted }]}>Aucun document en GED</Text>
                </View>
              )
            }
            renderItem={({ item: doc }) => {
              const conf = CONFIDENTIALITE_CONFIG[doc.confidentialite as Confidentialite] ?? CONFIDENTIALITE_CONFIG.public;
              const MimeIcon = getMimeIcon(doc.typeDocument);
              return (
                <TouchableOpacity
                  style={[s.docCard, { backgroundColor: K.surface, borderColor: K.border }]}
                  onPress={() => checkSecretAccessAndExecute(doc, () => setPreviewDoc(doc))}
                  activeOpacity={0.85}
                >
                  <View style={[s.docIconWrap, { backgroundColor: K.primaryLight }]}><MimeIcon color={K.primary} size={22} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.docName, { color: K.text }]} numberOfLines={1}>{doc.nom}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <View style={[s.confBadge, { backgroundColor: conf.bg }]}>
                        <Text style={[s.confBadgeText, { color: conf.color }]}>{conf.label}</Text>
                      </View>
                      <Text style={[s.docMetaText, { color: K.textMuted }]}>{formatSize(doc.tailleKo)} · {formatDate(doc.createdAt)}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={[s.actionIconBtn, { backgroundColor: K.successLight }]} onPress={() => handleDownload(doc)}>
                    <Download color={K.success} size={16} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* ── MODE 2 : ASSISTANT IA JURIDIQUE ── */}
      {mainTab === 'ia' && (
        <View style={{ flex: 1, backgroundColor: K.bg }}>
          {/* Sélecteur de Dossier pour l'IA */}
          <TouchableOpacity style={[s.dossierSelectorBar, { backgroundColor: K.surface, borderBottomColor: K.border }]} onPress={() => setShowDossierModal(true)} activeOpacity={0.8}>
            <Scale color={K.primary} size={18} />
            <Text style={[s.dossierSelectorText, { color: K.text }]} numberOfLines={1}>
              {selectedDossier ? `Affaire : ${selectedDossier.titre}` : 'Sélectionner un dossier d\'affaire à analyser…'}
            </Text>
            <ChevronDown color={K.textMuted} size={16} />
          </TouchableOpacity>

          {/* Suggestions rapides */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 50 }} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingVertical: 6 }}>
            {IA_SUGGESTIONS.map((sug, idx) => (
              <TouchableOpacity key={idx} style={[s.sugChip, { backgroundColor: K.primaryLight, borderColor: K.primary }]} onPress={() => handleSendIaMessage(sug.text)} activeOpacity={0.8}>
                <sug.Icon color={K.primary} size={13} />
                <Text style={[s.sugText, { color: K.primary }]}>{sug.text}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Liste des Messages IA */}
          <ScrollView
            ref={chatScrollRef}
            style={{ flex: 1, padding: 12 }}
            contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
            onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.map(m => (
              <View key={m.id} style={[s.msgBubble, m.type === 'user' ? [s.msgUser, { backgroundColor: K.primary }] : [s.msgAssistant, { backgroundColor: K.surface, borderColor: K.border }]]}>
                {m.type === 'assistant' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Brain color={K.primary} size={14} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: K.primary }}>IA Cabinet Manager</Text>
                  </View>
                )}
                <Text style={[s.msgText, { color: m.type === 'user' ? (isDark ? C.gray900 : '#ffffff') : K.text }]}>{m.content}</Text>
              </View>
            ))}
            {isTyping && (
              <View style={[s.msgBubble, s.msgAssistant, { backgroundColor: K.surface, borderColor: K.border, flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
                <ActivityIndicator size="small" color={K.primary} />
                <Text style={{ fontSize: 12, color: K.textMuted }}>Analyse juridique en cours…</Text>
              </View>
            )}
          </ScrollView>

          {/* Saisie Question IA */}
          <View style={[
            s.inputBar,
            {
              backgroundColor: K.surface,
              borderTopColor: K.border,
              paddingBottom: Platform.OS === 'ios' ? 24 : (keyboardSpace > 0 ? keyboardSpace + 10 : 12),
            }
          ]}>
            <TextInput
              style={[s.iaTextInput, { backgroundColor: K.bg, color: K.text }]}
              value={iaInput}
              onChangeText={setIaInput}
              placeholder="Posez une question à l'IA..."
              placeholderTextColor={K.textMuted}
              onFocus={() => {
                setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 150);
              }}
              onSubmitEditing={() => handleSendIaMessage()}
            />
            <TouchableOpacity style={s.sendBtn} onPress={() => handleSendIaMessage()} activeOpacity={0.8}>
              <Send color={isDark ? C.gray900 : '#ffffff'} size={18} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modal Consultation Document GED */}
      <Modal visible={previewDoc !== null} transparent animationType="slide" onRequestClose={() => setPreviewDoc(null)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setPreviewDoc(null)}>
          <TouchableOpacity style={[s.sheet, { backgroundColor: K.surface }]} activeOpacity={1} onPress={() => {}}>
            <View style={[s.handle, { backgroundColor: K.border }]} />
            {previewDoc && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[s.previewTitle, { color: K.text }]}>{previewDoc.nom}</Text>
                <Text style={[s.previewSub, { color: K.textMuted }]}>{formatSize(previewDoc.tailleKo)} · {previewDoc.typeDocument || 'Fichier'}</Text>
                <TouchableOpacity style={s.mainActionBtn} onPress={() => handleApercu(previewDoc)}>
                  <ExternalLink color={isDark ? C.gray900 : '#ffffff'} size={18} />
                  <Text style={s.mainActionText}>Aperçu via une application compatible</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.mainActionBtnSecondary} onPress={() => handleDownload(previewDoc)}>
                  <Download color={C.gray900} size={18} />
                  <Text style={[s.mainActionText, { color: C.gray900 }]}>Télécharger dans les fichiers du téléphone</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.deleteBtn} onPress={() => handleDeleteDoc(previewDoc)}>
                  <Trash2 color={K.danger} size={16} />
                  <Text style={[s.deleteText, { color: K.danger }]}>Supprimer du cabinet</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.cancelBtn, { borderColor: K.border }]} onPress={() => setPreviewDoc(null)}>
                  <Text style={[s.cancelText, { color: K.textMuted }]}>Fermer</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Modal Sélection Dossier pour l'IA */}
      <Modal visible={showDossierModal} transparent animationType="slide" onRequestClose={() => setShowDossierModal(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowDossierModal(false)}>
          <TouchableOpacity style={[s.sheet, { backgroundColor: K.surface }]} activeOpacity={1} onPress={() => {}}>
            <View style={[s.handle, { backgroundColor: K.border }]} />
            <Text style={{ fontSize: 16, fontWeight: '700', color: K.text, marginBottom: 12 }}>Sélectionner une affaire à analyser</Text>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {dossiers.map(d => (
                <TouchableOpacity key={d.id} style={[s.dossierSelectOption, { borderBottomColor: K.border }]} onPress={() => handleSelectDossier(d)}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: K.text }}>{d.numeroAffaire} — {d.titre}</Text>
                  <Text style={{ fontSize: 11, color: K.textMuted }}>{d.juridiction || 'Non spécifiée'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      {/* Modal Import Document (Drive, Photo, Scan, Dossier) */}
      <Modal visible={showUploadModal} transparent animationType="slide" onRequestClose={() => setShowUploadModal(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowUploadModal(false)}>
          <TouchableOpacity style={[s.sheet, { backgroundColor: K.surface }]} activeOpacity={1} onPress={() => {}}>
            <View style={[s.handle, { backgroundColor: K.border }]} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: K.text, marginBottom: 14 }}>Importer un document</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Options de Captures / Importation */}
              <Text style={{ fontSize: 13, fontWeight: '600', color: K.textSecondary, marginBottom: 8 }}>Source du document</Text>
              <View style={{ gap: 8, marginBottom: 16 }}>

                {/* Option 1: Drive / Stockage */}
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: K.primaryLight, borderWidth: 1, borderColor: K.primary, borderRadius: 12, padding: 12 }} onPress={handlePickDocument} activeOpacity={0.8}>
                  <Paperclip color={K.primary} size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: K.text }}>Stockage interne ou Drive</Text>
                    <Text style={{ fontSize: 11, color: K.textMuted, marginTop: 2 }}>Fichiers PDF, Word, Excel, Images</Text>
                  </View>
                </TouchableOpacity>

                {/* Option 2: Prendre une Photo */}
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: K.infoLight, borderWidth: 1, borderColor: K.info, borderRadius: 12, padding: 12 }} onPress={handleTakePhoto} activeOpacity={0.8}>
                  <Camera color={K.info} size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: K.text }}>Prendre une photo</Text>
                    <Text style={{ fontSize: 11, color: K.textMuted, marginTop: 2 }}>Photographier une pièce ou un document physique</Text>
                  </View>
                </TouchableOpacity>

                {/* Option 3: Numériser / Scanner */}
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: K.successLight, borderWidth: 1, borderColor: K.success, borderRadius: 12, padding: 12 }} onPress={handleScanDocument} activeOpacity={0.8}>
                  <Scan color={K.success} size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: K.text }}>Numériser / Scanner un document</Text>
                    <Text style={{ fontSize: 11, color: K.textMuted, marginTop: 2 }}>Scan haute précision générant un document propre</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Fichier Sélectionné */}
              {selectedFileName ? (
                <View style={{ backgroundColor: K.bgTertiary, padding: 10, borderRadius: 10, marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: K.text }}>Fichier : {selectedFileName}</Text>
                </View>
              ) : null}

              {/* Nom du document */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: K.text, marginBottom: 6 }}>Intitulé du document</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: K.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: K.text, backgroundColor: K.inputBg }}
                  value={uploadNom}
                  onChangeText={setUploadNom}
                  placeholder="Nom de la pièce ou de l'acte..."
                  placeholderTextColor={K.textMuted}
                />
              </View>

              {/* Confidentialité */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: K.text, marginBottom: 6 }}>Niveau de Confidentialité</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['public', 'confidentiel', 'secret'] as Confidentialite[]).map(conf => (
                    <TouchableOpacity
                      key={conf}
                      onPress={() => setUploadConfidentialite(conf)}
                      style={[
                        { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: K.bgTertiary, borderWidth: 1, borderColor: K.border },
                        uploadConfidentialite === conf && { backgroundColor: K.primary, borderColor: K.primary },
                      ]}
                    >
                      <Text style={[{ fontSize: 12, fontWeight: '500', color: K.textSecondary }, uploadConfidentialite === conf && { color: isDark ? C.gray900 : '#ffffff', fontWeight: '700' }]}>
                        {conf.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Sélection Dossier (Optionnel) */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: K.text, marginBottom: 6 }}>Rattacher à un dossier (Optionnel)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {dossiers.map(d => (
                    <TouchableOpacity
                      key={d.id}
                      onPress={() => setUploadDossierId(Number(d.id))}
                      style={[
                        { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: K.bgTertiary, borderWidth: 1, borderColor: K.border },
                        Number(uploadDossierId) === Number(d.id) && { backgroundColor: K.primaryLight, borderColor: K.primary },
                      ]}
                    >
                      <Text style={[{ fontSize: 12, color: K.textSecondary }, Number(uploadDossierId) === Number(d.id) && { color: K.primary, fontWeight: '700' }]}>
                        {d.numeroAffaire} — {d.titre}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <TouchableOpacity
                style={[{ backgroundColor: K.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }, uploading && { opacity: 0.6 }]}
                onPress={handleSaveUpload}
                disabled={uploading}
                activeOpacity={0.85}
              >
                {uploading ? <ActivityIndicator color={isDark ? C.gray900 : '#ffffff'} /> : <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? C.gray900 : '#ffffff' }}>Enregistrer le document</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={{ borderWidth: 1, borderColor: K.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 }} onPress={() => setShowUploadModal(false)} activeOpacity={0.8}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: K.textMuted }}>Annuler</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      {/* ── MODAL PERMISSION DOCUMENT SECRET ── */}
      <Modal
        visible={secretDocModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setSecretDocModal(prev => ({ ...prev, visible: false }))}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
          activeOpacity={1}
          onPress={() => setSecretDocModal(prev => ({ ...prev, visible: false }))}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              backgroundColor: K.surface, borderRadius: 20, padding: 22,
              width: '100%', maxWidth: 420, borderWidth: 1, borderColor: K.border,
            }}
          >
            {/* Header with Icon */}
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{
                width: 64, height: 64, borderRadius: 32,
                backgroundColor: C.purple100, alignItems: 'center', justifyContent: 'center',
                marginBottom: 12, borderWidth: 2, borderColor: C.purple300,
              }}>
                <ShieldAlert color={C.purple700} size={30} />
              </View>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: C.purple50, paddingHorizontal: 10, paddingVertical: 4,
                borderRadius: 20, borderWidth: 1, borderColor: C.purple200, marginBottom: 8,
              }}>
                <ShieldAlert color={C.purple600} size={13} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.purple700, letterSpacing: 0.5 }}>
                  CONFIDENTIALITÉ : SECRET
                </Text>
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: K.text, textAlign: 'center' }}>
                Document classé Secret
              </Text>
            </View>

            {/* Document Info Card */}
            <View style={{
              backgroundColor: K.bgTertiary, borderRadius: 12, padding: 14,
              borderWidth: 1, borderColor: K.border, marginBottom: 16,
            }}>
              <Text style={{ fontSize: 12, color: K.textMuted, fontWeight: '600', marginBottom: 4 }}>
                PIÈCE SOUMISE À RESTRICTION :
              </Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: K.text }} numberOfLines={2}>
                {secretDocModal.doc?.nom || 'Document secret'}
              </Text>
              {secretDocModal.doc?.tailleKo ? (
                <Text style={{ fontSize: 12, color: K.textMuted, marginTop: 4 }}>
                  Taille : {secretDocModal.doc.tailleKo} Ko
                </Text>
              ) : null}
            </View>

            {/* Explication Message */}
            <Text style={{ fontSize: 13, color: K.textSecondary, lineHeight: 20, textAlign: 'center', marginBottom: 18 }}>
              {secretDocModal.hasPending
                ? '⏳ Votre demande d\'autorisation a déjà été transmise au créateur du dossier. Elle est actuellement en attente de validation.'
                : 'Ce document est protégé. Pour le consulter ou le télécharger, vous devez envoyer une demande de permission au créateur du dossier.'}
            </Text>

            {/* Actions */}
            {secretDocModal.hasPending ? (
              <TouchableOpacity
                style={{
                  backgroundColor: K.bgSecondary, paddingVertical: 14, borderRadius: 12,
                  alignItems: 'center', justifyContent: 'center',
                }}
                onPress={() => setSecretDocModal(prev => ({ ...prev, visible: false }))}
                activeOpacity={0.85}
              >
                <Text style={{ color: K.text, fontSize: 14, fontWeight: '700' }}>
                  Fermer (En attente de réponse)
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: C.purple600, paddingVertical: 14, borderRadius: 12,
                    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
                  }}
                  onPress={handleDemanderAccesSecret}
                  disabled={secretDocModal.loading}
                  activeOpacity={0.85}
                >
                  {secretDocModal.loading ? (
                    <ActivityIndicator color={C.white} size="small" />
                  ) : (
                    <>
                      <Send color={C.white} size={16} />
                      <Text style={{ color: C.white, fontSize: 14, fontWeight: '700' }}>
                        Demander la permission
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                    justifyContent: 'center', backgroundColor: K.bgTertiary,
                  }}
                  onPress={() => setSecretDocModal(prev => ({ ...prev, visible: false }))}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: K.textSecondary, fontSize: 13, fontWeight: '600' }}>
                    Annuler
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  headerBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, backgroundColor: C.gray900 },
  headerTitleMain: { fontSize: 20, fontWeight: '700', color: C.white },
  headerSubMain: { fontSize: 12, color: C.amber400, marginTop: 2 },
  tabNavRow: { flexDirection: 'row', backgroundColor: C.gray900, paddingHorizontal: 12, paddingBottom: 10, gap: 8 },
  tabNavBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 12, backgroundColor: C.navy800 },
  tabNavBtnActive: { backgroundColor: C.amber500 },
  tabNavText: { fontSize: 12, fontWeight: '600', color: C.gray400 },
  tabNavTextActive: { color: C.gray900, fontWeight: '700' },
  searchBarRow: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.gray100, borderRadius: 10, paddingHorizontal: 10 },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 13, color: C.gray900 },
  uploadBtn: { paddingHorizontal: 14, backgroundColor: C.amber500, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  filtresRow: { paddingHorizontal: 12, paddingVertical: 6, gap: 6, backgroundColor: C.white },
  filterChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: C.gray100 },
  filterChipActive: { backgroundColor: C.amber500 },
  filterChipText: { fontSize: 11, color: C.gray600, fontWeight: '500' },
  filterChipTextActive: { color: C.gray900, fontWeight: '700' },
  listContent: { padding: 12, gap: 8, paddingBottom: 100 },
  docCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.white, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.gray200 },
  docIconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.amber50, alignItems: 'center', justifyContent: 'center' },
  docName: { fontSize: 13, fontWeight: '700', color: C.gray900 },
  docMetaText: { fontSize: 11, color: C.gray500 },
  confBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  confBadgeText: { fontSize: 9, fontWeight: '700' },
  actionIconBtn: { padding: 8, backgroundColor: C.green50, borderRadius: 8 },
  center: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 14, color: C.gray500 },
  dossierSelectorBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.white, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  dossierSelectorText: { flex: 1, fontSize: 13, fontWeight: '600', color: C.gray900 },
  sugChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.amber50, borderWidth: 1, borderColor: C.amber200, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  sugText: { fontSize: 11, fontWeight: '600', color: C.amber900 },
  msgBubble: { padding: 12, borderRadius: 14, maxWidth: '85%' },
  msgUser: { alignSelf: 'flex-end', backgroundColor: C.navy900 },
  msgAssistant: { alignSelf: 'flex-start', backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200 },
  msgText: { fontSize: 13, color: C.gray900, lineHeight: 18 },
  inputBar: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray200 },
  iaTextInput: { flex: 1, backgroundColor: C.gray100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, color: C.gray900 },
  sendBtn: { width: 44, height: 44, backgroundColor: C.amber500, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  handle: { width: 40, height: 4, backgroundColor: C.gray200, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  previewTitle: { fontSize: 16, fontWeight: '700', color: C.gray900 },
  previewSub: { fontSize: 12, color: C.gray500, marginBottom: 16 },
  mainActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.amber500, borderRadius: 12, paddingVertical: 12, marginBottom: 10 },
  mainActionBtnSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.amber100, borderRadius: 12, paddingVertical: 12, marginBottom: 10 },
  mainActionText: { fontSize: 13, fontWeight: '700', color: C.gray900 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.red50, borderRadius: 12, paddingVertical: 12, marginBottom: 10 },
  deleteText: { fontSize: 13, fontWeight: '700', color: C.red600 },
  cancelBtn: { borderWidth: 1, borderColor: C.gray200, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  cancelText: { fontSize: 13, color: C.gray600 },
  dossierSelectOption: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 },
});
