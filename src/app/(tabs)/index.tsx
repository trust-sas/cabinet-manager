/**
 * src/app/(tabs)/index.tsx
 * Tableau de bord Cabinet Manager
 *
 * Spécifications :
 * 1. Onglet 1 : "Vue d'ensemble" (Page d'accueil principale avec KPIs, alertes, actions rapides, dossiers récents, IA)
 * 2. Onglet 2 : "Organisation" (Pour TOUS les utilisateurs : si pas d'organisation -> Créer / Rejoindre, sinon vue complète de l'org)
 * 3. Onglet 3 : "Facturation" (UNIQUEMENT pour les chefs d'organisation)
 * 4. Barre du haut : Avatar + Nom de l'utilisateur (remplace "Cabinet Manager")
 * 5. À côté de la cloche de notification : Boîte de réception 📬 avec badge des demandes/invitations
 * 6. Style graphique élégant & harmonieux avec useTheme()
 */

import { AppColors as C } from '@/constants/theme';
import { useAudiences } from '@/hooks/useAudiences';
import { useAuth } from '@/hooks/useAuth';
import { useClients } from '@/hooks/useClients';
import { useDossiers } from '@/hooks/useDossiers';
import { useFactures } from '@/hooks/useFactures';
import { useOrganisations } from '@/hooks/useOrganisations';
import { usePreferences } from '@/context/PreferencesContext';
import { useTheme } from '@/hooks/useTheme';
import { extractErrorMessage } from '@/lib/api';
import { AccountDrawer } from '@/components/AccountDrawer';
import { DashboardAIChatBox } from '@/components/DashboardAIChatBox';
import { createFacture, deleteFacture, Facture, getSoldeRestant } from '@/services/facturation.service';
import {
  getNotifications,
  marquerNotificationCommeLue,
  marquerToutesNotificationsCommeLues,
  NotificationItem,
} from '@/services/notifications.service';
import {
  chargerDonneesInvitationsPersistantes,
  hasDossierAccess,
} from '@/services/dossierInvitations.service';
import {
  ajouterMembre,
  demanderRejoindre,
  getOrganisationDetails,
  listerOrganisations,
  modifierOrganisation,
  Organisation,
  OrganisationDetails,
  partagerClient,
  partagerDossier,
  retirerClient,
  retirerDossier,
  supprimerMembre,
  supprimerOrganisation,
  traiterDemande,
} from '@/services/organisations.service';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Briefcase,
  Building2,
  Calendar as CalendarIcon,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Edit2,
  FileText,
  FolderGit2,
  FolderOpen,
  Globe,
  Inbox,
  Info,
  Layers,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  MoreVertical,
  Plus,
  Receipt,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type DashboardTab = 'overview' | 'organisation' | 'facturation';
type OrgSubTab = 'dossiers' | 'clients' | 'membres' | 'demandes';

function initials(name?: string) {
  if (!name) return 'AV';
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}

function formatDate(dateStr?: string) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { isDark } = usePreferences();
  const { colors: K } = useTheme();

  // ── Organisations State & Hooks ──
  const {
    mesOrgs,
    toutesOrgs,
    isLoading: loadingOrgs,
    refetch: refetchOrgs,
    fetchToutesOrgs,
    creer: creerOrgApi,
  } = useOrganisations();

  const [selectedOrgNom, setSelectedOrgNom] = useState<string | null>(null);
  const [activeOrgDetails, setActiveOrgDetails] = useState<OrganisationDetails | null>(null);
  const [loadingActiveOrg, setLoadingActiveOrg] = useState(false);
  const [activeOrgSubTab, setActiveOrgSubTab] = useState<OrgSubTab>('dossiers');

  // Détermination du statut Chef
  const isChefInAnyOrg = mesOrgs.some((o) => o.role === 'chef');
  const isChefInActiveOrg = activeOrgDetails?.role === 'chef';

  // Onglets du Dashboard :
  // - Chef : Vue d'ensemble | Organisation | Facturation (3 onglets)
  // - Non-Chef : Vue d'ensemble | Organisation (2 onglets)
  const dashboardTabs: { id: DashboardTab; label: string; Icon: any }[] = isChefInAnyOrg
    ? [
        { id: 'overview', label: "Vue d'ensemble", Icon: LayoutDashboard },
        { id: 'organisation', label: 'Organisation', Icon: Building2 },
        { id: 'facturation', label: 'Facturation', Icon: Receipt },
      ]
    : [
        { id: 'overview', label: "Vue d'ensemble", Icon: LayoutDashboard },
        { id: 'organisation', label: 'Organisation', Icon: Building2 },
      ];

  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  // Si l'utilisateur n'est plus chef et était sur facturation
  useEffect(() => {
    if (!isChefInAnyOrg && activeTab === 'facturation') {
      setActiveTab('overview');
    }
  }, [isChefInAnyOrg, activeTab]);

  // Synchronisation de l'organisation sélectionnée
  useEffect(() => {
    if (mesOrgs.length > 0 && (!selectedOrgNom || !mesOrgs.some((o) => o.nom === selectedOrgNom))) {
      setSelectedOrgNom(mesOrgs[0].nom);
    } else if (mesOrgs.length === 0) {
      setSelectedOrgNom(null);
      setActiveOrgDetails(null);
    }
  }, [mesOrgs, selectedOrgNom]);

  // Chargement des détails de l'organisation active
  const fetchActiveOrgDetails = useCallback(async () => {
    if (!selectedOrgNom) {
      setActiveOrgDetails(null);
      return;
    }
    setLoadingActiveOrg(true);
    try {
      const details = await getOrganisationDetails(selectedOrgNom);
      setActiveOrgDetails(details);
    } catch (e: any) {
      console.log('Erreur chargement détails org:', e);
    } finally {
      setLoadingActiveOrg(false);
    }
  }, [selectedOrgNom]);

  useEffect(() => {
    fetchActiveOrgDetails();
  }, [fetchActiveOrgDetails]);

  // ── Modals & Drawers State ──
  const [showDrawer, setShowDrawer] = useState(false);
  const [showNotifPopUp, setShowNotifPopUp] = useState(false);
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [showEditOrgModal, setShowEditOrgModal] = useState(false);
  const [showJoinOrgModal, setShowJoinOrgModal] = useState(false);
  const [showShareDossierModal, setShowShareDossierModal] = useState(false);
  const [showShareClientModal, setShowShareClientModal] = useState(false);

  // Formulaire Création Org
  const [newOrgNom, setNewOrgNom] = useState('');
  const [newOrgDesc, setNewOrgDesc] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);

  // Formulaire Édition Org
  const [editOrgDesc, setEditOrgDesc] = useState('');
  const [updatingOrg, setUpdatingOrg] = useState(false);

  // Recherche Org à rejoindre
  const [searchJoinOrg, setSearchJoinOrg] = useState('');
  const [requestingJoinNom, setRequestingJoinNom] = useState<string | null>(null);

  // Notifications & Invitations
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);
  const [nonLues, setNonLues] = useState(0);
  const [pendingInvsCount, setPendingInvsCount] = useState(0);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

  // Backend Data Hooks
  const { dossiers, refetch: refetchDossiers } = useDossiers({ pageSize: 50 });
  const { clients, refetch: refetchClients } = useClients({ pageSize: 50 });
  const { audiences } = useAudiences({ pageSize: 50 });
  const {
    factures,
    totalFacture,
    totalEncaisse,
    totalImpaye,
    tauxRecouvrement,
    refetch: refetchFactures,
    create: createFactureApi,
  } = useFactures();

  // Modal Nouvelle Facture (Chef)
  const [showFactureModal, setShowFactureModal] = useState(false);
  const [factDossierId, setFactDossierId] = useState<number | undefined>(undefined);
  const [factMontantHt, setFactMontantHt] = useState('');
  const [factTva, setFactTva] = useState('19.25');
  const [factEcheance, setFactEcheance] = useState('');
  const [factDesc, setFactDesc] = useState('');
  const [creatingFact, setCreatingFact] = useState(false);

  // Chargement des notifications & comptage boîte de réception
  const fetchNotifs = useCallback(async () => {
    setLoadingNotifs(true);
    try {
      const [res, invs] = await Promise.all([
        getNotifications().catch(() => ({ data: [], nonLuesCount: 0 })),
        chargerDonneesInvitationsPersistantes().catch(() => []),
      ]);
      const pendingCount = invs.filter((i) => i.statut === 'en_attente').length;
      setPendingInvsCount(pendingCount);
      setNotifs(res.data || []);
      setNonLues(res.nonLuesCount || 0);
    } catch {
      setNotifs([]);
      setNonLues(0);
    } finally {
      setLoadingNotifs(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifs();
  }, [fetchNotifs]);

  const handleMarkAllRead = async () => {
    try {
      await marquerToutesNotificationsCommeLues();
      setNotifs((prev) => prev.map((n) => ({ ...n, lu: true })));
      setNonLues(0);
    } catch (e) {
      console.log('Erreur marquer lues:', e);
    }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await marquerNotificationCommeLue(id);
      setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, lu: true } : n)));
      setNonLues((p) => Math.max(0, p - 1));
    } catch (e) {
      console.log('Error mark read:', e);
    }
  };

  // ── Actions Organisation ──

  const handleCreateOrgSubmit = async () => {
    const nomTrimmed = newOrgNom.trim();
    if (!nomTrimmed) {
      setCreateOrgError("Veuillez saisir un nom pour l'organisation.");
      return;
    }
    setCreatingOrg(true);
    setCreateOrgError(null);
    try {
      const created = await creerOrgApi(nomTrimmed, newOrgDesc.trim() || undefined);
      setNewOrgNom('');
      setNewOrgDesc('');
      setShowCreateOrgModal(false);
      if (created) {
        setSelectedOrgNom(created.nom);
      }
      Alert.alert('✅ Succès', `L'organisation "${nomTrimmed}" a été créée.`);
    } catch (e: any) {
      setCreateOrgError(extractErrorMessage(e));
    } finally {
      setCreatingOrg(false);
    }
  };

  const handleOpenEditOrg = () => {
    if (!activeOrgDetails) return;
    setEditOrgDesc(activeOrgDetails.description || '');
    setShowEditOrgModal(true);
  };

  const handleUpdateOrgSubmit = async () => {
    if (!selectedOrgNom) return;
    setUpdatingOrg(true);
    try {
      await modifierOrganisation(selectedOrgNom, { description: editOrgDesc.trim() });
      setShowEditOrgModal(false);
      await fetchActiveOrgDetails();
      await refetchOrgs();
      Alert.alert('✅ Succès', "Informations de l'organisation mises à jour.");
    } catch (e: any) {
      Alert.alert('Erreur', extractErrorMessage(e));
    } finally {
      setUpdatingOrg(false);
    }
  };

  const handleDeleteOrg = () => {
    if (!selectedOrgNom) return;
    Alert.alert(
      `Supprimer l'organisation "${selectedOrgNom}" ?`,
      "Cette action supprimera l'organisation. Vos dossiers, clients et documents individuels restent intacts.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer définitivement',
          style: 'destructive',
          onPress: async () => {
            try {
              await supprimerOrganisation(selectedOrgNom);
              setSelectedOrgNom(null);
              await refetchOrgs();
              Alert.alert('✅ Succès', "L'organisation a été supprimée.");
            } catch (e: any) {
              Alert.alert('Erreur', extractErrorMessage(e));
            }
          },
        },
      ],
    );
  };

  const handleDemanderRejoindre = async (orgNom: string) => {
    setRequestingJoinNom(orgNom);
    try {
      await demanderRejoindre(orgNom);
      Alert.alert('✅ Demande transmise', `Votre demande pour rejoindre "${orgNom}" a été envoyée au chef.`);
      fetchToutesOrgs();
    } catch (e: any) {
      Alert.alert('Information', extractErrorMessage(e));
    } finally {
      setRequestingJoinNom(null);
    }
  };

  const handlePartagerDossierSubmit = async (dossierId: number) => {
    if (!selectedOrgNom) return;
    try {
      await partagerDossier(selectedOrgNom, dossierId);
      setShowShareDossierModal(false);
      fetchActiveOrgDetails();
      Alert.alert('✅ Succès', "Dossier partagé dans l'organisation.");
    } catch (e: any) {
      Alert.alert('Erreur', extractErrorMessage(e));
    }
  };

  const handlePartagerClientSubmit = async (clientId: number) => {
    if (!selectedOrgNom) return;
    try {
      await partagerClient(selectedOrgNom, clientId);
      setShowShareClientModal(false);
      fetchActiveOrgDetails();
      Alert.alert('✅ Succès', "Client partagé dans l'organisation.");
    } catch (e: any) {
      Alert.alert('Erreur', extractErrorMessage(e));
    }
  };

  const handleRetirerDossier = (dossierId: number) => {
    if (!selectedOrgNom) return;
    Alert.alert('Retirer le dossier ?', "Ce dossier ne sera plus visible dans l'organisation.", [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await retirerDossier(selectedOrgNom, dossierId);
            fetchActiveOrgDetails();
          } catch (e: any) {
            Alert.alert('Erreur', extractErrorMessage(e));
          }
        },
      },
    ]);
  };

  const handleRetirerClient = (clientId: number) => {
    if (!selectedOrgNom) return;
    Alert.alert('Retirer le client ?', "Ce client ne sera plus partagé dans l'organisation.", [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await retirerClient(selectedOrgNom, clientId);
            fetchActiveOrgDetails();
          } catch (e: any) {
            Alert.alert('Erreur', extractErrorMessage(e));
          }
        },
      },
    ]);
  };

  const handleSupprimerMembre = (userId: number, nomMembre: string) => {
    if (!selectedOrgNom) return;
    Alert.alert(`Retirer ${nomMembre} ?`, "Ce membre n'aura plus accès à l'organisation.", [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerMembre(selectedOrgNom, userId);
            fetchActiveOrgDetails();
          } catch (e: any) {
            Alert.alert('Erreur', extractErrorMessage(e));
          }
        },
      },
    ]);
  };

  const handleTraiterDemande = async (id: number, action: 'accepted' | 'rejected') => {
    try {
      await traiterDemande(id, action);
      fetchActiveOrgDetails();
    } catch (e: any) {
      Alert.alert('Erreur', extractErrorMessage(e));
    }
  };

  // Clic sur dossier dans l'organisation
  const handleOpenOrgDossier = (d: any) => {
    if (d.estProprietaire || hasDossierAccess(Number(d.id))) {
      router.push({ pathname: '/affaire/[id]', params: { id: d.id } });
    } else {
      Alert.alert(
        '🔒 Accès Restreint',
        `Ce dossier appartient à ${d.proprietaireNom}.\n\nPour consulter ses documents, une autorisation du propriétaire est requise.`,
        [
          { text: 'Fermer', style: 'cancel' },
          {
            text: "Demander l'accès",
            onPress: () => {
              Alert.alert('Demande transmise', `Une demande d'accès a été envoyée à ${d.proprietaireNom}.`);
            },
          },
        ],
      );
    }
  };

  // Handlers Facturation (Chef)
  const handleOpenFactureModal = () => {
    if (dossiers.length > 0) setFactDossierId(Number(dossiers[0].id));
    setFactMontantHt('');
    setFactTva('19.25');
    const defaultEch = new Date();
    defaultEch.setDate(defaultEch.getDate() + 30);
    setFactEcheance(defaultEch.toISOString().slice(0, 10));
    setFactDesc('');
    setShowFactureModal(true);
  };

  const handleCreateFactureSubmit = async () => {
    if (!factMontantHt || isNaN(Number(factMontantHt)) || Number(factMontantHt) <= 0) {
      Alert.alert('Erreur', 'Veuillez saisir un montant HT valide.');
      return;
    }
    const dossierSelected = dossiers.find((d) => Number(d.id) === Number(factDossierId));
    setCreatingFact(true);
    try {
      await createFactureApi({
        dossierId: factDossierId ?? 0,
        clientId: dossierSelected ? Number(dossierSelected.clientId) : 1,
        montantHt: Number(factMontantHt),
        tauxTva: Number(factTva),
        dateEcheance: factEcheance || undefined,
        description: factDesc || undefined,
      });
      setFactMontantHt('');
      setFactDesc('');
      setShowFactureModal(false);
      refetchFactures();
      Alert.alert('Succès', 'Facture créée avec succès.');
    } catch (e) {
      Alert.alert('Erreur', extractErrorMessage(e));
    } finally {
      setCreatingFact(false);
    }
  };

  // Calculs KPIs
  const affairesActives = dossiers.filter((d) => d.statut !== 'Cloture').length;
  const affairesCloturees = dossiers.filter((d) => d.statut === 'Cloture').length;
  const facturesRetard = factures.filter((f) => f.statut === 'en_retard');
  const affairesRecentes = dossiers.slice(0, 5);

  const dossiersNonPartages = dossiers.filter(
    (d) => !activeOrgDetails?.dossiers.some((od) => Number(od.id) === Number(d.id)),
  );
  const clientsNonPartages = clients.filter(
    (c) => !activeOrgDetails?.clients.some((oc) => Number(oc.id) === Number(c.id)),
  );

  return (
    <SafeAreaView style={[s.container, { backgroundColor: K.background }]} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={K.surface} />

      {/* ── BARRE DU HAUT : Profil Utilisateur + Boîte de Réception + Cloche ── */}
      <View style={[s.topBar, { backgroundColor: K.surface, borderBottomColor: K.border }]}>
        {/* Utilisateur : Avatar + Nom */}
        <TouchableOpacity
          style={s.userProfileHeader}
          onPress={() => setShowDrawer(true)}
          activeOpacity={0.7}
        >
          <View style={s.userAvatar}>
            <Text style={s.userAvatarText}>{initials(user?.nom || user?.email)}</Text>
          </View>
          <View>
            <Text style={[s.userNameText, { color: K.text }]} numberOfLines={1}>
              {user?.nom || 'Avocat'}
            </Text>
            <Text style={[s.userRoleText, { color: K.textMuted }]}>
              {user?.role || 'Cabinet Manager'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Actions : Boîte de réception + Cloche */}
        <View style={s.headerActions}>
          {/* 📬 BOÎTE DE RÉCEPTION */}
          <TouchableOpacity
            style={[s.iconBtn, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}
            onPress={() => router.push('/invitations-mail')}
            activeOpacity={0.7}
          >
            <Mail color={pendingInvsCount > 0 ? C.amber500 : K.textMuted} size={19} />
            {pendingInvsCount > 0 && (
              <View style={s.badgeCounter}>
                <Text style={s.badgeCounterText}>{pendingInvsCount > 9 ? '9+' : pendingInvsCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* 🔔 CLOCHE NOTIFICATIONS */}
          <TouchableOpacity
            style={[s.iconBtn, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}
            onPress={() => setShowNotifPopUp(true)}
            activeOpacity={0.7}
          >
            <Bell color={nonLues > 0 ? C.amber500 : K.textMuted} size={19} />
            {nonLues > 0 && (
              <View style={[s.badgeCounter, { backgroundColor: '#ef4444' }]}>
                <Text style={s.badgeCounterText}>{nonLues > 99 ? '99+' : nonLues}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── ONGLETS DU DASHBOARD (Style Pilules Élégantes) ── */}
      <View style={[s.dashTabsBar, { backgroundColor: K.surface, borderBottomColor: K.border }]}>
        {dashboardTabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                s.dashTabBtn,
                active && {
                  borderBottomColor: C.amber500,
                  backgroundColor: isDark ? 'rgba(245,158,11,0.08)' : C.amber50,
                },
              ]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.75}
            >
              <tab.Icon color={active ? C.amber500 : K.textMuted} size={16} />
              <Text
                style={[
                  s.dashTabBtnText,
                  { color: active ? C.amber500 : K.textMuted },
                  active && { fontWeight: '700' },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={s.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loadingOrgs || loadingActiveOrg}
            onRefresh={() => {
              refetchOrgs();
              fetchActiveOrgDetails();
              fetchNotifs();
              refetchDossiers();
            }}
            tintColor={C.amber500}
          />
        }
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* ════════════════════════════════════════════════════════════════════════
            1. VUE D'ENSEMBLE (STYLE GRAPHIQUE ÉLÉGANT D'ORIGINE)
           ════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <View style={s.sectionPad}>
            {/* Cartes KPIs Réelles */}
            <View style={s.kpiGrid}>
              <View style={[s.kpiCard, { backgroundColor: K.surface, borderLeftColor: C.amber500 }]}>
                <View style={[s.kpiIconWrap, { backgroundColor: isDark ? 'rgba(245,158,11,0.2)' : C.amber50 }]}>
                  <Briefcase color={C.amber600} size={18} />
                </View>
                <Text style={[s.kpiVal, { color: K.text }]}>{affairesActives}</Text>
                <Text style={[s.kpiLabel, { color: K.textMuted }]}>Affaires en cours</Text>
              </View>

              <View style={[s.kpiCard, { backgroundColor: K.surface, borderLeftColor: C.blue500 }]}>
                <View style={[s.kpiIconWrap, { backgroundColor: isDark ? 'rgba(59,130,246,0.2)' : C.blue50 }]}>
                  <CalendarIcon color={C.blue600} size={18} />
                </View>
                <Text style={[s.kpiVal, { color: K.text }]}>{audiences.length}</Text>
                <Text style={[s.kpiLabel, { color: K.textMuted }]}>Audiences</Text>
              </View>

              <View style={[s.kpiCard, { backgroundColor: K.surface, borderLeftColor: C.green500 }]}>
                <View style={[s.kpiIconWrap, { backgroundColor: isDark ? 'rgba(34,197,94,0.2)' : C.green50 }]}>
                  <CheckCircle2 color={C.green600} size={18} />
                </View>
                <Text style={[s.kpiVal, { color: K.text }]}>{affairesCloturees}</Text>
                <Text style={[s.kpiLabel, { color: K.textMuted }]}>Clôturées</Text>
              </View>
            </View>

            {/* Rappels & Alertes */}
            <Text style={[s.sectionTitle, { color: K.text, marginTop: 14, marginBottom: 8 }]}>
              Rappels & Notifications
            </Text>
            <View style={{ gap: 8 }}>
              {facturesRetard.length > 0 && isChefInAnyOrg && (
                <TouchableOpacity
                  style={s.reminderCardAlert}
                  onPress={() => setActiveTab('facturation')}
                  activeOpacity={0.85}
                >
                  <AlertTriangle color={C.red600} size={18} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.reminderAlertTitle}>Facture(s) en retard d'encaissement</Text>
                    <Text style={s.reminderAlertSub}>
                      {facturesRetard.length} facture(s) nécessitent une relance client.
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              <View style={s.reminderCardInfo}>
                <Bell color={C.amber600} size={18} />
                <View style={{ flex: 1 }}>
                  <Text style={s.reminderInfoTitle}>Planning du jour</Text>
                  <Text style={s.reminderInfoSub}>
                    {audiences.length > 0
                      ? `${audiences.length} audience(s) et échéance(s) au calendrier.`
                      : 'Aucune audience critique enregistrée.'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Actions Rapides Métier */}
            <Text style={[s.sectionTitle, { color: K.text, marginTop: 18, marginBottom: 8 }]}>
              Actions rapides
            </Text>
            <View style={s.quickActionsGrid}>
              <TouchableOpacity
                style={[s.actionCard, { backgroundColor: K.surface, borderColor: K.border }]}
                onPress={() => router.push('/affaires')}
                activeOpacity={0.8}
              >
                <View style={[s.actionIcon, { backgroundColor: isDark ? 'rgba(245,158,11,0.2)' : C.amber100 }]}>
                  <Plus color={isDark ? C.amber400 : C.amber900} size={18} />
                </View>
                <Text style={[s.actionTitle, { color: K.text }]}>Nouveau Dossier</Text>
                <Text style={[s.actionSub, { color: K.textMuted }]}>Ouvrir une affaire</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.actionCard, { backgroundColor: K.surface, borderColor: K.border }]}
                onPress={() => router.push('/audiences')}
                activeOpacity={0.8}
              >
                <View style={[s.actionIcon, { backgroundColor: isDark ? 'rgba(147,51,234,0.2)' : C.purple100 }]}>
                  <CalendarIcon color={isDark ? '#c084fc' : C.purple600} size={18} />
                </View>
                <Text style={[s.actionTitle, { color: K.text }]}>Calendrier</Text>
                <Text style={[s.actionSub, { color: K.textMuted }]}>Agenda & audiences</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.actionCard, { backgroundColor: K.surface, borderColor: K.border }]}
                onPress={() => router.push('/clients')}
                activeOpacity={0.8}
              >
                <View style={[s.actionIcon, { backgroundColor: isDark ? 'rgba(59,130,246,0.2)' : C.blue100 }]}>
                  <Users color={isDark ? C.blue500 : C.blue700} size={18} />
                </View>
                <Text style={[s.actionTitle, { color: K.text }]}>Fiche Client</Text>
                <Text style={[s.actionSub, { color: K.textMuted }]}>Répertoire contacts</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.actionCard, { backgroundColor: K.surface, borderColor: K.border }]}
                onPress={() => setActiveTab('organisation')}
                activeOpacity={0.8}
              >
                <View style={[s.actionIcon, { backgroundColor: isDark ? 'rgba(34,197,94,0.2)' : C.green100 }]}>
                  <Building2 color={isDark ? C.green500 : C.green700} size={18} />
                </View>
                <Text style={[s.actionTitle, { color: K.text }]}>Organisation</Text>
                <Text style={[s.actionSub, { color: K.textMuted }]}>
                  {mesOrgs.length > 0 ? selectedOrgNom : 'Créer / Rejoindre'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Dossiers Récents */}
            <View style={[s.sectionHeaderRow, { marginTop: 18 }]}>
              <Text style={[s.sectionTitle, { color: K.text }]}>Dossiers récents</Text>
              <TouchableOpacity onPress={() => router.push('/affaires')}>
                <Text style={s.seeAllText}>Voir tout</Text>
              </TouchableOpacity>
            </View>

            {affairesRecentes.length === 0 ? (
              <View style={[s.emptyCard, { backgroundColor: K.surface }]}>
                <FileText color={K.textMuted} size={28} />
                <Text style={[s.emptyText, { color: K.textMuted }]}>Aucun dossier actif</Text>
              </View>
            ) : (
              affairesRecentes.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[s.dossierRowCard, { backgroundColor: K.surface, borderColor: K.border }]}
                  onPress={() => router.push({ pathname: '/affaire/[id]', params: { id: d.id } })}
                  activeOpacity={0.85}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Text style={s.dossierNum}>{d.numeroAffaire}</Text>
                      <View
                        style={[
                          s.statusPill,
                          d.statut === 'Ouvert'
                            ? { backgroundColor: isDark ? 'rgba(59,130,246,0.2)' : C.blue100 }
                            : { backgroundColor: isDark ? 'rgba(249,115,22,0.2)' : C.orange100 },
                        ]}
                      >
                        <Text
                          style={[
                            s.statusPillText,
                            d.statut === 'Ouvert'
                              ? { color: isDark ? C.blue500 : C.blue700 }
                              : { color: isDark ? '#fb923c' : C.orange700 },
                          ]}
                        >
                          {d.statut}
                        </Text>
                      </View>
                    </View>
                    <Text style={[s.dossierTitle, { color: K.text }]} numberOfLines={1}>
                      {d.titre}
                    </Text>
                    {d.juridiction && <Text style={[s.dossierJur, { color: K.textMuted }]}>{d.juridiction}</Text>}
                  </View>
                  <ArrowUpRight color={K.textMuted} size={18} />
                </TouchableOpacity>
              ))
            )}

            {/* Assistant IA Box */}
            <View style={{ marginTop: 20 }}>
              <DashboardAIChatBox />
            </View>
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            2. ONGLET ORGANISATION (POUR TOUS LES UTILISATEURS)
           ════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'organisation' && (
          <View style={s.sectionPad}>
            {/* Cas A : L'utilisateur n'a AUCUNE organisation */}
            {mesOrgs.length === 0 ? (
              <View style={[s.emptyOrgCard, { backgroundColor: K.surface, borderColor: K.border }]}>
                <View style={[s.emptyOrgIconWrap, { backgroundColor: C.amber500 + '15' }]}>
                  <Building2 color={C.amber500} size={40} />
                </View>
                <Text style={[s.emptyOrgTitle, { color: K.text }]}>Aucune Organisation</Text>
                <Text style={[s.emptyOrgSub, { color: K.textMuted }]}>
                  Vous ne faites partie d'aucune organisation pour le moment. Vous pouvez en créer une pour votre cabinet ou demander à en rejoindre une existante.
                </Text>

                <View style={s.emptyOrgActions}>
                  <TouchableOpacity
                    style={s.btnPrimary}
                    onPress={() => {
                      setCreateOrgError(null);
                      setShowCreateOrgModal(true);
                    }}
                  >
                    <Plus color="#fff" size={16} />
                    <Text style={s.btnPrimaryText}>Créer une organisation</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.btnSecondary, { borderColor: K.border }]}
                    onPress={() => {
                      fetchToutesOrgs();
                      setShowJoinOrgModal(true);
                    }}
                  >
                    <Search color={K.text} size={16} />
                    <Text style={[s.btnSecondaryText, { color: K.text }]}>Rejoindre une organisation</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* Cas B : L'utilisateur A une organisation */
              <View>
                {/* ── En-tête Organisation ── */}
                <View style={[s.orgHeaderCard, { backgroundColor: K.surface, borderColor: K.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={s.orgAvatarLarge}>
                      <Text style={s.orgAvatarLargeText}>{initials(selectedOrgNom || '')}</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[s.orgHeaderTitle, { color: K.text }]} numberOfLines={1}>
                          {selectedOrgNom}
                        </Text>
                        <View style={[s.rolePill, isChefInActiveOrg ? s.rolePillChef : s.rolePillMembre]}>
                          <Text style={isChefInActiveOrg ? s.rolePillChefText : s.rolePillMembreText}>
                            {isChefInActiveOrg ? '👑 Chef' : 'Membre'}
                          </Text>
                        </View>
                      </View>

                      <Text style={[s.orgHeaderSub, { color: K.textMuted }]} numberOfLines={2}>
                        {activeOrgDetails?.description || `Créée le ${formatDate(activeOrgDetails?.createdAt)}`}
                      </Text>
                    </View>
                  </View>

                  {/* Actions Chef sur l'organisation (Modifier / Supprimer) */}
                  {isChefInActiveOrg && (
                    <View style={s.orgChefActionRow}>
                      <TouchableOpacity style={[s.chefBtn, { borderColor: K.border }]} onPress={handleOpenEditOrg}>
                        <Edit2 color={C.amber500} size={13} />
                        <Text style={[s.chefBtnText, { color: K.text }]}>Modifier</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[s.chefBtn, { borderColor: '#ef444440', backgroundColor: '#ef444410' }]}
                        onPress={handleDeleteOrg}
                      >
                        <Trash2 color="#ef4444" size={13} />
                        <Text style={[s.chefBtnText, { color: '#ef4444' }]}>Supprimer</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Sélecteur si multi-organisations */}
                  {mesOrgs.length > 1 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {mesOrgs.map((o) => (
                          <TouchableOpacity
                            key={o.nom}
                            style={[
                              s.orgSwitchChip,
                              { borderColor: K.border },
                              selectedOrgNom === o.nom && { backgroundColor: C.amber500, borderColor: C.amber500 },
                            ]}
                            onPress={() => setSelectedOrgNom(o.nom)}
                          >
                            <Text
                              style={[
                                s.orgSwitchChipText,
                                { color: K.textMuted },
                                selectedOrgNom === o.nom && { color: '#fff', fontWeight: '700' },
                              ]}
                            >
                              {o.nom}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  )}
                </View>

                {/* ── Sous-Onglets (Dossiers, Clients, Membres, Demandes) ── */}
                <View style={s.subTabsRow}>
                  {[
                    { id: 'dossiers', label: 'Dossiers', count: activeOrgDetails?.dossiers.length },
                    { id: 'clients', label: 'Clients', count: activeOrgDetails?.clients.length },
                    { id: 'membres', label: 'Membres', count: activeOrgDetails?.membres.length },
                    ...(isChefInActiveOrg && (activeOrgDetails?.demandesEnAttente.length || 0) > 0
                      ? [{ id: 'demandes' as OrgSubTab, label: 'Demandes', count: activeOrgDetails?.demandesEnAttente.length }]
                      : []),
                  ].map((tab) => {
                    const active = activeOrgSubTab === tab.id;
                    return (
                      <TouchableOpacity
                        key={tab.id}
                        style={[s.subTabItem, active && s.subTabItemActive]}
                        onPress={() => setActiveOrgSubTab(tab.id as OrgSubTab)}
                      >
                        <Text style={[s.subTabItemText, { color: active ? C.amber500 : K.textMuted }, active && { fontWeight: '700' }]}>
                          {tab.label} {tab.count !== undefined ? `(${tab.count})` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* ── 1. SOUS-ONGLET : DOSSIERS ── */}
                {activeOrgSubTab === 'dossiers' && (
                  <View style={{ marginTop: 12 }}>
                    <View style={s.sectionHeaderRow}>
                      <Text style={[s.sectionTitle, { color: K.text }]}>Dossiers partagés</Text>
                      {dossiersNonPartages.length > 0 && (
                        <TouchableOpacity style={s.btnPrimarySmall} onPress={() => setShowShareDossierModal(true)}>
                          <Plus color="#fff" size={13} />
                          <Text style={s.btnPrimarySmallText}>Partager un dossier</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {activeOrgDetails?.dossiers.length === 0 ? (
                      <View style={[s.emptyCard, { backgroundColor: K.surface }]}>
                        <FolderOpen color={K.textMuted} size={30} />
                        <Text style={[s.emptyText, { color: K.textMuted }]}>Aucun dossier partagé</Text>
                        {dossiersNonPartages.length > 0 && (
                          <TouchableOpacity
                            style={[s.btnPrimary, { marginTop: 10 }]}
                            onPress={() => setShowShareDossierModal(true)}
                          >
                            <Plus color="#fff" size={14} />
                            <Text style={s.btnPrimaryText}>Partager un dossier</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      activeOrgDetails?.dossiers.map((d) => (
                        <TouchableOpacity
                          key={d.id}
                          style={[s.orgDossierListRow, { backgroundColor: K.surface, borderColor: K.border }]}
                          onPress={() => handleOpenOrgDossier(d)}
                          activeOpacity={0.8}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={[s.dossierTitle, { color: C.amber500 }]}>{d.titre}</Text>
                              <View style={[s.statusPill, { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : C.blue50 }]}>
                                <Text style={[s.statusPillText, { color: C.blue500 }]}>{d.statut}</Text>
                              </View>
                            </View>

                            <Text style={[s.dossierJur, { color: K.textMuted }]}>
                              N° {d.numeroAffaire} {d.juridiction ? `· ${d.juridiction}` : ''}
                            </Text>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                              <View style={[s.dotIndicator, { backgroundColor: d.estProprietaire ? C.green500 : C.amber500 }]} />
                              <Text style={[s.creatorName, { color: K.textMuted }]}>
                                Créateur : {d.proprietaireNom}
                              </Text>
                            </View>
                          </View>

                          <View style={{ alignItems: 'flex-end', gap: 6 }}>
                            {d.estProprietaire ? (
                              <TouchableOpacity onPress={() => handleRetirerDossier(d.id)} style={{ padding: 6 }}>
                                <Trash2 color="#ef4444" size={16} />
                              </TouchableOpacity>
                            ) : (
                              <Lock color={K.textMuted} size={14} />
                            )}
                          </View>
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                )}

                {/* ── 2. SOUS-ONGLET : CLIENTS ── */}
                {activeOrgSubTab === 'clients' && (
                  <View style={{ marginTop: 12 }}>
                    <View style={s.sectionHeaderRow}>
                      <Text style={[s.sectionTitle, { color: K.text }]}>Clients partagés</Text>
                      {clientsNonPartages.length > 0 && (
                        <TouchableOpacity style={s.btnPrimarySmall} onPress={() => setShowShareClientModal(true)}>
                          <Plus color="#fff" size={13} />
                          <Text style={s.btnPrimarySmallText}>Partager un client</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {activeOrgDetails?.clients.length === 0 ? (
                      <View style={[s.emptyCard, { backgroundColor: K.surface }]}>
                        <Users color={K.textMuted} size={30} />
                        <Text style={[s.emptyText, { color: K.textMuted }]}>Aucun client partagé</Text>
                      </View>
                    ) : (
                      activeOrgDetails?.clients.map((c) => (
                        <View key={c.id} style={[s.clientRowCard, { backgroundColor: K.surface, borderColor: K.border }]}>
                          <View style={s.clientAvatar}>
                            <Text style={s.clientAvatarText}>{initials(c.nomComplet)}</Text>
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={[s.dossierTitle, { color: K.text }]}>{c.nomComplet}</Text>
                            {c.telephone && <Text style={[s.dossierJur, { color: K.textMuted }]}>📞 {c.telephone}</Text>}
                            {c.email && <Text style={[s.dossierJur, { color: K.textMuted }]}>✉️ {c.email}</Text>}
                          </View>
                          {c.estProprietaire && (
                            <TouchableOpacity onPress={() => handleRetirerClient(c.id)} style={{ padding: 6 }}>
                              <Trash2 color="#ef4444" size={16} />
                            </TouchableOpacity>
                          )}
                        </View>
                      ))
                    )}
                  </View>
                )}

                {/* ── 3. SOUS-ONGLET : MEMBRES ── */}
                {activeOrgSubTab === 'membres' && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[s.sectionTitle, { color: K.text, marginBottom: 10 }]}>Membres de l'organisation</Text>
                    {activeOrgDetails?.membres.map((m) => (
                      <View key={m.userId} style={[s.memberRowCard, { backgroundColor: K.surface, borderColor: K.border }]}>
                        <View style={s.memberAvatar}>
                          <Text style={s.memberAvatarText}>{initials(m.nom)}</Text>
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={[s.dossierTitle, { color: K.text }]}>{m.nom}</Text>
                          <Text style={[s.dossierJur, { color: K.textMuted }]}>
                            {m.email || m.telephone || 'Membre'} · Depuis {formatDate(m.joinedAt)}
                          </Text>
                        </View>
                        <View style={[s.rolePill, m.role === 'chef' ? s.rolePillChef : s.rolePillMembre]}>
                          <Text style={m.role === 'chef' ? s.rolePillChefText : s.rolePillMembreText}>
                            {m.role === 'chef' ? '👑 Chef' : 'Membre'}
                          </Text>
                        </View>
                        {isChefInActiveOrg && m.role !== 'chef' && (
                          <TouchableOpacity onPress={() => handleSupprimerMembre(m.userId, m.nom)} style={{ marginLeft: 8, padding: 4 }}>
                            <UserMinus color="#ef4444" size={16} />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {/* ── 4. SOUS-ONGLET : DEMANDES (CHEF ONLY) ── */}
                {activeOrgSubTab === 'demandes' && isChefInActiveOrg && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[s.sectionTitle, { color: K.text, marginBottom: 10 }]}>Demandes d'adhésion</Text>
                    {activeOrgDetails?.demandesEnAttente.length === 0 ? (
                      <View style={[s.emptyCard, { backgroundColor: K.surface }]}>
                        <CheckCircle2 color={C.green500} size={28} />
                        <Text style={[s.emptyText, { color: K.textMuted }]}>Aucune demande en attente</Text>
                      </View>
                    ) : (
                      activeOrgDetails?.demandesEnAttente.map((req) => (
                        <View key={req.id} style={[s.requestCard, { backgroundColor: K.surface, borderColor: K.border }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.dossierTitle, { color: K.text }]}>
                              {req.user?.nom || req.user?.email || `Utilisateur #${req.userId}`}
                            </Text>
                            <Text style={[s.dossierJur, { color: K.textMuted }]}>Reçue le {formatDate(req.createdAt)}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 6 }}>
                            <TouchableOpacity
                              style={[s.btnSmallAction, { backgroundColor: C.green500 }]}
                              onPress={() => handleTraiterDemande(req.id, 'accepted')}
                            >
                              <Check color="#fff" size={14} />
                              <Text style={s.btnSmallActionText}>Accepter</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[s.btnSmallAction, { backgroundColor: '#ef444420', borderWidth: 1, borderColor: '#ef4444' }]}
                              onPress={() => handleTraiterDemande(req.id, 'rejected')}
                            >
                              <X color="#ef4444" size={14} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* ════════════════════════════════════════════════════════════════════════
            3. FACTURATION (CHEF UNIQUEMENT)
           ════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'facturation' && isChefInAnyOrg && (
          <View style={s.sectionPad}>
            <View style={s.sectionHeaderRow}>
              <Text style={[s.agendaHeaderTitle, { color: K.text }]}>Facturation & Trésorerie</Text>
              <TouchableOpacity style={s.btnPrimarySmall} onPress={handleOpenFactureModal}>
                <Plus color="#fff" size={14} />
                <Text style={s.btnPrimarySmallText}>Nouvelle Facture</Text>
              </TouchableOpacity>
            </View>

            {/* Chiffres clés */}
            <View style={s.statsGrid}>
              <View style={[s.statBox, { backgroundColor: K.surface, borderColor: K.border }]}>
                <Text style={[s.statNumber, { color: C.green500 }]}>
                  {(totalEncaisse || 0).toLocaleString('fr-FR')} F
                </Text>
                <Text style={[s.statDesc, { color: K.textMuted }]}>Encaissé</Text>
              </View>
              <View style={[s.statBox, { backgroundColor: K.surface, borderColor: K.border }]}>
                <Text style={[s.statNumber, { color: '#ef4444' }]}>
                  {(totalImpaye || 0).toLocaleString('fr-FR')} F
                </Text>
                <Text style={[s.statDesc, { color: K.textMuted }]}>Impayés</Text>
              </View>
              <View style={[s.statBox, { backgroundColor: K.surface, borderColor: K.border }]}>
                <Text style={[s.statNumber, { color: C.amber500 }]}>{tauxRecouvrement || 0}%</Text>
                <Text style={[s.statDesc, { color: K.textMuted }]}>Recouvrement</Text>
              </View>
            </View>

            {/* Liste Factures */}
            <Text style={[s.sectionTitle, { color: K.text, marginTop: 16, marginBottom: 10 }]}>
              Dernières factures émises
            </Text>

            {factures.length === 0 ? (
              <View style={[s.emptyCard, { backgroundColor: K.surface }]}>
                <Receipt color={K.textMuted} size={28} />
                <Text style={[s.emptyText, { color: K.textMuted }]}>Aucune facture</Text>
              </View>
            ) : (
              factures.slice(0, 8).map((f) => (
                <View
                  key={f.id}
                  style={[s.factureRow, { backgroundColor: K.surface, borderColor: K.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.dossierTitle, { color: K.text }]}>Facture N° {f.numeroFacture}</Text>
                    <Text style={[s.dossierJur, { color: K.textMuted }]}>
                      {(Number(f.montantTtc) || 0).toLocaleString('fr-FR')} FCFA · Échéance {formatDate(f.dateEcheance)}
                    </Text>
                  </View>
                  <View
                    style={[
                      s.statusPill,
                      f.statut === 'payee'
                        ? { backgroundColor: C.green500 + '20' }
                        : { backgroundColor: '#ef444420' },
                    ]}
                  >
                    <Text
                      style={[
                        s.statusPillText,
                        f.statut === 'payee' ? { color: C.green500 } : { color: '#ef4444' },
                      ]}
                    >
                      {f.statut}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* ════════════════════════════════════════════════════════════════════════
          MODALS (Création, Édition, Rejoindre, Partager, Notifications)
         ════════════════════════════════════════════════════════════════════════ */}

      {/* Modal Création Org */}
      <Modal visible={showCreateOrgModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: K.surface }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: K.text }]}>Créer une Organisation</Text>
              <TouchableOpacity onPress={() => setShowCreateOrgModal(false)}>
                <X color={K.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            {createOrgError && (
              <View style={s.errorBanner}>
                <AlertTriangle color="#ef4444" size={16} />
                <Text style={s.errorBannerText}>{createOrgError}</Text>
              </View>
            )}

            <Text style={[s.inputLabel, { color: K.text }]}>Nom de l'organisation *</Text>
            <TextInput
              style={[s.inputField, { backgroundColor: K.background, color: K.text, borderColor: K.border }]}
              placeholder="ex: Cabinet-Avocats-Associes"
              placeholderTextColor={K.textMuted}
              value={newOrgNom}
              onChangeText={(t) => {
                setNewOrgNom(t);
                setCreateOrgError(null);
              }}
            />

            <Text style={[s.inputLabel, { color: K.text, marginTop: 12 }]}>Description (optionnel)</Text>
            <TextInput
              style={[s.inputField, s.textArea, { backgroundColor: K.background, color: K.text, borderColor: K.border }]}
              placeholder="Spécialité du cabinet ou description..."
              placeholderTextColor={K.textMuted}
              multiline
              numberOfLines={3}
              value={newOrgDesc}
              onChangeText={setNewOrgDesc}
            />

            <TouchableOpacity
              style={[s.btnPrimary, { marginTop: 20 }, creatingOrg && { opacity: 0.6 }]}
              onPress={handleCreateOrgSubmit}
              disabled={creatingOrg}
            >
              {creatingOrg ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.btnPrimaryText}>Créer l'organisation</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Édition Org */}
      <Modal visible={showEditOrgModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: K.surface }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: K.text }]}>Modifier "{selectedOrgNom}"</Text>
              <TouchableOpacity onPress={() => setShowEditOrgModal(false)}>
                <X color={K.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            <Text style={[s.inputLabel, { color: K.text }]}>Description</Text>
            <TextInput
              style={[s.inputField, s.textArea, { backgroundColor: K.background, color: K.text, borderColor: K.border }]}
              placeholder="Description..."
              placeholderTextColor={K.textMuted}
              multiline
              numberOfLines={3}
              value={editOrgDesc}
              onChangeText={setEditOrgDesc}
            />

            <TouchableOpacity
              style={[s.btnPrimary, { marginTop: 20 }, updatingOrg && { opacity: 0.6 }]}
              onPress={handleUpdateOrgSubmit}
              disabled={updatingOrg}
            >
              {updatingOrg ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.btnPrimaryText}>Enregistrer</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Rejoindre Org */}
      <Modal visible={showJoinOrgModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: K.surface, maxHeight: '80%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: K.text }]}>Rejoindre une Organisation</Text>
              <TouchableOpacity onPress={() => setShowJoinOrgModal(false)}>
                <X color={K.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            <View style={[s.searchBar, { backgroundColor: K.background, borderColor: K.border, marginBottom: 12 }]}>
              <Search color={K.textMuted} size={16} />
              <TextInput
                style={[s.searchInput, { color: K.text }]}
                placeholder="Rechercher une organisation..."
                placeholderTextColor={K.textMuted}
                value={searchJoinOrg}
                onChangeText={setSearchJoinOrg}
              />
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              {toutesOrgs
                .filter((o) => o.nom.toLowerCase().includes(searchJoinOrg.toLowerCase()))
                .map((o) => {
                  const alreadyMember = mesOrgs.some((mo) => mo.nom === o.nom);
                  return (
                    <View key={o.nom} style={[s.joinRow, { borderColor: K.border, backgroundColor: K.background }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.dossierTitle, { color: K.text }]}>{o.nom}</Text>
                        <Text style={[s.dossierJur, { color: K.textMuted }]} numberOfLines={1}>
                          {o.description || `Créée le ${formatDate(o.createdAt)}`}
                        </Text>
                      </View>

                      {alreadyMember ? (
                        <View style={[s.rolePill, s.rolePillMembre]}>
                          <Text style={s.rolePillMembreText}>Déjà membre</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[s.btnSmallAction, { backgroundColor: C.amber500 }]}
                          onPress={() => handleDemanderRejoindre(o.nom)}
                          disabled={requestingJoinNom === o.nom}
                        >
                          {requestingJoinNom === o.nom ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={s.btnSmallActionText}>Rejoindre</Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Partager Dossier */}
      <Modal visible={showShareDossierModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: K.surface, maxHeight: '75%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: K.text }]}>Partager un dossier</Text>
              <TouchableOpacity onPress={() => setShowShareDossierModal(false)}>
                <X color={K.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {dossiersNonPartages.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[s.selectItemRow, { borderColor: K.border, backgroundColor: K.background }]}
                  onPress={() => handlePartagerDossierSubmit(Number(d.id))}
                >
                  <Briefcase color={C.amber500} size={18} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[s.dossierTitle, { color: K.text }]}>{d.titre}</Text>
                    <Text style={[s.dossierJur, { color: K.textMuted }]}>
                      N° {d.numeroAffaire} · {d.statut}
                    </Text>
                  </View>
                  <Plus color={C.amber500} size={18} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Partager Client */}
      <Modal visible={showShareClientModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: K.surface, maxHeight: '75%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: K.text }]}>Partager un client</Text>
              <TouchableOpacity onPress={() => setShowShareClientModal(false)}>
                <X color={K.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {clientsNonPartages.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[s.selectItemRow, { borderColor: K.border, backgroundColor: K.background }]}
                  onPress={() => handlePartagerClientSubmit(Number(c.id))}
                >
                  <Users color={C.blue500} size={18} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[s.dossierTitle, { color: K.text }]}>{c.nomComplet}</Text>
                    <Text style={[s.dossierJur, { color: K.textMuted }]}>
                      {c.telephone || c.email || 'Contact'}
                    </Text>
                  </View>
                  <Plus color={C.blue500} size={18} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal Notifications */}
      <Modal visible={showNotifPopUp} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: K.surface, maxHeight: '80%' }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: K.text }]}>Notifications</Text>
              <TouchableOpacity onPress={() => setShowNotifPopUp(false)}>
                <X color={K.textMuted} size={20} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ color: K.textMuted, fontSize: 12 }}>{nonLues} non lue(s)</Text>
              {nonLues > 0 && (
                <TouchableOpacity onPress={handleMarkAllRead}>
                  <Text style={{ color: C.amber500, fontSize: 12, fontWeight: '700' }}>Tout marquer comme lu</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView>
              {notifs.length === 0 ? (
                <Text style={{ color: K.textMuted, textAlign: 'center', marginVertical: 20 }}>
                  Aucune notification.
                </Text>
              ) : (
                notifs.map((n) => (
                  <TouchableOpacity
                    key={n.id}
                    style={[
                      s.notifItem,
                      { borderColor: K.border, backgroundColor: n.lu ? K.background : C.amber500 + '10' },
                    ]}
                    onPress={() => handleMarkRead(n.id)}
                  >
                    <Bell color={n.lu ? K.textMuted : C.amber500} size={16} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[s.dossierTitle, { color: K.text }]}>{n.titre}</Text>
                      <Text style={[s.dossierJur, { color: K.textMuted }]}>{n.message}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Drawer Compte */}
      <AccountDrawer visible={showDrawer} onClose={() => setShowDrawer(false)} user={user} logout={logout} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },

  // Top Bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  userProfileHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  userAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.amber500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  userNameText: { fontSize: 15, fontWeight: '800' },
  userRoleText: { fontSize: 11, fontWeight: '500' },

  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badgeCounter: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: C.amber500,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeCounterText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  // Dashboard Tabs (Pills)
  dashTabsBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  dashTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  dashTabBtnText: { fontSize: 13, fontWeight: '600' },

  scrollView: { flex: 1 },
  sectionPad: { padding: 16 },

  // KPIs (Style original élégant)
  kpiGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  kpiCard: {
    flex: 1,
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    gap: 4,
  },
  kpiIconWrap: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  kpiVal: { fontSize: 18, fontWeight: '800' },
  kpiLabel: { fontSize: 11, fontWeight: '500' },

  // Section Headers
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  seeAllText: { fontSize: 12, color: C.amber500, fontWeight: '700' },

  // Reminders
  reminderCardAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ef444415',
    borderWidth: 1,
    borderColor: '#ef444440',
    padding: 12,
    borderRadius: 10,
  },
  reminderAlertTitle: { fontSize: 13, fontWeight: '700', color: '#ef4444' },
  reminderAlertSub: { fontSize: 11, color: '#ef4444', marginTop: 1 },
  reminderCardInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.amber500 + '15',
    borderWidth: 1,
    borderColor: C.amber500 + '30',
    padding: 12,
    borderRadius: 10,
  },
  reminderInfoTitle: { fontSize: 13, fontWeight: '700', color: C.amber600 },
  reminderInfoSub: { fontSize: 11, color: C.amber700, marginTop: 1 },

  // Quick Actions Grid (Original 2x2)
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionCard: {
    width: '48%',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  actionTitle: { fontSize: 13, fontWeight: '700' },
  actionSub: { fontSize: 11 },

  // Dossiers Rows (Original Style)
  dossierRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  dossierNum: { fontSize: 12, fontWeight: '700', color: C.amber500 },
  dossierTitle: { fontSize: 13, fontWeight: '700' },
  dossierJur: { fontSize: 11, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  statusPillText: { fontSize: 10, fontWeight: '800' },

  // Empty Cards
  emptyCard: {
    borderRadius: 10,
    padding: 24,
    alignItems: 'center',
    gap: 6,
  },
  emptyText: { fontSize: 12 },

  // ── ORGANISATION STYLES ──
  emptyOrgCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  emptyOrgIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyOrgTitle: { fontSize: 18, fontWeight: '800' },
  emptyOrgSub: { fontSize: 13, textAlign: 'center', lineHeight: 18, maxWidth: 300 },
  emptyOrgActions: { gap: 10, width: '100%', maxWidth: 280, marginTop: 8 },

  orgHeaderCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  orgAvatarLarge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: C.amber500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgAvatarLargeText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  orgHeaderTitle: { fontSize: 16, fontWeight: '800' },
  orgHeaderSub: { fontSize: 12, marginTop: 2 },
  rolePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  rolePillChef: { backgroundColor: C.amber500 + '20' },
  rolePillChefText: { color: C.amber500, fontSize: 11, fontWeight: '800' },
  rolePillMembre: { backgroundColor: '#64748b20' },
  rolePillMembreText: { color: '#64748b', fontSize: 11, fontWeight: '700' },

  orgChefActionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chefBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  chefBtnText: { fontSize: 11, fontWeight: '700' },

  orgSwitchChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  orgSwitchChipText: { fontSize: 11 },

  // Sub Tabs
  subTabsRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#64748b20', marginBottom: 12 },
  subTabItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  subTabItemActive: { borderBottomColor: C.amber500 },
  subTabItemText: { fontSize: 13, fontWeight: '600' },

  // Org Lists
  orgDossierListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  dotIndicator: { width: 6, height: 6, borderRadius: 3 },
  creatorName: { fontSize: 10, fontWeight: '500' },

  clientRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  clientAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.blue500 + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientAvatarText: { color: C.blue500, fontSize: 12, fontWeight: '700' },

  memberRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.amber500 + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: { color: C.amber500, fontSize: 12, fontWeight: '700' },

  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },

  // Facturation
  agendaHeaderTitle: { fontSize: 16, fontWeight: '800' },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 14, marginTop: 10 },
  statBox: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 2,
  },
  statNumber: { fontSize: 16, fontWeight: '800' },
  statDesc: { fontSize: 11, fontWeight: '500' },
  factureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },

  // Common Buttons
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.amber500,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnPrimarySmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.amber500,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnPrimarySmallText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnSecondaryText: { fontSize: 13, fontWeight: '700' },
  btnSmallAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  btnSmallActionText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: '#00000080', justifyContent: 'flex-end' },
  modalBox: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 16, fontWeight: '800' },

  inputLabel: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  inputField: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  textArea: { height: 75, textAlignVertical: 'top' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ef444420',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorBannerText: { color: '#ef4444', fontSize: 12, fontWeight: '600', flex: 1 },

  searchBar: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 38, gap: 8 },
  searchInput: { flex: 1, fontSize: 13 },
  joinRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8 },
  selectItemRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8 },
  notifItem: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8 },
});
