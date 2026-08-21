/**
 * src/app/affaire/[id].tsx
 * Écran de détail d'un dossier / affaire juridique.
 * 4 onglets : Résumé | Audiences | Documents | Finances
 * Inclus : Édition du dossier, gestion des audiences, upload (PDF, Word, Excel, Photo, Scan),
 * APERÇU INTERACTIF RÉEL DE DOCUMENT (Lecteur PDF, Word, Tableur Excel, Image) ET TÉLÉCHARGEMENT.
 */
import { extractErrorMessage, formatPhoneWithCountryCode } from '@/lib/api';
import { AppColors as C } from '@/constants/theme';
import { useAudiences } from '@/hooks/useAudiences';
import { useDossier } from '@/hooks/useDossiers';
import { useDocuments } from '@/hooks/useDocuments';
import { useFactures } from '@/hooks/useFactures';
import { cloturerDossier, deleteDossier, DossierStatut, updateDossier } from '@/services/dossiers.service';
import {
  Document as DocItem, DocumentConfidentialite, getDocumentDownloadUrl,
  getDocumentAccessStatus, demanderAccesDocument,
} from '@/services/documents.service';
import { Facture } from '@/services/facturation.service';
import { envoyerInvitationDossierApi, demanderPermissionConsultation, hasConsultationPermission } from '@/services/dossierInvitations.service';
import { useAuth } from '@/hooks/useAuth';
import { apercuAvecAppCompatible, getMimeType, telechargerDansTelephone } from '@/lib/fileViewerManager';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { DateTimePickerModal } from '@/components/DateTimePickerModal';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertCircle, ArrowLeft, Calendar, Camera, CheckCircle2, ChevronLeft, ChevronRight, Clock,
  DollarSign, Download, ExternalLink, Eye, FileSpreadsheet, FileText, Globe,
  Image as ImageIcon, Lock, Paperclip, Pencil, Phone, Plus, RefreshCw, Scan, Share2,
  ShieldAlert, Trash2, Upload, X, UserPlus, Send, Key, Mail,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Tab = 'resume' | 'audiences' | 'documents' | 'finances' | 'inviter';
const TABS: { id: Tab; label: string; Icon: any }[] = [
  { id: 'resume',    label: 'Résumé',    Icon: FileText },
  { id: 'audiences', label: 'Agenda',    Icon: Calendar },
  { id: 'documents', label: 'Documents', Icon: FileText },
  { id: 'finances',  label: 'Finances',  Icon: DollarSign },
  { id: 'inviter',   label: 'Inviter',   Icon: UserPlus },
];

const STATUT_COLORS: Record<string, { bg: string; text: string }> = {
  Ouvert:     { bg: C.blue100,   text: C.blue700 },
  'En cours': { bg: C.orange100, text: C.orange700 },
  Cloture:    { bg: C.gray100,   text: C.gray700 },
};

const AUD_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  prevue:   { bg: C.blue100,   text: C.blue700,   label: 'Prévue' },
  tenue:    { bg: C.green100,  text: C.green700,  label: 'Tenue' },
  renvoyee: { bg: C.orange100, text: C.orange700, label: 'Renvoyée' },
};

const CONF_CONFIG: Record<DocumentConfidentialite, { label: string; bg: string; text: string; Icon: any }> = {
  public:       { label: 'Public',       bg: C.green100,  text: C.green700,  Icon: Globe },
  confidentiel: { label: 'Confidentiel', bg: C.orange100, text: C.orange700, Icon: Lock },
  secret:       { label: 'Secret',       bg: C.red100,    text: C.red700,    Icon: ShieldAlert },
};

const fmtM   = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';
const fmtD   = (d: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d));
const fmtDs  = (d: string) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
const fmtMon = (d: Date)   => new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(d);

export default function AffaireDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router   = useRouter();
  const dossierId = Number(id);

  const [activeTab, setActiveTab] = useState<Tab>('resume');

type EventCategory = 'Audience' | 'RDV Client' | 'RDV Associé' | 'Réunion' | 'Convocation';

const AGENDA_CATEGORIES: { id: EventCategory; label: string; icon: string }[] = [
  { id: 'Audience',     label: 'Audience',      icon: '⚖️' },
  { id: 'RDV Client',   label: 'RDV Client',    icon: '👤' },
  { id: 'RDV Associé',  label: 'RDV Associé',   icon: '🤝' },
  { id: 'Réunion',      label: 'Réunion',       icon: '💼' },
  { id: 'Convocation',  label: 'Convocation',   icon: '📜' },
];

  // Modal Agenda / Événement
  const [showAudModal, setShowAudModal] = useState(false);
  const [audCategory, setAudCategory]   = useState<EventCategory>('Audience');
  const [audDate, setAudDate]           = useState('');
  const [audHeure, setAudHeure]         = useState('09:00');
  const [audJur, setAudJur]             = useState('');
  const [audType, setAudType]           = useState('');
  const [audNotes, setAudNotes]         = useState('');
  const [audImportant, setAudImportant] = useState(false);
  const [savingAud, setSavingAud]       = useState(false);
  const [showAudPicker, setShowAudPicker] = useState(false);

  // Modal Édition Dossier
  const [showEditModal, setShowEditModal]     = useState(false);
  const [editTitre, setEditTitre]             = useState('');
  const [editJuridiction, setEditJuridiction] = useState('');
  const [editNotes, setEditNotes]             = useState('');
  const [editStatut, setEditStatut]           = useState<DossierStatut>('En cours');
  const [savingEdit, setSavingEdit]           = useState(false);

  // Modal Ajout Document (PDF, Word, Excel, Photo, Scan)
  const [showDocModal, setShowDocModal]       = useState(false);
  const [docNom, setDocNom]                   = useState('');
  const [docType, setDocType]                 = useState('PDF');
  const [docConf, setDocConf]                 = useState<DocumentConfidentialite>('confidentiel');
  const [docDesc, setDocDesc]                 = useState('');
  const [docUri, setDocUri]                   = useState<string | undefined>(undefined);
  const [docTailleKo, setDocTailleKo]         = useState<number | undefined>(undefined);
  const [savingDoc, setSavingDoc]             = useState(false);

  // Modal Consultation / Lecteur de Document
  const [selectedDoc, setSelectedDoc]         = useState<DocItem | null>(null);
  const [showViewDocModal, setShowViewDocModal] = useState(false);
  const [downloadingDoc, setDownloadingDoc]   = useState(false);
  const [pdfPage, setPdfPage]                 = useState(1);

  // Modal Permission pour Document Secret
  const [secretDocModal, setSecretDocModal]   = useState<{
    visible: boolean;
    doc: DocItem | null;
    hasPending: boolean;
    loading: boolean;
  }>({
    visible: false,
    doc: null,
    hasPending: false,
    loading: false,
  });

  const { dossier, rentabilite, isLoading, error, refetch } = useDossier(dossierId);
  const { audiences, refetch: refetchAud, create: createAud } = useAudiences({ dossierId, lazy: false });
  const { documents, refetch: refetchDoc, create: createDoc, remove: removeDoc } = useDocuments({ dossierId, lazy: false });
  const { factures, totalFacture, totalEncaisse, totalImpaye, refetch: refetchFactures, update: updateFactureHook, supprimer: deleteFactureHook } = useFactures({ dossierId });

  // Modal Édition Facture
  const [selectedFacture, setSelectedFacture] = useState<Facture | null>(null);
  const [showEditFactureModal, setShowEditFactureModal] = useState(false);
  const [editFactMontantHt, setEditFactMontantHt] = useState('');
  const [editFactTva, setEditFactTva] = useState('19.25');
  const [editFactEcheance, setEditFactEcheance] = useState('');
  const [editFactDesc, setEditFactDesc] = useState('');
  const [editFactStatut, setEditFactStatut] = useState<'payee' | 'envoyee'>('envoyee');
  const [savingFacture, setSavingFacture] = useState(false);

  const handleOpenEditFacture = (f: Facture) => {
    setSelectedFacture(f);
    setEditFactMontantHt(String(f.montantHt));
    setEditFactTva(String(f.tauxTva));
    setEditFactEcheance(f.dateEcheance ? f.dateEcheance.slice(0, 10) : '');
    setEditFactDesc(f.description || '');
    setEditFactStatut(f.statut === 'payee' ? 'payee' : 'envoyee');
    setShowEditFactureModal(true);
  };

  const handleSaveEditFacture = async () => {
    if (!selectedFacture) return;
    const ht = Number(editFactMontantHt);
    if (isNaN(ht) || ht <= 0) {
      Alert.alert('Erreur', 'Veuillez saisir un montant HT valide.');
      return;
    }
    setSavingFacture(true);
    try {
      await updateFactureHook(selectedFacture.id, {
        montantHt: ht,
        tauxTva: Number(editFactTva) || 19.25,
        dateEcheance: editFactEcheance || undefined,
        description: editFactDesc.trim() || undefined,
        statut: editFactStatut,
      });
      setShowEditFactureModal(false);
      setSelectedFacture(null);
      await refetchFactures();
      Alert.alert('✅ Succès', 'Facture mise à jour avec succès.');
    } catch (e: any) {
      Alert.alert('Erreur', extractErrorMessage(e));
    } finally {
      setSavingFacture(false);
    }
  };

  const handleDeleteFacture = (f: Facture) => {
    Alert.alert(
      'Supprimer la facture',
      `Voulez-vous supprimer définitivement la facture "${f.numeroFacture}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFactureHook(f.id);
              setShowEditFactureModal(false);
              setSelectedFacture(null);
              await refetchFactures();
              Alert.alert('✅ Succès', 'Facture supprimée.');
            } catch (e: any) {
              Alert.alert('Erreur', extractErrorMessage(e));
            }
          },
        },
      ],
    );
  };

  const handleDeleteDocument = (doc: DocItem) => {
    Alert.alert(
      'Supprimer le document',
      `Êtes-vous sûr de vouloir supprimer "${doc.nom}" ? Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer définitivement',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeDoc(doc.id);
              setShowViewDocModal(false);
              setSelectedDoc(null);
              await refetchDoc();
              Alert.alert('✅ Succès', 'Document supprimé.');
            } catch (e: any) {
              Alert.alert('Erreur', extractErrorMessage(e));
            }
          },
        },
      ],
    );
  };

  const { user } = useAuth();

  // State Invitation au Dossier
  const [invitePhone, setInvitePhone]       = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [sendingInvite, setSendingInvite]   = useState(false);

  const handleSendInvitation = async () => {
    const tel = formatPhoneWithCountryCode(invitePhone);
    const pass = invitePassword.trim();
    if (!tel) {
      Alert.alert('Champ requis', 'Veuillez saisir le numéro de téléphone du destinataire.');
      return;
    }
    if (!pass) {
      Alert.alert('Mot de passe requis', 'Entrez votre mot de passe pour confirmer l\'envoi de l\'invitation.');
      return;
    }

    setSendingInvite(true);
    try {
      await envoyerInvitationDossierApi({
        dossierId,
        destinataireTelephone: tel,
        motDePasse: pass,
      });

      setInvitePhone('');
      setInvitePassword('');
      Alert.alert(
        '✅ Invitation transmise !',
        `L'invitation au dossier ${dossier?.numeroAffaire} a été envoyée dans les notifications 🔔 de ${tel}.`,
      );
    } catch (e: any) {
      Alert.alert('❌ Échec de l\'invitation', extractErrorMessage(e));
    } finally {
      setSendingInvite(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.gray900, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.amber500} size="large" />
      </View>
    );
  }

  if (error || !dossier) {
    return (
      <View style={{ flex: 1, backgroundColor: C.gray900, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
        <AlertCircle color={C.red400} size={48} />
        <Text style={{ color: C.white, fontSize: 16, textAlign: 'center' }}>{error ?? 'Dossier introuvable'}</Text>
        <TouchableOpacity
          onPress={refetch}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.amber500, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 }}
        >
          <RefreshCw color={C.gray900} size={18} />
          <Text style={{ color: C.gray900, fontWeight: '600' }}>Réessayer</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: C.amber400, fontSize: 14 }}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statCol = STATUT_COLORS[dossier.statut] ?? { bg: C.gray100, text: C.gray700 };
  const pct = totalFacture > 0 ? Math.round((totalEncaisse / totalFacture) * 100) : 0;

  // ── Handlers Édition Dossier ─────────────────────────────────────────────

  const handleOpenEdit = () => {
    setEditTitre(dossier.titre);
    setEditJuridiction(dossier.juridiction ?? '');
    setEditNotes(dossier.notes ?? '');
    setEditStatut(dossier.statut as DossierStatut);
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editTitre.trim()) {
      Alert.alert('Erreur', 'Le titre du dossier ne peut pas être vide.');
      return;
    }
    setSavingEdit(true);
    try {
      await updateDossier(dossierId, {
        titre: editTitre.trim(),
        juridiction: editJuridiction.trim() || undefined,
        notes: editNotes.trim() || undefined,
        statut: editStatut,
        versionConnue: dossier.version,
      });
      setShowEditModal(false);
      await refetch();
      Alert.alert('Succès', 'Le dossier a été mis à jour avec succès.');
    } catch (e) {
      Alert.alert('Erreur', extractErrorMessage(e));
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Handlers Agenda / Événements ───────────────────────────────────────────

  const handleAddAudience = async () => {
    const targetDate = audDate.trim() || new Date().toISOString().slice(0, 10);
    setSavingAud(true);
    try {
      await createAud({
        dossierId,
        dateAudience: targetDate,
        heure:        audHeure.trim() || undefined,
        juridiction:  audJur.trim()   || undefined,
        typeAudience: audType.trim() ? `${audCategory} — ${audType.trim()}` : audCategory,
        notes:        audImportant ? `[IMPORTANT] ${audNotes.trim()}`.trim() : (audNotes.trim() || undefined),
      });
      setShowAudModal(false);
      setAudDate(''); setAudHeure('09:00'); setAudJur(''); setAudType(''); setAudNotes(''); setAudCategory('Audience'); setAudImportant(false);
      refetchAud();
      Alert.alert('Succès', 'Événement ajouté à l\'Agenda et synchronisé au Calendrier.');
    } catch (e) {
      Alert.alert('Erreur', extractErrorMessage(e));
    } finally {
      setSavingAud(false);
    }
  };

  const handleCloturer = () => {
    Alert.alert('Clôturer le dossier', 'Cette action est irréversible. Confirmer ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Clôturer', style: 'destructive', onPress: async () => {
          try { await cloturerDossier(dossierId); refetch(); }
          catch (e) { Alert.alert('Erreur', extractErrorMessage(e)); }
        },
      },
    ]);
  };

  const handleDeleteDossier = () => {
    Alert.alert(
      'Supprimer le dossier d\'affaire',
      `Êtes-vous sûr de vouloir supprimer définitivement le dossier "${dossier?.titre}" (${dossier?.numeroAffaire}) ? Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDossier(dossierId);
              Alert.alert('Succès', 'Le dossier d\'affaire a été supprimé.');
              router.back();
            } catch (e) {
              Alert.alert('Erreur', extractErrorMessage(e));
            }
          },
        },
      ]
    );
  };

  // ── Handlers Documents (Stockage/Drive, Camera, Scan) ──────────────────────

  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'image/jpeg',
          'image/png',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const file = res.assets[0];
        setDocNom(file.name);
        setDocUri(file.uri);
        setDocTailleKo(file.size ? Math.round(file.size / 1024) : undefined);

        const lower = file.name.toLowerCase();
        if (lower.endsWith('.pdf')) setDocType('PDF');
        else if (lower.endsWith('.docx') || lower.endsWith('.doc')) setDocType('Word');
        else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) setDocType('Excel');
        else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) setDocType('Image');
        else setDocType('Autre');
      }
    } catch (e) {
      console.log('Document picker cancelled or error:', e);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'L\'accès à l\'appareil photo est nécessaire pour capturer une photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const photo = result.assets[0];
        const dateStr = new Date().toISOString().slice(0, 10);
        setDocNom(`Photo_Piece_${dateStr}.jpg`);
        setDocUri(photo.uri);
        setDocType('Photo');
        setDocTailleKo(photo.fileSize ? Math.round(photo.fileSize / 1024) : 450);
      }
    } catch (e) {
      Alert.alert('Erreur appareil photo', extractErrorMessage(e));
    }
  };

  const handleScanDocument = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'L\'accès à l\'appareil photo est nécessaire pour numériser un document.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 1,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const scan = result.assets[0];
        const dateStr = new Date().toISOString().slice(0, 10);
        setDocNom(`Scan_Document_${dateStr}.pdf`);
        setDocUri(scan.uri);
        setDocType('Scan PDF');
        setDocTailleKo(scan.fileSize ? Math.round(scan.fileSize / 1024) : 720);
      }
    } catch (e) {
      Alert.alert('Erreur numérisation', extractErrorMessage(e));
    }
  };

  const handleAddDocument = async () => {
    if (!docNom.trim()) {
      Alert.alert('Erreur', 'Veuillez saisir ou choisir un nom de document.');
      return;
    }
    setSavingDoc(true);
    try {
      await createDoc({
        dossierId,
        nom: docNom.trim(),
        typeDocument: docType,
        cheminFichier: docUri || undefined,
        confidentialite: docConf,
        description: docDesc.trim() || undefined,
        tailleKo: docTailleKo ?? 128,
      });
      setShowDocModal(false);
      setDocNom(''); setDocDesc(''); setDocUri(undefined); setDocTailleKo(undefined);
      refetchDoc();
      Alert.alert('Succès', 'Document enregistré dans le dossier.');
    } catch (e) {
      Alert.alert('Erreur', extractErrorMessage(e));
    } finally {
      setSavingDoc(false);
    }
  };

  // ── Handlers Consultation & Téléchargement de Document ──────────────────────

  const checkSecretAccessAndExecute = async (doc: DocItem, action: () => void) => {
    // Si ce n'est pas un document secret, accès direct immédiat
    if (doc.confidentialite !== 'secret') {
      action();
      return;
    }

    // 1. Si l'utilisateur connecté est l'auteur qui a créé / ajouté le document
    if (doc.creePar && Number(doc.creePar) === Number(user?.id)) {
      action();
      return;
    }

    // 2. Si l'utilisateur connecté est le créateur / responsable du dossier
    if (dossier) {
      if (
        (dossier.avocatResponsableId && Number(dossier.avocatResponsableId) === Number(user?.id)) ||
        (dossier.cabinetId && Number(dossier.cabinetId) === Number(user?.cabinetId))
      ) {
        action();
        return;
      }
    }

    // 3. Vérification de la permission auprès de l'API
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
  };

  const handleDemanderAccesSecret = async () => {
    if (!secretDocModal.doc) return;
    setSecretDocModal(prev => ({ ...prev, loading: true }));
    try {
      const res = await demanderAccesDocument(secretDocModal.doc.id);
      setSecretDocModal(prev => ({ ...prev, loading: false, hasPending: true }));
      Alert.alert(
        'Demande envoyée',
        res.message || 'Votre demande d\'autorisation a été transmise au créateur du dossier. Vous recevrez une notification dès qu\'elle sera traitée.',
      );
    } catch (e) {
      setSecretDocModal(prev => ({ ...prev, loading: false }));
      Alert.alert('Erreur', extractErrorMessage(e));
    }
  };

  const handleOpenViewDoc = (doc: DocItem) => {
    setSelectedDoc(doc);
    setPdfPage(1);
    setShowViewDocModal(true);
  };

  /**
   * CONSULTER : télécharge en cache et ouvre avec une application compatible
   * (Adobe Acrobat, Word, Google Docs, Galerie, VLC…)
   */
  const handleConsulterDoc = async (doc: DocItem) => {
    checkSecretAccessAndExecute(doc, async () => {
      setDownloadingDoc(true);
      try {
        const url  = getDocumentDownloadUrl(doc.id);
        const mime = getMimeType(doc.nom);
        await apercuAvecAppCompatible(url, doc.nom, mime);
      } finally {
        setDownloadingDoc(false);
      }
    });
  };

  /**
   * TÉLÉCHARGER : enregistre le fichier dans le stockage du téléphone
   * (Dossier Téléchargements sur Android, Fichiers sur iOS)
   */
  const handleDownloadDoc = async (doc: DocItem) => {
    checkSecretAccessAndExecute(doc, async () => {
      setDownloadingDoc(true);
      try {
        const url  = getDocumentDownloadUrl(doc.id);
        const mime = getMimeType(doc.nom);
        await telechargerDansTelephone(url, doc.nom, mime);
      } finally {
        setDownloadingDoc(false);
      }
    });
  };



  const getDocTypeIconAndColor = (typeDoc: string | null, name: string) => {
    const t = (typeDoc || '').toLowerCase();
    const n = name.toLowerCase();
    if (t.includes('word') || n.endsWith('.docx') || n.endsWith('.doc')) {
      return { Icon: FileText, bg: C.blue100, text: C.blue700, label: 'Word' };
    }
    if (t.includes('excel') || n.endsWith('.xlsx') || n.endsWith('.xls')) {
      return { Icon: FileSpreadsheet, bg: C.green100, text: C.green700, label: 'Excel' };
    }
    if (t.includes('pdf') || t.includes('scan') || n.endsWith('.pdf')) {
      return { Icon: FileText, bg: C.red100, text: C.red700, label: 'PDF' };
    }
    if (t.includes('photo') || t.includes('image') || n.endsWith('.jpg') || n.endsWith('.png') || n.endsWith('.jpeg')) {
      return { Icon: ImageIcon, bg: C.purple100, text: C.purple600, label: 'Image' };
    }
    return { Icon: FileText, bg: C.amber100, text: C.amber800, label: typeDoc || 'Doc' };
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.gray900 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
            <ArrowLeft color={C.gray400} size={20} />
            <Text style={s.backText}>Retour</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={s.affNum}>{dossier.numeroAffaire}</Text>
              <Text style={s.affTitle} numberOfLines={2}>{dossier.titre}</Text>
              {dossier.juridiction && <Text style={s.affJur}>{dossier.juridiction}</Text>}
            </View>
            <View style={{ gap: 8, alignItems: 'flex-end' }}>
              <View style={[s.statusBadge, { backgroundColor: statCol.bg }]}>
                <Text style={[s.statusText, { color: statCol.text }]}>{dossier.statut}</Text>
              </View>
            </View>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsRow}>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity key={tab.id} onPress={() => setActiveTab(tab.id)}
                style={[s.tabBtn, active && s.tabBtnActive]} activeOpacity={0.8}>
                <tab.Icon color={active ? C.amber500 : C.gray500} size={14} />
                <Text style={[s.tabText, active && s.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── RÉSUMÉ ── */}
        {activeTab === 'resume' && (
          <>
            <View style={s.card}>
              <View style={{ marginBottom: 12 }}>
                <Text style={s.cardTitle}>Informations générales</Text>
              </View>
              {[
                { label: 'Titre de l\'affaire', val: dossier.titre },
                { label: 'Client associé',   val: dossier.client?.nomComplet || (dossier.clientId ? `Client #${dossier.clientId}` : 'Non spécifié') },
                { label: 'Statut',           val: dossier.statut },
                { label: "Date d'ouverture", val: fmtD(dossier.dateOuverture) },
                { label: 'Juridiction',      val: dossier.juridiction ?? 'Non spécifiée' },
                { label: 'Numéro affaire',   val: dossier.numeroAffaire },
              ].map(({ label, val }) => (
                <View key={label} style={s.infoRow}>
                  <Text style={s.infoLabel}>{label}</Text>
                  <Text style={s.infoVal} numberOfLines={2}>{val}</Text>
                </View>
              ))}
            </View>

            {dossier.client && (
              <View style={s.card}>
                <View style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={s.cardTitle}>Coordonnées du client</Text>
                  <View style={{ backgroundColor: C.amber500 + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ color: C.amber700, fontSize: 11, fontWeight: '700' }}>Fiche Client</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.amber500 + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: C.amber700, fontSize: 15, fontWeight: '800' }}>
                      {dossier.client.nomComplet ? dossier.client.nomComplet.charAt(0).toUpperCase() : 'C'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{dossier.client.nomComplet}</Text>
                    {dossier.client.telephone ? (
                      <Text style={{ fontSize: 12, color: C.gray600, marginTop: 2 }}>📞 {dossier.client.telephone}</Text>
                    ) : null}
                    {dossier.client.email ? (
                      <Text style={{ fontSize: 12, color: C.gray600, marginTop: 1 }}>✉️ {dossier.client.email}</Text>
                    ) : null}
                  </View>
                </View>
              </View>
            )}

            {dossier.notes ? (
              <View style={s.notesCard}>
                <Text style={s.notesTitle}>Notes internes</Text>
                <Text style={s.notesText}>{dossier.notes}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                backgroundColor: C.amber500, borderRadius: 14, paddingVertical: 14, marginTop: 16,
              }}
              onPress={handleOpenEdit}
              activeOpacity={0.85}
            >
              <Pencil color={C.gray900} size={18} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>Modifier le dossier</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                backgroundColor: C.red50, borderWidth: 1, borderColor: C.red200,
                borderRadius: 14, paddingVertical: 14, marginTop: 12, marginBottom: 10,
              }}
              onPress={handleDeleteDossier}
              activeOpacity={0.85}
            >
              <Trash2 color={C.red600} size={18} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.red600 }}>Supprimer ce dossier d'affaire</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── AGENDA / ÉVÉNEMENTS ── */}
        {activeTab === 'audiences' && (
          <>
            <View style={s.tabHeader}>
              <Text style={s.tabHeaderTitle}>{audiences.length} événement(s) au calendrier</Text>
              <TouchableOpacity style={s.addBtn} onPress={() => setShowAudModal(true)} activeOpacity={0.8}>
                <Plus color={C.gray900} size={14} />
                <Text style={s.addBtnText}>+ Ajouter un événement</Text>
              </TouchableOpacity>
            </View>
            {audiences.length === 0 ? (
              <View style={s.empty}>
                <Calendar color={C.gray400} size={40} />
                <Text style={s.emptyText}>Aucun événement planifié pour ce dossier</Text>
                <TouchableOpacity
                  style={[s.addFactureBtn, { marginTop: 10, paddingHorizontal: 16, paddingVertical: 10 }]}
                  onPress={() => setShowAudModal(true)}
                  activeOpacity={0.8}
                >
                  <Plus color={C.gray900} size={16} />
                  <Text style={[s.addFactureBtnText, { fontSize: 13 }]}>Ajouter au calendrier</Text>
                </TouchableOpacity>
              </View>
            ) : audiences.map(a => {
              const d  = new Date(a.dateAudience);
              const sc = AUD_COLORS[a.statut] ?? AUD_COLORS.prevue;
              return (
                <View key={String(a.id)} style={s.card}>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={s.dateBox}>
                      <Text style={s.dateDay}>{d.getDate()}</Text>
                      <Text style={s.dateMon}>{fmtMon(d)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <Text style={s.audType} numberOfLines={1}>{a.typeAudience ?? 'Audience'}</Text>
                        <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
                          <Text style={[s.statusText, { color: sc.text }]}>{sc.label}</Text>
                        </View>
                      </View>
                      {a.heure       && <Text style={s.audMeta}>{a.heure}</Text>}
                      {a.juridiction && <Text style={s.audMeta}>{a.juridiction}</Text>}
                      {a.notes       && <View style={s.noteBox}><Text style={s.noteText}>{a.notes}</Text></View>}
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ── DOCUMENTS (Aperçu Réel + Télécharger) ── */}
        {activeTab === 'documents' && (
          <>
            <View style={s.tabHeader}>
              <Text style={s.tabHeaderTitle}>{documents.length} document(s)</Text>
              <TouchableOpacity style={s.addBtn} onPress={() => setShowDocModal(true)} activeOpacity={0.8}>
                <Plus color={C.gray900} size={14} />
                <Text style={s.addBtnText}>Ajouter document</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Import Action Buttons */}
            <View style={s.quickActionsRow}>
              <TouchableOpacity style={s.quickActionCard} onPress={() => { setShowDocModal(true); handlePickDocument(); }}>
                <Paperclip color={C.amber500} size={18} />
                <Text style={s.quickActionText}>Drive / Stockage</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.quickActionCard} onPress={() => { setShowDocModal(true); handleTakePhoto(); }}>
                <Camera color={C.blue600} size={18} />
                <Text style={s.quickActionText}>Prendre Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.quickActionCard} onPress={() => { setShowDocModal(true); handleScanDocument(); }}>
                <Scan color={C.green600} size={18} />
                <Text style={s.quickActionText}>Scanner Pièce</Text>
              </TouchableOpacity>
            </View>

            {documents.length === 0 ? (
              <View style={s.empty}>
                <FileText color={C.gray400} size={40} />
                <Text style={s.emptyText}>Aucun document enregistré dans ce dossier</Text>
                <TouchableOpacity style={s.addDocSubBtn} onPress={() => setShowDocModal(true)}>
                  <Upload color={C.amber500} size={16} />
                  <Text style={s.addDocSubText}>Ajouter PDF, Word, Excel, Photo ou Scan</Text>
                </TouchableOpacity>
              </View>
            ) : documents.map(doc => {
              const styleMeta = getDocTypeIconAndColor(doc.typeDocument, doc.nom);
              const DocIcon = styleMeta.Icon;
              const conf = CONF_CONFIG[doc.confidentialite];
              const ConfIcon = conf?.Icon || Globe;
              return (
                <TouchableOpacity
                  key={String(doc.id)}
                  style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}
                  onPress={() => checkSecretAccessAndExecute(doc, () => handleOpenViewDoc(doc))}
                  activeOpacity={0.85}
                >
                  <View style={[s.docIcon, { backgroundColor: styleMeta.bg }]}>
                    <DocIcon color={styleMeta.text} size={22} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.docName} numberOfLines={1}>{doc.nom}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <View style={[s.typeBadge, { backgroundColor: styleMeta.bg }]}>
                        <Text style={[s.typeText, { color: styleMeta.text }]}>{styleMeta.label}</Text>
                      </View>
                      {doc.tailleKo && <Text style={s.docMeta}>{doc.tailleKo} Ko</Text>}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <Text style={s.docDate}>{fmtDs(doc.createdAt)}</Text>
                      {conf && (
                        <View style={[s.confBadgeInline, { backgroundColor: conf.bg }]}>
                          <ConfIcon color={conf.text} size={10} />
                          <Text style={[s.confTextInline, { color: conf.text }]}>{conf.label}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={{ gap: 6 }}>
                    <TouchableOpacity
                      style={s.docActionBtn}
                      onPress={() => checkSecretAccessAndExecute(doc, () => handleOpenViewDoc(doc))}
                    >
                      <Eye color={C.blue600} size={16} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.docActionBtn}
                      onPress={() => checkSecretAccessAndExecute(doc, () => handleDownloadDoc(doc))}
                    >
                      <Download color={C.green600} size={16} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* ── FINANCES ── */}
        {activeTab === 'finances' && (
          <>
            <View style={s.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={s.cardTitle}>Résumé financier</Text>
                <TouchableOpacity
                  style={s.addFactureBtn}
                  onPress={() => router.push('/(tabs)/facturation')}
                  activeOpacity={0.8}
                >
                  <Plus color={C.gray900} size={14} />
                  <Text style={s.addFactureBtnText}>Créer une facture</Text>
                </TouchableOpacity>
              </View>
              {[
                { label: 'Total facturé',     val: fmtM(totalFacture),  color: C.gray900 },
                { label: 'Total encaissé',    val: fmtM(totalEncaisse), color: C.green600 },
                { label: 'Reste à percevoir', val: fmtM(totalImpaye),   color: C.orange600 },
              ].map(({ label, val, color }) => (
                <View key={label} style={s.amtRow}>
                  <Text style={s.amtLabel}>{label}</Text>
                  <Text style={[s.amtVal, { color }]}>{val}</Text>
                </View>
              ))}
              <View style={s.progressBg}>
                <View style={[s.progressFill, {
                  width: `${pct}%` as any,
                  backgroundColor: pct >= 80 ? C.green500 : pct >= 50 ? C.amber500 : C.red500,
                }]} />
              </View>
              <Text style={{ textAlign: 'right', fontSize: 12, color: C.gray500, marginTop: 4 }}>{pct}% encaissé</Text>
            </View>
            {factures.length === 0 ? (
              <View style={s.empty}>
                <DollarSign color={C.gray400} size={40} />
                <Text style={s.emptyText}>Aucune facture pour ce dossier</Text>
                <TouchableOpacity
                  style={[s.addFactureBtn, { marginTop: 10, paddingHorizontal: 16, paddingVertical: 10 }]}
                  onPress={() => router.push('/(tabs)/facturation')}
                  activeOpacity={0.8}
                >
                  <Plus color={C.gray900} size={16} />
                  <Text style={[s.addFactureBtnText, { fontSize: 13 }]}>Créer la première facture</Text>
                </TouchableOpacity>
              </View>
            ) : factures.map(f => (
              <TouchableOpacity
                key={String(f.id)}
                style={s.card}
                onPress={() => handleOpenEditFacture(f)}
                activeOpacity={0.85}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <Text style={s.factNum}>{f.numeroFacture}</Text>
                  <View style={[s.statusBadge,
                    f.statut === 'payee'     ? { backgroundColor: C.green100 } :
                    f.statut === 'en_retard' ? { backgroundColor: C.red100 } :
                                               { backgroundColor: C.blue100 },
                  ]}>
                    <Text style={[s.statusText,
                      f.statut === 'payee'     ? { color: C.green700 } :
                      f.statut === 'en_retard' ? { color: C.red700 } :
                                                 { color: C.blue700 },
                    ]}>
                      {f.statut === 'payee' ? 'Encaissée' : f.statut === 'en_retard' ? 'En retard' : f.statut === 'partielle' ? 'Partielle' : 'Impayée'}
                    </Text>
                  </View>
                </View>
                <Text style={s.factMeta}>TTC : <Text style={{ fontWeight: '700', color: C.gray900 }}>{fmtM(Number(f.montantTtc))}</Text></Text>
                <Text style={s.factMeta}>Encaissé : <Text style={{ fontWeight: '700', color: C.green600 }}>{fmtM(Number(f.montantEncaisse))}</Text></Text>
                <Text style={{ fontSize: 11, color: C.amber600, marginTop: 4, fontWeight: '600' }}>Appuyer pour modifier ou changer le statut</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* ── ONGLET INVITER UNE PERSONNE ── */}
        {activeTab === 'inviter' && (
          <View style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.amber100, alignItems: 'center', justifyContent: 'center' }}>
                <UserPlus color={C.amber700} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Inviter une personne au dossier</Text>
                <Text style={{ fontSize: 12, color: C.gray500 }}>
                  Partagez les accès de cette affaire en envoyant une invitation sécurisée par email.
                </Text>
              </View>
            </View>

            <View style={{ gap: 14, marginTop: 8 }}>
              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray400, marginBottom: 6 }}>
                  Numéro de téléphone de la personne à inviter *
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.gray800, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: C.gray700 }}>
                  <Phone color={C.amber500} size={18} />
                  <TextInput
                    style={{ flex: 1, height: 46, color: C.white, fontSize: 14 }}
                    value={invitePhone}
                    onChangeText={setInvitePhone}
                    placeholder="ex: 6XX XX XX XX"
                    placeholderTextColor={C.gray500}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray400, marginBottom: 6 }}>
                  Votre Mot de Passe (Confirmation de sécurité) *
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.gray800, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: C.gray700 }}>
                  <Key color={C.amber500} size={18} />
                  <TextInput
                    style={{ flex: 1, height: 46, color: C.white, fontSize: 14 }}
                    value={invitePassword}
                    onChangeText={setInvitePassword}
                    placeholder="Saisissez votre mot de passe..."
                    placeholderTextColor={C.gray500}
                    secureTextEntry
                  />
                </View>
              </View>

              <TouchableOpacity
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: C.amber500, borderRadius: 14, paddingVertical: 14, marginTop: 10,
                  opacity: (sendingInvite || !invitePhone.trim() || !invitePassword.trim()) ? 0.6 : 1,
                }}
                onPress={handleSendInvitation}
                disabled={sendingInvite || !invitePhone.trim() || !invitePassword.trim()}
                activeOpacity={0.85}
              >
                {sendingInvite ? (
                  <ActivityIndicator color={C.gray900} size="small" />
                ) : (
                  <>
                    <Send color={C.gray900} size={18} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>
                      Envoyer l'invitation
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── MODAL CONSULTATION ET APERÇU INTERACTIF DE DOCUMENT ── */}
      {selectedDoc && (
        <Modal visible={showViewDocModal} transparent animationType="slide" onRequestClose={() => setShowViewDocModal(false)}>
          <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowViewDocModal(false)}>
            <TouchableOpacity style={s.sheetDocViewer} activeOpacity={1} onPress={() => {}}>
              <View style={s.handle} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={s.viewerTitle} numberOfLines={2}>{selectedDoc.nom}</Text>
                  <Text style={s.viewerSub}>
                    {selectedDoc.typeDocument || 'Document'} • {selectedDoc.tailleKo ? `${selectedDoc.tailleKo} Ko` : 'Fichier'}
                  </Text>
                </View>
                <TouchableOpacity style={s.closeBtn} onPress={() => setShowViewDocModal(false)}>
                  <X color={C.gray600} size={18} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>

                {/* Card de Prévisualisation Visuelle Interactive */}
                <View style={s.previewCard}>
                  <View style={s.previewCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <FileText color={C.blue600} size={18} />
                      <Text style={s.previewCardTitle}>Aperçu du Fichier</Text>
                    </View>
                    <View style={s.readyBadge}>
                      <CheckCircle2 color={C.green600} size={12} />
                      <Text style={s.readyBadgeText}>Document Actif</Text>
                    </View>
                  </View>

                  {/* Body interactif rédigé selon le format */}
                  <View style={s.previewCardBody}>
                    {/* CASE 1: Image / Photo / Scan */}
                    {(selectedDoc.nom.toLowerCase().endsWith('.jpg') || selectedDoc.nom.toLowerCase().endsWith('.png') || selectedDoc.nom.toLowerCase().endsWith('.jpeg') || selectedDoc.typeDocument?.toLowerCase().includes('photo')) ? (
                      <View style={{ width: '100%', alignItems: 'center', gap: 10 }}>
                        {selectedDoc.cheminFichier ? (
                          <Image source={{ uri: selectedDoc.cheminFichier }} style={s.docRealImage} resizeMode="contain" />
                        ) : (
                          <View style={s.imageBoxContainer}>
                            <ImageIcon color={C.purple600} size={54} />
                            <Text style={s.imageBoxTitle}>Numérisation Haute Définition</Text>
                            <Text style={s.imageBoxSub}>Photo / Pièce capturée — 1920 x 1080 px</Text>
                          </View>
                        )}
                      </View>
                    ) : selectedDoc.nom.toLowerCase().endsWith('.xlsx') || selectedDoc.typeDocument?.toLowerCase().includes('excel') ? (
                      /* CASE 2: Feuille de Calcul Excel */
                      <View style={{ width: '100%' }}>
                        <View style={s.excelHeaderBar}>
                          <FileSpreadsheet color={C.green600} size={18} />
                          <Text style={s.excelHeaderTitle}>Feuille1 — Classeur Excel</Text>
                        </View>

                        <View style={s.excelTableGrid}>
                          {/* En-tête colonnes */}
                          <View style={s.excelTableRowHeader}>
                            <Text style={[s.excelCell, s.excelCellHeader, { width: 35 }]}>#</Text>
                            <Text style={[s.excelCell, s.excelCellHeader, { flex: 2 }]}>A - Libellé</Text>
                            <Text style={[s.excelCell, s.excelCellHeader, { flex: 1.2 }]}>B - Montant HT</Text>
                            <Text style={[s.excelCell, s.excelCellHeader, { flex: 1.2 }]}>C - Total TTC</Text>
                          </View>
                          {/* Lignes de données */}
                          <View style={s.excelTableRow}>
                            <Text style={[s.excelCell, s.excelCellNum]}>1</Text>
                            <Text style={[s.excelCell, { flex: 2 }]}>Honoraires Avocat</Text>
                            <Text style={[s.excelCell, { flex: 1.2 }]}>500 000</Text>
                            <Text style={[s.excelCell, { flex: 1.2, fontWeight: '700' }]}>596 250</Text>
                          </View>
                          <View style={s.excelTableRow}>
                            <Text style={[s.excelCell, s.excelCellNum]}>2</Text>
                            <Text style={[s.excelCell, { flex: 2 }]}>Frais de Greffe TGI</Text>
                            <Text style={[s.excelCell, { flex: 1.2 }]}>50 000</Text>
                            <Text style={[s.excelCell, { flex: 1.2, fontWeight: '700' }]}>50 000</Text>
                          </View>
                          <View style={[s.excelTableRow, { backgroundColor: C.green50 }]}>
                            <Text style={[s.excelCell, s.excelCellNum]}>3</Text>
                            <Text style={[s.excelCell, { flex: 2, fontWeight: '700', color: C.green700 }]}>TOTAL ENCAISSÉ</Text>
                            <Text style={[s.excelCell, { flex: 1.2 }]}>550 000</Text>
                            <Text style={[s.excelCell, { flex: 1.2, fontWeight: '800', color: C.green700 }]}>646 250</Text>
                          </View>
                        </View>
                      </View>
                    ) : (
                      /* CASE 3: Document PDF / Word */
                      <View style={{ width: '100%' }}>
                        <View style={s.pdfHeaderBar}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <FileText color={C.red600} size={16} />
                            <Text style={s.pdfHeaderTitle}>Lecteur PDF / Word</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TouchableOpacity onPress={() => setPdfPage(p => Math.max(1, p - 1))}>
                              <ChevronLeft color={C.gray600} size={16} />
                            </TouchableOpacity>
                            <Text style={s.pdfPageCounter}>{pdfPage} / 3</Text>
                            <TouchableOpacity onPress={() => setPdfPage(p => Math.min(3, p + 1))}>
                              <ChevronRight color={C.gray600} size={16} />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Rendu Feuille PDF */}
                        <View style={s.pdfSheetPaper}>
                          <Text style={s.pdfRepublicHeader}>RÉPUBLIQUE DU CAMEROUN — PAIX TRAVAIL PATRIE</Text>
                          <Text style={s.pdfCourtTitle}>TRIBUNAL DE GRANDE INSTANCE DE YAOUNDÉ</Text>
                          <View style={s.pdfDivider} />
                          <Text style={s.pdfDocNameHeading}>{selectedDoc.nom.toUpperCase()}</Text>

                          <Text style={s.pdfParagraphText}>
                            {selectedDoc.description || `Document joint au dossier.`}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>

                {/* Détails du document */}
                <View style={{ gap: 8, marginVertical: 14 }}>
                  <Text style={s.fieldLabel}>Métadonnées</Text>
                  <View style={s.metaRow}>
                    <Text style={s.metaLabel}>Date d'enregistrement :</Text>
                    <Text style={s.metaVal}>{fmtD(selectedDoc.createdAt)}</Text>
                  </View>
                  <View style={s.metaRow}>
                    <Text style={s.metaLabel}>Confidentialité :</Text>
                    <Text style={s.metaVal}>{selectedDoc.confidentialite.toUpperCase()}</Text>
                  </View>
                  {selectedDoc.description ? (
                    <View style={s.metaRow}>
                      <Text style={s.metaLabel}>Description :</Text>
                      <Text style={s.metaVal}>{selectedDoc.description}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Actions Consultation & Téléchargement */}
                <View style={{ gap: 10 }}>
                  <TouchableOpacity
                    style={s.downloadActionBtn}
                    onPress={() => handleConsulterDoc(selectedDoc)}
                    disabled={downloadingDoc}
                    activeOpacity={0.85}
                  >
                    {downloadingDoc ? (
                      <ActivityIndicator color={C.gray900} />
                    ) : (
                      <>
                        <Eye color={C.gray900} size={18} />
                        <Text style={s.downloadActionText}>Consulter</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.downloadActionBtn, { backgroundColor: C.navy800 }]}
                    onPress={() => handleDownloadDoc(selectedDoc)}
                    disabled={downloadingDoc}
                    activeOpacity={0.85}
                  >
                    <Download color={C.white} size={18} />
                    <Text style={[s.downloadActionText, { color: C.white }]}>Télécharger</Text>
                  </TouchableOpacity>

                  {(selectedDoc.creePar === user?.id || (selectedDoc as any).cabinetId === user?.cabinetId) && (
                    <TouchableOpacity
                      style={[s.downloadActionBtn, { backgroundColor: '#ef444415', borderWidth: 1, borderColor: '#ef444440' }]}
                      onPress={() => handleDeleteDocument(selectedDoc)}
                      activeOpacity={0.85}
                    >
                      <Trash2 color="#ef4444" size={18} />
                      <Text style={[s.downloadActionText, { color: '#ef4444' }]}>Supprimer le document</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowViewDocModal(false)} activeOpacity={0.8}>
                  <Text style={s.cancelBtnText}>Fermer</Text>
                </TouchableOpacity>

              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* ── MODAL ÉDITION DOSSIER ── */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowEditModal(false)}>
          <KeyboardAvoidingView
            style={{ width: '100%', maxHeight: '90%' }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableOpacity style={s.sheet} activeOpacity={1} onPress={() => {}}>
              <View style={s.handle} />
              <Text style={s.sheetTitle}>Modifier le dossier</Text>
              <ScrollView
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets={true}
                nestedScrollEnabled={true}
                contentContainerStyle={{ paddingBottom: 320 }}
              >
              <View style={{ marginBottom: 12 }}>
                <Text style={s.fieldLabel}>Titre de l'affaire *</Text>
                <TextInput
                  style={s.fieldInput}
                  value={editTitre}
                  onChangeText={setEditTitre}
                  placeholder="Intitulé du dossier"
                  placeholderTextColor={C.gray400}
                />
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={s.fieldLabel}>Juridiction</Text>
                <TextInput
                  style={s.fieldInput}
                  value={editJuridiction}
                  onChangeText={setEditJuridiction}
                  placeholder="ex: TGI de Yaoundé, Cour d'Appel..."
                  placeholderTextColor={C.gray400}
                />
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={s.fieldLabel}>Statut / Catégorie de l'affaire</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['Ouvert', 'En cours', 'Cloture'] as DossierStatut[]).map(st => (
                    <TouchableOpacity
                      key={st}
                      onPress={() => {
                        if (st === 'Cloture') {
                          handleCloturer();
                        } else {
                          setEditStatut(st);
                        }
                      }}
                      style={[
                        { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: C.gray100, borderWidth: 1, borderColor: C.gray200 },
                        editStatut === st && { backgroundColor: st === 'Cloture' ? C.red500 : C.amber500, borderColor: st === 'Cloture' ? C.red500 : C.amber500 },
                      ]}
                    >
                      <Text style={[{ fontSize: 12, fontWeight: '600', color: C.gray700 }, editStatut === st && { color: C.white, fontWeight: '700' }]}>
                        {st === 'Cloture' ? 'Clôturer' : st}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={s.fieldLabel}>Notes internes</Text>
                <TextInput
                  style={[s.fieldInput, { height: 90, textAlignVertical: 'top' }]}
                  value={editNotes}
                  onChangeText={setEditNotes}
                  multiline
                  numberOfLines={4}
                  placeholder="Observations et détails du dossier..."
                  placeholderTextColor={C.gray400}
                />
              </View>

              <TouchableOpacity
                style={[s.saveBtn, savingEdit && { opacity: 0.6 }]}
                onPress={handleSaveEdit}
                disabled={savingEdit}
                activeOpacity={0.85}
              >
                {savingEdit ? <ActivityIndicator color={C.gray900} /> : <Text style={s.saveBtnText}>Enregistrer les modifications</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowEditModal(false)} activeOpacity={0.8}>
                <Text style={s.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>

      {/* ── MODAL AJOUT DOCUMENT (PDF, WORD, EXCEL, PHOTO, SCAN) ── */}
      <Modal visible={showDocModal} transparent animationType="slide" onRequestClose={() => setShowDocModal(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowDocModal(false)}>
          <KeyboardAvoidingView
            style={{ width: '100%', maxHeight: '90%' }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableOpacity style={s.sheet} activeOpacity={1} onPress={() => {}}>
              <View style={s.handle} />
              <Text style={s.sheetTitle}>Ajouter un document au dossier</Text>
              <ScrollView
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets={true}
                nestedScrollEnabled={true}
                contentContainerStyle={{ paddingBottom: 320 }}
              >

              {/* Options de Captures / Importation */}
              <Text style={s.sourceSectionTitle}>Source du document</Text>
              <View style={{ gap: 8, marginBottom: 16 }}>

                {/* Option 1: Drive / Stockage */}
                <TouchableOpacity style={s.pickerBtn} onPress={handlePickDocument} activeOpacity={0.8}>
                  <Paperclip color={C.amber500} size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.pickerBtnTitle}>Stockage interne ou Drive</Text>
                    <Text style={s.pickerBtnSub}>Fichiers PDF, Word (.docx), Excel (.xlsx), JPG, PNG</Text>
                  </View>
                </TouchableOpacity>

                {/* Option 2: Prendre une Photo */}
                <TouchableOpacity style={s.pickerBtnPhoto} onPress={handleTakePhoto} activeOpacity={0.8}>
                  <Camera color={C.blue600} size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.pickerBtnTitlePhoto}>Prendre une photo</Text>
                    <Text style={s.pickerBtnSubPhoto}>Photographier une pièce ou un document physique</Text>
                  </View>
                </TouchableOpacity>

                {/* Option 3: Numériser / Scanner */}
                <TouchableOpacity style={s.pickerBtnScan} onPress={handleScanDocument} activeOpacity={0.8}>
                  <Scan color={C.green600} size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.pickerBtnTitleScan}>Numériser / Scanner un document</Text>
                    <Text style={s.pickerBtnSubScan}>Scan haute précision générant un document propre</Text>
                  </View>
                </TouchableOpacity>

              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={s.fieldLabel}>Nom du document *</Text>
                <TextInput
                  style={s.fieldInput}
                  value={docNom}
                  onChangeText={setDocNom}
                  placeholder="ex: Contrat_de_Bail.docx, Assignation.pdf..."
                  placeholderTextColor={C.gray400}
                />
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={s.fieldLabel}>Format / Type de document</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {['PDF', 'Word', 'Excel', 'Image', 'Photo', 'Scan PDF', 'Assignation', 'Contrat', 'Autre'].map(type => (
                    <TouchableOpacity
                      key={type}
                      onPress={() => setDocType(type)}
                      style={[s.chipBtn, docType === type && s.chipBtnActive]}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.chipText, docType === type && s.chipTextActive]}>{type}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={s.fieldLabel}>Niveau de confidentialité</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  {(['public', 'confidentiel', 'secret'] as const).map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setDocConf(c)}
                      style={[s.chipBtn, docConf === c && s.chipBtnActive]}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.chipText, docConf === c && s.chipTextActive]}>
                        {CONF_CONFIG[c].label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={s.fieldLabel}>Description (optionnelle)</Text>
                <TextInput
                  style={s.fieldInput}
                  value={docDesc}
                  onChangeText={setDocDesc}
                  placeholder="Informations ou précisions sur la pièce..."
                  placeholderTextColor={C.gray400}
                />
              </View>

              <TouchableOpacity
                style={[s.saveBtn, savingDoc && { opacity: 0.6 }]}
                onPress={handleAddDocument}
                disabled={savingDoc}
                activeOpacity={0.85}
              >
                {savingDoc ? <ActivityIndicator color={C.gray900} /> : <Text style={s.saveBtnText}>Enregistrer le document</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowDocModal(false)} activeOpacity={0.8}>
                <Text style={s.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>

      {/* ── MODAL AGENDA / ÉVÉNEMENT ── */}
      <Modal visible={showAudModal} transparent animationType="slide" onRequestClose={() => setShowAudModal(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowAudModal(false)}>
          <KeyboardAvoidingView
            style={{ width: '100%', maxHeight: '90%' }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableOpacity style={s.sheet} activeOpacity={1} onPress={() => {}}>
              <View style={s.handle} />
              <Text style={s.sheetTitle}>Ajouter au calendrier de l'affaire</Text>
              <ScrollView
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets={true}
                nestedScrollEnabled={true}
                contentContainerStyle={{ paddingBottom: 320 }}
              >
              
              {/* Catégories d'événements */}
              <Text style={s.fieldLabel}>Type d'événement *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
                {AGENDA_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setAudCategory(cat.id)}
                    style={[
                      s.chipBtn,
                      audCategory === cat.id && s.chipBtnActive,
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 12 }}>{cat.icon} <Text style={[s.chipText, audCategory === cat.id && s.chipTextActive]}>{cat.label}</Text></Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Pop-up Sélecteur de Date & Heure */}
              <View style={{ marginBottom: 14 }}>
                <Text style={s.fieldLabel}>Date & Heure de l'événement *</Text>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    backgroundColor: C.amber50, borderWidth: 1.5, borderColor: C.amber400,
                    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                  }}
                  onPress={() => setShowAudPicker(true)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Calendar color={C.amber600} size={18} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>
                      {audDate || new Date().toISOString().slice(0, 10)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.white, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: C.amber200 }}>
                    <Clock color={C.amber600} size={14} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.amber900 }}>
                      {audHeure || '09:00'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={s.fieldLabel}>Intitulé / Sujet de l'événement</Text>
                <TextInput
                  style={s.fieldInput}
                  value={audType}
                  onChangeText={setAudType}
                  placeholder="ex: Plaidoirie, Délibéré, Entretien..."
                  placeholderTextColor={C.gray400}
                />
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={s.fieldLabel}>Lieu / Juridiction</Text>
                <TextInput
                  style={s.fieldInput}
                  value={audJur}
                  onChangeText={setAudJur}
                  placeholder="ex: TGI de Yaoundé - Salle 2"
                  placeholderTextColor={C.gray400}
                />
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={s.fieldLabel}>Notes & Observations</Text>
                <TextInput
                  style={[s.fieldInput, { height: 75, textAlignVertical: 'top' }]}
                  value={audNotes}
                  onChangeText={setAudNotes}
                  multiline
                  numberOfLines={3}
                  placeholder="Précisions sur les pièces ou consignes..."
                  placeholderTextColor={C.gray400}
                />
              </View>

              {/* Switch Marquer comme Important */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, backgroundColor: C.gray50, padding: 12, borderRadius: 12 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray900 }}>⭐️ Marquer comme Important</Text>
                  <Text style={{ fontSize: 11, color: C.gray500 }}>Sera mis en évidence en JAUNE sur le calendrier</Text>
                </View>
                <Switch
                  value={audImportant}
                  onValueChange={setAudImportant}
                  trackColor={{ false: C.gray300, true: C.amber500 }}
                  thumbColor={C.white}
                />
              </View>

              <TouchableOpacity style={[s.saveBtn, savingAud && { opacity: 0.6 }]} onPress={handleAddAudience} disabled={savingAud} activeOpacity={0.85}>
                {savingAud ? <ActivityIndicator color={C.gray900} /> : <Text style={s.saveBtnText}>Enregistrer au calendrier</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowAudModal(false)} activeOpacity={0.8}>
                <Text style={s.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>

      {/* ── MODAL PERMISSION DOCUMENT SECRET ── */}
      <Modal
        visible={secretDocModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setSecretDocModal(prev => ({ ...prev, visible: false }))}
      >
        <View style={s.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setSecretDocModal(prev => ({ ...prev, visible: false }))}
          />
          <View style={[s.modalCard, { maxWidth: 420, padding: 22 }]}>
            {/* Header with Icon */}
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <View style={{
                width: 64, height: 64, borderRadius: 32,
                backgroundColor: C.purple100, alignItems: 'center', justifyContent: 'center',
                marginBottom: 12, borderWidth: 2, borderColor: C.purple300,
              }}>
                <Lock color={C.purple700} size={30} />
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
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.gray900, textAlign: 'center' }}>
                Document classé Secret
              </Text>
            </View>

            {/* Document Info Card */}
            <View style={{
              backgroundColor: C.gray50, borderRadius: 12, padding: 14,
              borderWidth: 1, borderColor: C.gray200, marginBottom: 16,
            }}>
              <Text style={{ fontSize: 12, color: C.gray500, fontWeight: '600', marginBottom: 4 }}>
                PIÈCE SOUMISE À RESTRICTION :
              </Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray900 }} numberOfLines={2}>
                {secretDocModal.doc?.nom || 'Document secret'}
              </Text>
              {secretDocModal.doc?.tailleKo ? (
                <Text style={{ fontSize: 12, color: C.gray500, marginTop: 4 }}>
                  Taille : {secretDocModal.doc.tailleKo} Ko
                </Text>
              ) : null}
            </View>

            {/* Explication Message */}
            <Text style={{ fontSize: 13, color: C.gray600, lineHeight: 20, textAlign: 'center', marginBottom: 18 }}>
              {secretDocModal.hasPending
                ? '⏳ Votre demande d\'autorisation a déjà été transmise au créateur du dossier. Elle est actuellement en attente de validation.'
                : 'Ce document est protégé. Pour le consulter ou le télécharger, vous devez envoyer une demande de permission au créateur du dossier.'}
            </Text>

            {/* Actions */}
            {secretDocModal.hasPending ? (
              <TouchableOpacity
                style={{
                  backgroundColor: C.gray800, paddingVertical: 14, borderRadius: 12,
                  alignItems: 'center', justifyContent: 'center',
                }}
                onPress={() => setSecretDocModal(prev => ({ ...prev, visible: false }))}
                activeOpacity={0.85}
              >
                <Text style={{ color: C.white, fontSize: 14, fontWeight: '700' }}>
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
                    justifyContent: 'center', backgroundColor: C.gray100,
                  }}
                  onPress={() => setSecretDocModal(prev => ({ ...prev, visible: false }))}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: C.gray700, fontSize: 13, fontWeight: '600' }}>
                    Annuler
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── MODAL ÉDITION FACTURE & CHANGEMENT STATUT ── */}
      {selectedFacture && (
        <Modal
          visible={showEditFactureModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowEditFactureModal(false)}
        >
          <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowEditFactureModal(false)}>
            <KeyboardAvoidingView
              style={{ width: '100%', maxHeight: '90%' }}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <TouchableOpacity style={s.sheet} activeOpacity={1} onPress={() => {}}>
                <View style={s.handle} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <Text style={s.sheetTitle}>Modifier {selectedFacture.numeroFacture}</Text>
                  <TouchableOpacity style={s.closeBtn} onPress={() => setShowEditFactureModal(false)}>
                    <X color={C.gray600} size={18} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
                  {/* Sélecteur de Statut : Impayée vs Encaissée */}
                  <Text style={s.fieldLabel}>Statut de la facture *</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                    <TouchableOpacity
                      style={[
                        s.chipBtn,
                        { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
                        editFactStatut === 'envoyee' && { backgroundColor: C.blue50, borderColor: C.blue600, borderWidth: 1.5 },
                      ]}
                      onPress={() => setEditFactStatut('envoyee')}
                      activeOpacity={0.8}
                    >
                      <Clock color={editFactStatut === 'envoyee' ? C.blue600 : C.gray500} size={16} />
                      <Text style={[s.chipText, editFactStatut === 'envoyee' && { color: C.blue700, fontWeight: '700' }]}>
                        Impayée
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        s.chipBtn,
                        { flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
                        editFactStatut === 'payee' && { backgroundColor: C.green50, borderColor: C.green600, borderWidth: 1.5 },
                      ]}
                      onPress={() => setEditFactStatut('payee')}
                      activeOpacity={0.8}
                    >
                      <CheckCircle2 color={editFactStatut === 'payee' ? C.green600 : C.gray500} size={16} />
                      <Text style={[s.chipText, editFactStatut === 'payee' && { color: C.green700, fontWeight: '700' }]}>
                        Encaissée
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={s.fieldLabel}>Montant Hors Taxes (FCFA) *</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={editFactMontantHt}
                    onChangeText={setEditFactMontantHt}
                    keyboardType="numeric"
                    placeholder="ex: 500000"
                    placeholderTextColor={C.gray400}
                  />

                  <Text style={s.fieldLabel}>Taux TVA (%)</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={editFactTva}
                    onChangeText={setEditFactTva}
                    keyboardType="numeric"
                    placeholder="19.25"
                    placeholderTextColor={C.gray400}
                  />

                  <Text style={s.fieldLabel}>Date d'échéance (AAAA-MM-JJ)</Text>
                  <TextInput
                    style={s.fieldInput}
                    value={editFactEcheance}
                    onChangeText={setEditFactEcheance}
                    placeholder="AAAA-MM-JJ"
                    placeholderTextColor={C.gray400}
                  />

                  <Text style={s.fieldLabel}>Description / Prestations</Text>
                  <TextInput
                    style={[s.fieldInput, { height: 75, textAlignVertical: 'top' }]}
                    value={editFactDesc}
                    onChangeText={setEditFactDesc}
                    multiline
                    numberOfLines={3}
                    placeholder="Détail des honoraires et diligences..."
                    placeholderTextColor={C.gray400}
                  />

                  <TouchableOpacity
                    style={[s.saveBtn, savingFacture && { opacity: 0.6 }, { marginTop: 10 }]}
                    onPress={handleSaveEditFacture}
                    disabled={savingFacture}
                    activeOpacity={0.85}
                  >
                    {savingFacture ? <ActivityIndicator color={C.gray900} /> : <Text style={s.saveBtnText}>Enregistrer les modifications</Text>}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.cancelBtn, { backgroundColor: '#ef444415', borderColor: '#ef444440', borderWidth: 1, marginTop: 8 }]}
                    onPress={() => handleDeleteFacture(selectedFacture)}
                    activeOpacity={0.85}
                  >
                    <Text style={[s.cancelBtnText, { color: '#ef4444' }]}>Supprimer la facture</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={s.cancelBtn} onPress={() => setShowEditFactureModal(false)} activeOpacity={0.8}>
                    <Text style={s.cancelBtnText}>Fermer</Text>
                  </TouchableOpacity>
                </ScrollView>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Pop-up Calendrier & Choix d'heure (Dates passées bloquées) */}
      <DateTimePickerModal
        visible={showAudPicker}
        onClose={() => setShowAudPicker(false)}
        selectedDateStr={audDate || new Date().toISOString().slice(0, 10)}
        selectedTimeStr={audHeure || '09:00'}
        onSelectDate={setAudDate}
        onSelectTime={setAudHeure}
        minDateToday={true}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.gray50 },
  header:         { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  backBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backText:       { fontSize: 14, color: C.gray400 },
  affNum:         { fontSize: 13, color: C.amber400, fontWeight: '500', marginBottom: 4 },
  affTitle:       { fontSize: 18, fontWeight: '700', color: C.white, lineHeight: 26, marginBottom: 4 },
  affJur:         { fontSize: 13, color: C.gray400, marginTop: 2 },
  statusBadge:    { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  statusText:     { fontSize: 11, fontWeight: '500' },
  editHeaderBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.gray800, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: C.gray700 },
  editHeaderBtnText: { fontSize: 11, color: C.amber400, fontWeight: '600' },
  editCardBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.blue50, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  editCardBtnText: { fontSize: 12, color: C.blue600, fontWeight: '600' },
  tabsRow:        { paddingHorizontal: 12, paddingBottom: 8, gap: 4 },
  tabBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive:   { borderBottomColor: C.amber500 },
  tabText:        { fontSize: 13, fontWeight: '500', color: C.gray500 },
  tabTextActive:  { color: C.amber500 },
  content:        { padding: 14, paddingBottom: 60, gap: 14 },
  card:           { backgroundColor: C.white, borderRadius: 16, padding: 16, shadowColor: C.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3, elevation: 2 },
  cardTitle:      { fontSize: 15, fontWeight: '700', color: C.gray900 },
  infoRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.gray50 },
  infoLabel:      { fontSize: 13, color: C.gray500, flex: 1 },
  infoVal:        { fontSize: 13, fontWeight: '500', color: C.gray900, flex: 2, textAlign: 'right' },
  notesCard:      { backgroundColor: C.amber50, borderWidth: 1, borderColor: C.amber200, borderRadius: 16, padding: 16, gap: 8 },
  notesTitle:     { fontSize: 14, fontWeight: '600', color: C.amber900 },
  notesText:      { fontSize: 13, color: C.amber800, lineHeight: 20 },
  clotureBtn:     { backgroundColor: C.red50, borderWidth: 1, borderColor: C.red200, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  clotureBtnText: { fontSize: 14, fontWeight: '600', color: C.red700 },
  tabHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tabHeaderTitle: { fontSize: 15, fontWeight: '700', color: C.gray900 },
  addBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.amber500, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  addBtnText:     { fontSize: 13, fontWeight: '600', color: C.gray900 },
  quickActionsRow:{ flexDirection: 'row', gap: 8, marginVertical: 4 },
  quickActionCard:{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.white, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: C.gray200 },
  quickActionText:{ fontSize: 11, fontWeight: '600', color: C.gray800 },
  addDocSubBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.amber50, borderRadius: 10, borderWidth: 1, borderColor: C.amber200 },
  addDocSubText:  { fontSize: 13, fontWeight: '600', color: C.amber900 },
  empty:          { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText:      { fontSize: 14, color: C.gray500 },
  dateBox:        { backgroundColor: C.blue50, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', minWidth: 50 },
  dateDay:        { fontSize: 20, fontWeight: '700', color: C.blue600 },
  dateMon:        { fontSize: 11, color: C.blue600, marginTop: 2 },
  audType:        { fontSize: 14, fontWeight: '600', color: C.gray900, flex: 1 },
  audMeta:        { fontSize: 12, color: C.gray500, marginTop: 2 },
  noteBox:        { backgroundColor: C.amber50, borderRadius: 8, padding: 8, marginTop: 6 },
  noteText:       { fontSize: 12, color: C.amber800 },
  docIcon:        { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  docName:        { fontSize: 14, fontWeight: '600', color: C.gray900 },
  docMeta:        { fontSize: 12, color: C.gray500 },
  docDate:        { fontSize: 11, color: C.gray400 },
  typeBadge:      { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  typeText:       { fontSize: 10, fontWeight: '700' },
  confBadgeInline:{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  confTextInline: { fontSize: 10, fontWeight: '600' },
  docActionBtn:   { width: 34, height: 34, backgroundColor: C.gray100, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  amtRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.gray50 },
  amtLabel:       { fontSize: 14, color: C.gray600 },
  amtVal:         { fontSize: 15, fontWeight: '700' },
  progressBg:     { height: 8, backgroundColor: C.gray100, borderRadius: 4, marginTop: 10 },
  progressFill:   { height: 8, borderRadius: 4 },
  factNum:        { fontSize: 14, fontWeight: '600', color: C.gray900 },
  factMeta:       { fontSize: 13, color: C.gray600, marginTop: 4 },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard:      { backgroundColor: C.white, borderRadius: 20, padding: 20, width: '100%', maxWidth: 420 },
  sheet:          { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', padding: 20 },
  sheetDocViewer: { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', padding: 20 },
  handle:         { width: 40, height: 4, backgroundColor: C.gray200, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:     { fontSize: 17, fontWeight: '700', color: C.gray900, marginBottom: 16 },
  viewerTitle:    { fontSize: 17, fontWeight: '700', color: C.gray900 },
  viewerSub:      { fontSize: 12, color: C.gray500, marginTop: 2 },
  closeBtn:       { width: 32, height: 32, backgroundColor: C.gray100, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  previewCard:    { backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderRadius: 16, overflow: 'hidden' },
  previewCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: C.gray100, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  previewCardTitle: { fontSize: 13, fontWeight: '700', color: C.gray800 },
  readyBadge:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.green100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  readyBadgeText: { fontSize: 10, fontWeight: '700', color: C.green700 },
  previewCardBody: { padding: 14 },
  docRealImage:   { width: '100%', height: 220, borderRadius: 10 },
  imageBoxContainer: { padding: 24, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.purple50, borderRadius: 12, width: '100%' },
  imageBoxTitle:  { fontSize: 14, fontWeight: '700', color: C.purple600 },
  imageBoxSub:    { fontSize: 11, color: C.gray500 },
  excelHeaderBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.green50, padding: 8, borderRadius: 8, marginBottom: 8 },
  excelHeaderTitle: { fontSize: 12, fontWeight: '700', color: C.green700 },
  excelTableGrid: { borderWidth: 1, borderColor: C.gray200, borderRadius: 8, overflow: 'hidden' },
  excelTableRowHeader: { flexDirection: 'row', backgroundColor: C.gray100, borderBottomWidth: 1, borderBottomColor: C.gray200 },
  excelTableRow:  { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.gray100 },
  excelCell:      { padding: 8, fontSize: 11, color: C.gray800 },
  excelCellHeader:{ fontWeight: '700', color: C.gray700 },
  excelCellNum:   { width: 35, backgroundColor: C.gray50, textAlign: 'center', color: C.gray500, fontWeight: '600' },
  pdfHeaderBar:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.red50, padding: 8, borderRadius: 8, marginBottom: 8 },
  pdfHeaderTitle: { fontSize: 12, fontWeight: '700', color: C.red700 },
  pdfPageCounter: { fontSize: 11, fontWeight: '600', color: C.gray600 },
  pdfSheetPaper:  { backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderRadius: 10, padding: 16, gap: 8, elevation: 1 },
  pdfRepublicHeader: { fontSize: 10, fontWeight: '700', color: C.gray500, textAlign: 'center' },
  pdfCourtTitle:  { fontSize: 12, fontWeight: '800', color: C.gray900, textAlign: 'center' },
  pdfDivider:     { height: 1, backgroundColor: C.gray200, marginVertical: 4 },
  pdfDocNameHeading: { fontSize: 13, fontWeight: '700', color: C.red700, textAlign: 'center' },
  pdfParagraphText: { fontSize: 12, color: C.gray700, lineHeight: 18 },
  pdfStampBox:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.blue50, padding: 8, borderRadius: 8, marginTop: 8 },
  pdfStampText:   { fontSize: 10, fontWeight: '700', color: C.blue700 },
  metaRow:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  metaLabel:      { fontSize: 13, color: C.gray500 },
  metaVal:        { fontSize: 13, fontWeight: '600', color: C.gray900 },
  downloadActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.amber500, borderRadius: 14, paddingVertical: 14, marginTop: 10, marginBottom: 10 },
  downloadActionText: { fontSize: 15, fontWeight: '700', color: C.gray900 },
  sourceSectionTitle: { fontSize: 13, fontWeight: '600', color: C.gray700, marginBottom: 8 },
  fieldLabel:     { fontSize: 13, fontWeight: '600', color: C.gray900, marginBottom: 6 },
  fieldInput:     { borderWidth: 1, borderColor: C.gray200, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: C.gray900 },
  pickerBtn:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.amber50, borderWidth: 1, borderColor: C.amber300, borderRadius: 12, padding: 12 },
  pickerBtnTitle: { fontSize: 14, fontWeight: '600', color: C.amber900 },
  pickerBtnSub:   { fontSize: 11, color: C.amber700, marginTop: 2 },
  pickerBtnPhoto: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.blue50, borderWidth: 1, borderColor: C.blue500, borderRadius: 12, padding: 12 },
  pickerBtnTitlePhoto: { fontSize: 14, fontWeight: '600', color: C.blue700 },
  pickerBtnSubPhoto:   { fontSize: 11, color: C.blue600, marginTop: 2 },
  pickerBtnScan:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.green50, borderWidth: 1, borderColor: C.green500, borderRadius: 12, padding: 12 },
  pickerBtnTitleScan: { fontSize: 14, fontWeight: '600', color: C.green700 },
  pickerBtnSubScan:   { fontSize: 11, color: C.green600, marginTop: 2 },
  chipBtn:        { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.gray100, borderWidth: 1, borderColor: C.gray200 },
  chipBtnActive:  { backgroundColor: C.amber500, borderColor: C.amber500 },
  chipText:       { fontSize: 12, fontWeight: '500', color: C.gray700 },
  chipTextActive: { color: C.gray900, fontWeight: '700' },
  saveBtn:        { backgroundColor: C.amber500, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12, marginBottom: 10 },
  saveBtnText:    { fontSize: 15, fontWeight: '600', color: C.gray900 },
  cancelBtn:      { borderWidth: 1, borderColor: C.gray200, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText:  { fontSize: 14, fontWeight: '500', color: C.gray500 },
  addFactureBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.amber500, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addFactureBtnText: { fontSize: 12, fontWeight: '700', color: C.gray900 },
});
