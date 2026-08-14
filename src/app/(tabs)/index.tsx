/**
 * src/app/(tabs)/index.tsx
 * Tableau de bord Executive avec :
 *  - Cloche de Notifications 🔔 dans l'en-tête (à côté de déconnexion) ouvrant une Modal Pop-up interactive
 *  - Calendrier Journalier (Agenda du Jour avec données réelles BDD)
 *  - Rappels & Alertes Intelligentes (Factures en retard, Échéances)
 *  - Raccourcis Métier (Nouveau Dossier, Créer Facture, Calendrier, Fiche Client)
 */

import { AppColors as C } from '@/constants/theme';
import { useAudiences } from '@/hooks/useAudiences';
import { useAuth } from '@/hooks/useAuth';
import { useDossiers } from '@/hooks/useDossiers';
import { useFactures } from '@/hooks/useFactures';
import { createFacture, deleteFacture, Facture, getSoldeRestant } from '@/services/facturation.service';
import {
  getNotifications, marquerNotificationCommeLue, marquerToutesNotificationsCommeLues,
  NotificationItem,
} from '@/services/notifications.service';
import { getUnreadBadgeCount, chargerDonneesInvitationsPersistantes, hasDossierAccess, hasAudienceAccess } from '@/services/dossierInvitations.service';
import { useRouter } from 'expo-router';
import {
  AlertTriangle, ArrowUpRight, BarChart3, Bell, Brain, Briefcase,
  Calendar as CalendarIcon, CheckCheck, CheckCircle2, Clock, DollarSign, FileText,
  Info, LayoutDashboard, LogOut, Mail, Plus, Receipt, ShieldCheck, Sparkles, Trash2, TrendingUp, Users, X, Zap,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { extractErrorMessage } from '@/lib/api';
import { checkUpcomingEventReminders } from '@/lib/notificationsManager';
import {
  ActivityIndicator, Alert, Modal, RefreshControl, ScrollView, StatusBar, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountDrawer } from '@/components/AccountDrawer';
import { DashboardAIChatBox } from '@/components/DashboardAIChatBox';
import { usePreferences } from '@/context/PreferencesContext';
import { useTheme } from '@/hooks/useTheme';

type DashboardTab = 'overview' | 'agenda' | 'facturation';

function initials(name?: string) {
  if (!name) return 'AV';
  return name.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase();
}

const DASHBOARD_TABS: { id: DashboardTab; label: string; Icon: any }[] = [
  { id: 'overview',    label: "Vue d'ensemble", Icon: LayoutDashboard },
  { id: 'agenda',      label: 'Agenda du Jour', Icon: CalendarIcon },
  { id: 'facturation', label: 'Facturation',    Icon: Receipt },
];

export default function DashboardScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { isDark } = usePreferences();
  const { colors: K } = useTheme();
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  const heure = new Date().getHours();
  const salutation = heure < 12 ? 'Bonjour' : heure < 18 ? 'Bon après-midi' : 'Bonsoir';

  // Modal Dragger Compte & Thème & Notifications
  const [showDrawer, setShowDrawer] = useState(false);

  // Modal Pop-up Notifications
  const [showNotifPopUp, setShowNotifPopUp]     = useState(false);
  const [notifs, setNotifs]                     = useState<NotificationItem[]>([]);
  const [nonLues, setNonLues]                   = useState(0);
  const [pendingInvsCount, setPendingInvsCount] = useState(0);
  const [loadingNotifs, setLoadingNotifs]         = useState(false);

  // Backend Data Hooks
  const { dossiers }  = useDossiers({ pageSize: 50 });
  const { audiences } = useAudiences({ pageSize: 50 });
  const {
    factures, totalFacture, totalEncaisse, totalImpaye, tauxRecouvrement,
    refetch: refetchFactures, create: createFacture,
  } = useFactures();

  // Modal Nouvelle Facture (Page d'accueil)
  const [showFactureModal, setShowFactureModal] = useState(false);
  const [factDossierId, setFactDossierId]     = useState<number | undefined>(undefined);
  const [factMontantHt, setFactMontantHt]     = useState('');
  const [factTva, setFactTva]                 = useState('19.25');
  const [factEcheance, setFactEcheance]       = useState('');
  const [factDesc, setFactDesc]               = useState('');
  const [creatingFact, setCreatingFact]       = useState(false);

  // Chargement des notifications réelles du backend & comptage des badges
  const fetchNotifs = useCallback(async () => {
    setLoadingNotifs(true);
    try {
      const [res, invs] = await Promise.all([
        getNotifications().catch(() => ({ data: [], nonLuesCount: 0 })),
        chargerDonneesInvitationsPersistantes().catch(() => []),
      ]);

      const pendingCount = invs.filter(i => i.statut === 'en_attente').length;
      setPendingInvsCount(pendingCount);

      setNotifs(res.data || []);
      setNonLues(res.nonLuesCount || 0);
    } catch (e: any) {
      setNotifs([]);
      setNonLues(0);
    } finally {
      setLoadingNotifs(false);
    }
  }, [user?.email]);

  useEffect(() => {
    fetchNotifs();
  }, [fetchNotifs]);

  const handleMarkAllRead = async () => {
    try {
      await marquerToutesNotificationsCommeLues();
      setNotifs(prev => prev.map(n => ({ ...n, lu: true })));
      setNonLues(0);
    } catch (e) {
      console.log('Erreur marquer lues:', e);
    }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await marquerNotificationCommeLue(id);
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, lu: true } : n));
      setNonLues(p => Math.max(0, p - 1));
    } catch (e) {
      console.log('Error mark read:', e);
    }
  };

  // Handlers Création Facture (Page Accueil)
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
    const dossierSelected = dossiers.find(d => Number(d.id) === Number(factDossierId));
    setCreatingFact(true);
    try {
      await createFacture({
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

  const handleDeleteFacture = (f: Facture) => {
    Alert.alert(
      'Supprimer la facture',
      `Êtes-vous sûr de vouloir supprimer définitivement la facture ${f.numeroFacture} ? Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFacture(f.id);
              refetchFactures();
              Alert.alert('Succès', 'La facture a été supprimée.');
            } catch (e) {
              Alert.alert('Erreur', extractErrorMessage(e));
            }
          },
        },
      ]
    );
  };

  // Filtrage strict des données réservées à l'utilisateur
  const userDossiers  = dossiers.filter(d => hasDossierAccess(d, user?.id));
  const userAudiences = audiences.filter(a => hasAudienceAccess(Number(a.id), a.dossierId ? Number(a.dossierId) : undefined));
  const userFactures  = factures.filter(f => !f.dossierId || hasDossierAccess(Number(f.dossierId)));

  const affairesActives = userDossiers.filter(
    d => d.statut === 'Ouvert' || d.statut === 'En cours'
  ).length;
  const affairesCloturees = userDossiers.filter(d => d.statut === 'Cloture').length;
  const facturesRetard = userFactures.filter(f => f.statut === 'en_retard');

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayAudiences = userAudiences.filter(a => a.dateAudience?.startsWith(todayStr));

  // Vérification automatique des rappels 30 min avant les événements
  useEffect(() => {
    if (userAudiences.length > 0) {
      const remList = userAudiences.map(a => ({
        id: a.id,
        titre: a.typeAudience || 'Événement Cabinet',
        dateStr: a.dateAudience ? a.dateAudience.slice(0, 10) : '',
        heureStr: a.heure || '09:00',
      }));
      checkUpcomingEventReminders(remList);
    }
  }, [userAudiences]);

  const affairesRecentes = userDossiers
    .filter(d => d.statut === 'Ouvert' || d.statut === 'En cours')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4);

  return (
    <View style={[s.root, { backgroundColor: K.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={K.bgSecondary} />
      <SafeAreaView style={[s.safe, { backgroundColor: K.bgSecondary }]} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100, backgroundColor: K.bg }}
          style={{ backgroundColor: K.bg }}
        >

          {/* ── En-tête Executive Premium ── */}
          <View style={[s.header, { backgroundColor: K.bgSecondary }]}>
            <TouchableOpacity
              style={s.headerProfileTouch}
              onPress={() => setShowDrawer(true)}
              activeOpacity={0.8}
            >
              <View style={[s.avatarCircle, { backgroundColor: K.primary }]}>
                <Text style={[s.avatarText, { color: isDark ? C.gray900 : '#ffffff' }]}>{initials(user?.nom || 'Avocat')}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.headerGreeting, { color: K.textMuted }]}>{salutation}, Maître 👋</Text>
                <Text style={[s.headerTitle, { color: K.text }]}>{user ? user.nom : 'Maître Avocat'}</Text>
                <View style={[s.roleBadge, { backgroundColor: K.bgTertiary }]}>
                  <ShieldCheck color={K.primary} size={12} />
                  <Text style={[s.roleBadgeText, { color: K.primary }]}>{user?.role || 'Avocat'} — Mon Compte ⚙️</Text>
                </View>
              </View>
            </TouchableOpacity>

            <View style={s.headerRight}>
              {/* ✉️ Icône Enveloppe Mail Invitations & Demandes de permission */}
              <TouchableOpacity
                style={[s.bellBtn, { backgroundColor: K.bgTertiary }]}
                onPress={() => router.push('/invitations-mail')}
                activeOpacity={0.8}
              >
                <Mail color={K.primary} size={20} />
                {pendingInvsCount > 0 && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{pendingInvsCount > 9 ? '9+' : pendingInvsCount}</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Bouton Déconnexion */}
              <TouchableOpacity style={[s.logoutBtn, { backgroundColor: K.bgTertiary }]} onPress={logout} activeOpacity={0.8}>
                <LogOut color={K.danger} size={18} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── BOÎTE DE DIALOGUE ASSISTANT IA (PRÉSENTE SUR TOUTES LES VUES & AU-DESSUS DES AFFAIRES) ── */}
          <View style={{ paddingHorizontal: 16 }}>
            <DashboardAIChatBox />
          </View>

          {/* ── Navigation par Onglets Dashboard ── */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.dashTabsRow, { backgroundColor: K.bgSecondary }]}>
            {DASHBOARD_TABS.map(tab => {
              const active = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  style={[
                    s.dashTabBtn,
                    { backgroundColor: K.bgTertiary, borderColor: K.border },
                    active && { backgroundColor: K.primary, borderColor: K.primary }
                  ]}
                  activeOpacity={0.8}
                >
                  <tab.Icon color={active ? (isDark ? C.gray900 : '#ffffff') : K.textMuted} size={14} />
                  <Text style={[s.dashTabText, { color: K.textMuted }, active && { color: isDark ? C.gray900 : '#ffffff', fontWeight: '700' }]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* ── TAB 1 : VUE D'ENSEMBLE & RAPPELS ── */}
          {activeTab === 'overview' && (
            <View style={s.tabContent}>

              {/* Cartes KPIs Réelles */}
              <View style={s.kpiGrid}>
                <View style={[s.kpiCard, { backgroundColor: K.surface, borderLeftColor: C.amber500 }]}>
                  <View style={[s.kpiIconWrap, { backgroundColor: isDark ? 'rgba(245,158,11,0.2)' : C.amber50 }]}><Briefcase color={C.amber600} size={20} /></View>
                  <Text style={[s.kpiVal, { color: K.text }]}>{affairesActives}</Text>
                  <Text style={[s.kpiLabel, { color: K.textMuted }]}>Affaires en cours</Text>
                </View>

                <View style={[s.kpiCard, { backgroundColor: K.surface, borderLeftColor: C.blue500 }]}>
                  <View style={[s.kpiIconWrap, { backgroundColor: isDark ? 'rgba(59,130,246,0.2)' : C.blue50 }]}><CalendarIcon color={C.blue600} size={20} /></View>
                  <Text style={[s.kpiVal, { color: K.text }]}>{userAudiences.length}</Text>
                  <Text style={[s.kpiLabel, { color: K.textMuted }]}>Audiences</Text>
                </View>

                <View style={[s.kpiCard, { backgroundColor: K.surface, borderLeftColor: C.green500 }]}>
                  <View style={[s.kpiIconWrap, { backgroundColor: isDark ? 'rgba(34,197,94,0.2)' : C.green50 }]}><CheckCircle2 color={C.green600} size={20} /></View>
                  <Text style={[s.kpiVal, { color: K.text }]}>{affairesCloturees}</Text>
                  <Text style={[s.kpiLabel, { color: K.textMuted }]}>Clôturées</Text>
                </View>
              </View>

              {/* 🔔 BLOC RAPPELS & NOTIFICATIONS IMPORTANTES */}
              <Text style={[s.sectionTitle, { color: K.text }]}>Rappels & Notifications</Text>
              <View style={{ gap: 8 }}>
                {facturesRetard.length > 0 && (
                  <TouchableOpacity
                    style={s.reminderCardAlert}
                    onPress={() => router.push('/facturation')}
                    activeOpacity={0.85}
                  >
                    <AlertTriangle color={C.red600} size={20} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.reminderAlertTitle}>Facture(s) en retard d'encaissement</Text>
                      <Text style={s.reminderAlertSub}>{facturesRetard.length} facture(s) nécessitent une relance client immédiate.</Text>
                    </View>
                  </TouchableOpacity>
                )}

                <View style={s.reminderCardInfo}>
                  <Bell color={C.amber600} size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.reminderInfoTitle}>Planning du jour</Text>
                    <Text style={s.reminderInfoSub}>
                      {todayAudiences.length > 0
                        ? `${todayAudiences.length} audience(s) programmée(s) pour aujourd'hui.`
                        : "Aucune audience critique ce jour. Pensez à vérifier l'agenda."}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Actions Rapides Métier */}
              <Text style={[s.sectionTitle, { color: K.text }]}>Actions rapides</Text>
              <View style={s.quickActionsGrid}>
                <TouchableOpacity
                  style={[s.actionCard, { backgroundColor: K.surface, borderColor: K.border }]}
                  onPress={() => router.push('/affaires')}
                  activeOpacity={0.8}
                >
                  <View style={[s.actionIcon, { backgroundColor: isDark ? 'rgba(245,158,11,0.2)' : C.amber100 }]}><Plus color={isDark ? C.amber400 : C.amber900} size={20} /></View>
                  <Text style={[s.actionTitle, { color: K.text }]}>Nouveau Dossier</Text>
                  <Text style={[s.actionSub, { color: K.textMuted }]}>Ouvrir une affaire</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.actionCard, { backgroundColor: K.surface, borderColor: K.border }]}
                  onPress={() => router.push('/facturation')}
                  activeOpacity={0.8}
                >
                  <View style={[s.actionIcon, { backgroundColor: isDark ? 'rgba(34,197,94,0.2)' : C.green100 }]}><Receipt color={isDark ? C.green400 : C.green700} size={20} /></View>
                  <Text style={[s.actionTitle, { color: K.text }]}>Créer Facture</Text>
                  <Text style={[s.actionSub, { color: K.textMuted }]}>Honoraires client</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.actionCard, { backgroundColor: K.surface, borderColor: K.border }]}
                  onPress={() => router.push('/audiences')}
                  activeOpacity={0.8}
                >
                  <View style={[s.actionIcon, { backgroundColor: isDark ? 'rgba(147,51,234,0.2)' : C.purple100 }]}><CalendarIcon color={isDark ? '#c084fc' : C.purple600} size={20} /></View>
                  <Text style={[s.actionTitle, { color: K.text }]}>Calendrier</Text>
                  <Text style={[s.actionSub, { color: K.textMuted }]}>Agenda & audiences</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.actionCard, { backgroundColor: K.surface, borderColor: K.border }]}
                  onPress={() => router.push('/clients')}
                  activeOpacity={0.8}
                >
                  <View style={[s.actionIcon, { backgroundColor: isDark ? 'rgba(59,130,246,0.2)' : C.blue100 }]}><Users color={isDark ? C.blue400 : C.blue700} size={20} /></View>
                  <Text style={[s.actionTitle, { color: K.text }]}>Fiche Client</Text>
                  <Text style={[s.actionSub, { color: K.textMuted }]}>Répertoire contacts</Text>
                </TouchableOpacity>
              </View>

              {/* Dernières Affaires Actives */}
              <View style={s.sectionHeader}>
                <Text style={[s.sectionTitle, { color: K.text }]}>Dossiers récents</Text>
                <TouchableOpacity onPress={() => router.push('/affaires')}>
                  <Text style={s.seeAllText}>Voir tout</Text>
                </TouchableOpacity>
              </View>

              {affairesRecentes.length === 0 ? (
                <View style={[s.emptyCard, { backgroundColor: K.surface }]}>
                  <FileText color={K.textMuted} size={32} />
                  <Text style={[s.emptyText, { color: K.textMuted }]}>Aucun dossier actif pour le moment</Text>
                </View>
              ) : (
                affairesRecentes.map(d => (
                  <TouchableOpacity
                    key={d.id}
                    style={[s.dossierRowCard, { backgroundColor: K.surface, borderColor: K.border }]}
                    onPress={() => router.push({ pathname: '/affaire/[id]', params: { id: d.id } })}
                    activeOpacity={0.85}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Text style={s.dossierNum}>{d.numeroAffaire}</Text>
                        <View style={[s.statusPill, d.statut === 'Ouvert' ? { backgroundColor: isDark ? 'rgba(59,130,246,0.2)' : C.blue100 } : { backgroundColor: isDark ? 'rgba(249,115,22,0.2)' : C.orange100 }]}>
                          <Text style={[s.statusPillText, d.statut === 'Ouvert' ? { color: isDark ? C.blue400 : C.blue700 } : { color: isDark ? '#fb923c' : C.orange700 }]}>{d.statut}</Text>
                        </View>
                      </View>
                      <Text style={[s.dossierTitle, { color: K.text }]} numberOfLines={1}>{d.titre}</Text>
                      {d.juridiction && <Text style={[s.dossierJur, { color: K.textMuted }]}>{d.juridiction}</Text>}
                    </View>
                    <ArrowUpRight color={K.textMuted} size={18} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* ── TAB 2 : CALENDRIER JOURNALIER (DONNÉES RÉELLES) ── */}
          {activeTab === 'agenda' && (
            <View style={s.tabContent}>
              <View style={[s.agendaHeaderBox, { backgroundColor: K.surface, borderColor: K.border }]}>
                <CalendarIcon color={C.amber600} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.agendaHeaderTitle, { color: K.text }]}>Calendrier Journalier</Text>
                  <Text style={[s.agendaHeaderSub, { color: K.textMuted }]}>Événements et audiences prévus pour aujourd'hui</Text>
                </View>
                <TouchableOpacity style={s.agendaAddBtn} onPress={() => router.push('/audiences')}>
                  <Plus color={C.gray900} size={14} />
                  <Text style={s.agendaAddBtnText}>Ajouter</Text>
                </TouchableOpacity>
              </View>

              {/* Données réelles des événements d'aujourd'hui */}
              {todayAudiences.length === 0 ? (
                <View style={[s.emptyCard, { backgroundColor: K.surface }]}>
                  <CalendarIcon color={K.textMuted} size={36} />
                  <Text style={[s.emptyText, { color: K.textMuted }]}>Aucune audience ou rendez-vous prévu aujourd'hui</Text>
                  <TouchableOpacity style={s.agendaAddBtn} onPress={() => router.push('/audiences')}>
                    <Plus color={C.gray900} size={14} />
                    <Text style={s.agendaAddBtnText}>Planifier un événement</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={s.timeSlotGrid}>
                  {todayAudiences.map((aud) => {
                    const timeStr = aud.heure || '09:00';
                    const isTenue = aud.statut === 'tenue';
                    const cardBg = isTenue ? (isDark ? 'rgba(34,197,94,0.1)' : C.green50) : (isDark ? 'rgba(245,158,11,0.1)' : C.amber50);
                    const cardColor = isTenue ? C.green600 : C.amber600;
                    return (
                      <View key={String(aud.id)} style={s.timeSlotRow}>
                        <View style={s.timeSlotTimeWrap}>
                          <Text style={[s.timeSlotTime, { color: K.textSecondary }]}>{timeStr}</Text>
                          <Clock color={K.textMuted} size={12} />
                        </View>
                        <View style={[s.timeSlotCard, { backgroundColor: cardBg, borderColor: K.border, borderLeftColor: cardColor, borderLeftWidth: 4 }]}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={[s.timeSlotType, { color: cardColor }]}>{aud.typeAudience || 'Audience'}</Text>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: cardColor }}>{aud.statut.toUpperCase()}</Text>
                          </View>
                          <Text style={[s.timeSlotTitle, { color: K.text }]}>{aud.juridiction || 'Tribunal de Grande Instance'}</Text>
                          {aud.notes ? <Text style={{ fontSize: 11, color: K.textMuted, marginTop: 2 }}>{aud.notes}</Text> : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* ── TAB 3 : FACTURATION & ENCAISSEMENTS ── */}
          {activeTab === 'facturation' && (
            <View style={s.tabContent}>
              <View style={[s.agendaHeaderBox, { backgroundColor: K.surface, borderColor: K.border }]}>
                <Receipt color={C.green600} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.agendaHeaderTitle, { color: K.text }]}>Facturation & Encaissements</Text>
                  <Text style={[s.agendaHeaderSub, { color: K.textMuted }]}>Honoraires, suivi des paiements et relances</Text>
                </View>
                <TouchableOpacity style={s.agendaAddBtn} onPress={handleOpenFactureModal} activeOpacity={0.8}>
                  <Plus color={C.gray900} size={14} />
                  <Text style={s.agendaAddBtnText}>Nouvelle Facture</Text>
                </TouchableOpacity>
              </View>

              {/* KPIs Financiers */}
              <View style={s.kpiGrid}>
                <View style={[s.kpiCard, { backgroundColor: K.surface, borderLeftColor: K.text }]}>
                  <Text style={[s.kpiLabel, { color: K.textMuted }]}>Total facturé</Text>
                  <Text style={[s.kpiVal, { fontSize: 16, color: K.text }]}>{totalFacture > 0 ? `${(totalFacture / 1_000_000).toFixed(1)}M` : '0'} FCFA</Text>
                </View>

                <View style={[s.kpiCard, { backgroundColor: K.surface, borderLeftColor: C.green500 }]}>
                  <Text style={[s.kpiLabel, { color: K.textMuted }]}>Total encaissé</Text>
                  <Text style={[s.kpiVal, { fontSize: 16, color: C.green600 }]}>{totalEncaisse > 0 ? `${(totalEncaisse / 1_000_000).toFixed(1)}M` : '0'} FCFA</Text>
                </View>

                <View style={[s.kpiCard, { backgroundColor: K.surface, borderLeftColor: C.red500 }]}>
                  <Text style={[s.kpiLabel, { color: K.textMuted }]}>Reste à percevoir</Text>
                  <Text style={[s.kpiVal, { fontSize: 16, color: C.red600 }]}>{totalImpaye > 0 ? `${(totalImpaye / 1_000_000).toFixed(1)}M` : '0'} FCFA</Text>
                </View>

                <View style={[s.kpiCard, { backgroundColor: K.surface, borderLeftColor: C.amber500 }]}>
                  <Text style={[s.kpiLabel, { color: K.textMuted }]}>Taux recouvrement</Text>
                  <Text style={[s.kpiVal, { fontSize: 16, color: C.amber600 }]}>{tauxRecouvrement}%</Text>
                </View>
              </View>

              {/* Liste des Factures */}
              {factures.length === 0 ? (
                <View style={[s.emptyCard, { backgroundColor: K.surface }]}>
                  <DollarSign color={K.textMuted} size={36} />
                  <Text style={[s.emptyText, { color: K.textMuted }]}>Aucune facture d'honoraires enregistrée</Text>
                  <TouchableOpacity style={s.agendaAddBtn} onPress={handleOpenFactureModal} activeOpacity={0.8}>
                    <Plus color={C.gray900} size={14} />
                    <Text style={s.agendaAddBtnText}>Créer la première facture</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ gap: 10, marginTop: 10 }}>
                  {factures.map((f) => {
                    const statusColor = f.statut === 'payee' ? C.green600 : f.statut === 'en_retard' ? C.red600 : f.statut === 'partielle' ? C.amber600 : K.textMuted;
                    const statusBg = f.statut === 'payee' ? (isDark ? 'rgba(34,197,94,0.15)' : C.green50) : f.statut === 'en_retard' ? (isDark ? 'rgba(239,68,68,0.15)' : C.red50) : f.statut === 'partielle' ? (isDark ? 'rgba(245,158,11,0.15)' : C.amber50) : K.bgTertiary;
                    return (
                      <View key={String(f.id)} style={[s.timeSlotCard, { backgroundColor: K.surface, borderColor: K.border, borderLeftColor: statusColor, borderLeftWidth: 4 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={[s.timeSlotTitle, { color: K.text }]}>{f.numeroFacture}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ backgroundColor: statusBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor }}>{f.statut.toUpperCase()}</Text>
                            </View>
                            <TouchableOpacity style={{ padding: 4 }} onPress={() => handleDeleteFacture(f)} activeOpacity={0.8}>
                              <Trash2 color={C.red600} size={15} />
                            </TouchableOpacity>
                          </View>
                        </View>
                        {f.description ? <Text style={{ fontSize: 12, color: K.textMuted, marginTop: 2 }}>{f.description}</Text> : null}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: K.border }}>
                          <Text style={{ fontSize: 12, color: K.textMuted }}>Montant TTC: <Text style={{ fontWeight: '700', color: K.text }}>{new Intl.NumberFormat('fr-FR').format(Math.round(Number(f.montantTtc)))} FCFA</Text></Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: statusColor }}>Solde: {new Intl.NumberFormat('fr-FR').format(Math.round(getSoldeRestant(f)))} FCFA</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

        </ScrollView>
      </SafeAreaView>

      {/* ── MODAL POP-UP DES NOTIFICATIONS (Relié à l'icône cloche 🔔) ── */}
      <Modal visible={showNotifPopUp} transparent animationType="slide" onRequestClose={() => setShowNotifPopUp(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowNotifPopUp(false)}>
          <TouchableOpacity style={[s.sheetNotif, { backgroundColor: K.surface }]} activeOpacity={1} onPress={() => {}}>
            <View style={[s.handle, { backgroundColor: K.border }]} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Bell color={C.amber600} size={20} />
                <Text style={s.sheetNotifTitle}>Notifications</Text>
                {nonLues > 0 && (
                  <View style={s.notifBadgePop}>
                    <Text style={s.notifBadgePopText}>{nonLues} non lue(s)</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity style={s.closeBtn} onPress={() => setShowNotifPopUp(false)}>
                <X color={C.gray600} size={18} />
              </TouchableOpacity>
            </View>

            {nonLues > 0 && (
              <TouchableOpacity style={s.markAllPopBtn} onPress={handleMarkAllRead} activeOpacity={0.8}>
                <CheckCheck color={C.amber900} size={14} />
                <Text style={s.markAllPopText}>Tout marquer comme lu</Text>
              </TouchableOpacity>
            )}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 10 }}>
              {loadingNotifs ? (
                <ActivityIndicator color={K.primary} style={{ paddingVertical: 20 }} />
              ) : notifs.length === 0 ? (
                <View style={s.emptyNotifBox}>
                  <Bell color={K.textMuted} size={36} />
                  <Text style={[s.emptyNotifTitle, { color: K.text }]}>Aucune notification</Text>
                  <Text style={[s.emptyNotifSub, { color: K.textMuted }]}>Vous êtes parfaitement à jour !</Text>
                </View>
              ) : (
                notifs.map(n => (
                  <TouchableOpacity
                    key={String(n.id)}
                    style={[s.notifCardItem, { backgroundColor: K.bgSecondary, borderColor: K.border }, !n.lu && s.notifCardItemUnread]}
                    onPress={() => handleMarkRead(n.id)}
                    activeOpacity={0.85}
                  >
                    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                      <View style={[s.notifIconWrap, n.type === 'facture_retard' ? { backgroundColor: isDark ? 'rgba(239,68,68,0.2)' : C.red100 } : { backgroundColor: isDark ? 'rgba(59,130,246,0.2)' : C.blue100 }]}>
                        {n.type === 'facture_retard' ? <AlertTriangle color={C.red600} size={16} /> : <Bell color={C.blue600} size={16} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.notifItemTitle, { color: K.textSecondary }, !n.lu && { color: K.text }]} numberOfLines={1}>{n.titre}</Text>
                        <Text style={[s.notifItemMsg, { color: K.textMuted }]} numberOfLines={2}>{n.message}</Text>
                        <Text style={[s.notifItemDate, { color: K.textMuted }]}>{new Date(n.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      {!n.lu && <View style={s.unreadDotPop} />}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      {/* ── MODAL NOUVELLE FACTURE (PAGE D'ACCUEIL) ── */}
      <Modal visible={showFactureModal} transparent animationType="slide" onRequestClose={() => setShowFactureModal(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowFactureModal(false)}>
          <TouchableOpacity style={[s.sheetNotif, { backgroundColor: K.surface }]} activeOpacity={1} onPress={() => {}}>
            <View style={[s.handle, { backgroundColor: K.border }]} />
            <Text style={{ fontSize: 17, fontWeight: '700', color: K.text, marginBottom: 14 }}>Nouvelle Facture d'Honoraires</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 160 }}>

              {/* Dossier */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: K.text, marginBottom: 6 }}>Dossier / Affaire concernée *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {dossiers.map(d => (
                    <TouchableOpacity
                      key={d.id}
                      onPress={() => setFactDossierId(Number(d.id))}
                      style={[{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: K.bgTertiary, borderWidth: 1, borderColor: K.border }, Number(factDossierId) === Number(d.id) && { backgroundColor: K.primaryLight, borderColor: K.primary }]}
                    >
                      <Text style={[{ fontSize: 12, color: K.textSecondary }, Number(factDossierId) === Number(d.id) && { color: K.primary, fontWeight: '700' }]}>
                        {d.numeroAffaire} — {d.titre}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Montant HT & TVA */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <View style={{ flex: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: K.text, marginBottom: 6 }}>Montant HT (FCFA) *</Text>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: K.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: K.text, backgroundColor: K.inputBg }}
                    value={factMontantHt}
                    onChangeText={setFactMontantHt}
                    keyboardType="numeric"
                    placeholder="ex: 500000"
                    placeholderTextColor={K.textMuted}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: K.text, marginBottom: 6 }}>TVA (%)</Text>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: K.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: K.text, backgroundColor: K.inputBg }}
                    value={factTva}
                    onChangeText={setFactTva}
                    keyboardType="numeric"
                    placeholder="19.25"
                    placeholderTextColor={K.textMuted}
                  />
                </View>
              </View>

              {/* Estimation TTC */}
              {factMontantHt && !isNaN(Number(factMontantHt)) ? (
                <View style={{ backgroundColor: K.primaryLight, borderWidth: 1, borderColor: K.primary, borderRadius: 10, padding: 10, marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, color: K.primary }}>
                    Montant TTC estimé : <Text style={{ fontWeight: '800', color: K.primary }}>{new Intl.NumberFormat('fr-FR').format(Math.round(Number(factMontantHt) * (1 + (Number(factTva) || 19.25) / 100)))} FCFA</Text>
                  </Text>
                </View>
              ) : null}

              {/* Échéance */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: K.text, marginBottom: 6 }}>Date d'échéance (YYYY-MM-DD)</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: K.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: K.text, backgroundColor: K.inputBg }}
                  value={factEcheance}
                  onChangeText={setFactEcheance}
                  placeholder="2026-10-15"
                  placeholderTextColor={K.textMuted}
                />
              </View>

              {/* Description */}
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: K.text, marginBottom: 6 }}>Description / Libellé des prestations</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: K.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: K.text, backgroundColor: K.inputBg, height: 75, textAlignVertical: 'top' }}
                  value={factDesc}
                  onChangeText={setFactDesc}
                  multiline
                  numberOfLines={3}
                  placeholder="ex: Honoraires de diligence, plaidoirie, rédaction d'actes..."
                  placeholderTextColor={K.textMuted}
                />
              </View>

              <TouchableOpacity
                style={[{ backgroundColor: K.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 6 }, creatingFact && { opacity: 0.6 }]}
                onPress={handleCreateFactureSubmit}
                disabled={creatingFact}
                activeOpacity={0.85}
              >
                {creatingFact ? <ActivityIndicator color={isDark ? C.gray900 : '#ffffff'} /> : <Text style={{ fontSize: 14, fontWeight: '700', color: isDark ? C.gray900 : '#ffffff' }}>Enregistrer la facture</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={{ borderWidth: 1, borderColor: K.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 }} onPress={() => setShowFactureModal(false)} activeOpacity={0.8}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: K.textMuted }}>Annuler</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── DRAGGER UTILISATEUR & PARAMÈTRES (PROFIL / THÈME / NOTIFICATIONS) ── */}
      <AccountDrawer visible={showDrawer} onClose={() => setShowDrawer(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  safe: { backgroundColor: C.navy900 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, backgroundColor: C.navy900,
  },
  headerGreeting: { fontSize: 12, color: C.gray400, fontWeight: '500' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.white, marginTop: 2 },
  headerProfileTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.amber500,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: C.gray900,
  },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4,
    backgroundColor: C.navy800, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start',
  },
  roleBadgeText: { fontSize: 11, fontWeight: '600', color: C.amber400 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { padding: 8, backgroundColor: C.navy800, borderRadius: 10 },
  bellBtn: { padding: 8, backgroundColor: C.navy800, borderRadius: 10, position: 'relative' },
  logoutBtn: { padding: 8, backgroundColor: C.navy800, borderRadius: 10 },
  badge: {
    position: 'absolute', top: -2, right: -2, backgroundColor: C.red500,
    borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { color: C.white, fontSize: 10, fontWeight: '700' },
  dashTabsRow: { paddingHorizontal: 14, paddingVertical: 10, gap: 8, backgroundColor: C.navy900 },
  dashTabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: C.navy800, borderWidth: 1, borderColor: C.navy700,
  },
  dashTabBtnActive: { backgroundColor: C.amber500, borderColor: C.amber500 },
  dashTabText: { fontSize: 12, fontWeight: '600', color: C.gray400 },
  dashTabTextActive: { color: C.gray900, fontWeight: '700' },
  tabContent: { padding: 14, gap: 14 },
  kpiGrid: { flexDirection: 'row', gap: 8 },
  kpiCard: {
    flex: 1, backgroundColor: C.white, borderRadius: 14, padding: 12,
    borderLeftWidth: 4, shadowColor: C.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  kpiIconWrap: { width: 34, height: 34, backgroundColor: C.amber50, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  kpiVal: { fontSize: 20, fontWeight: '700', color: C.gray900 },
  kpiLabel: { fontSize: 11, color: C.gray500, marginTop: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.gray900 },
  seeAllText: { fontSize: 12, fontWeight: '600', color: C.amber600 },
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: {
    width: '48%', backgroundColor: C.white, borderRadius: 14, padding: 12, gap: 4,
    borderWidth: 1, borderColor: C.gray200,
  },
  actionIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  actionTitle: { fontSize: 13, fontWeight: '700', color: C.gray900 },
  actionSub: { fontSize: 11, color: C.gray500 },
  reminderCardAlert: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.red50,
    borderWidth: 1, borderColor: C.red200, borderRadius: 14, padding: 12,
  },
  reminderAlertTitle: { fontSize: 13, fontWeight: '700', color: C.red700 },
  reminderAlertSub: { fontSize: 11, color: C.red600, marginTop: 2 },
  reminderCardInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.amber50,
    borderWidth: 1, borderColor: C.amber200, borderRadius: 14, padding: 12,
  },
  reminderInfoTitle: { fontSize: 13, fontWeight: '700', color: C.amber900 },
  reminderInfoSub: { fontSize: 11, color: C.amber800, marginTop: 2 },
  emptyCard: { backgroundColor: C.white, borderRadius: 14, padding: 24, alignItems: 'center', gap: 8 },
  emptyText: { fontSize: 13, color: C.gray500 },
  dossierRowCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: C.gray200,
  },
  dossierNum: { fontSize: 12, fontWeight: '700', color: C.amber600 },
  statusPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  dossierTitle: { fontSize: 14, fontWeight: '600', color: C.gray900, marginTop: 2 },
  dossierJur: { fontSize: 12, color: C.gray500, marginTop: 2 },
  agendaHeaderBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white,
    borderWidth: 1, borderColor: C.gray200, borderRadius: 14, padding: 14,
  },
  agendaHeaderTitle: { fontSize: 14, fontWeight: '700', color: C.gray900 },
  agendaHeaderSub: { fontSize: 12, color: C.gray500, marginTop: 2 },
  agendaAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.amber500, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  agendaAddBtnText: { fontSize: 11, fontWeight: '700', color: C.gray900 },
  timeSlotGrid: { gap: 10 },
  timeSlotRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  timeSlotTimeWrap: { width: 50, alignItems: 'center', paddingTop: 6, gap: 4 },
  timeSlotTime: { fontSize: 12, fontWeight: '700', color: C.gray700 },
  timeSlotCard: { flex: 1, borderRadius: 12, padding: 12, gap: 4, borderWidth: 1, borderColor: C.gray200 },
  timeSlotType: { fontSize: 11, fontWeight: '700' },
  timeSlotTitle: { fontSize: 13, fontWeight: '600', color: C.gray900 },
  statsCard: { backgroundColor: C.white, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: C.gray200 },
  statsCardTitle: { fontSize: 15, fontWeight: '700', color: C.gray900, marginBottom: 4 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  statLabel: { fontSize: 13, color: C.gray600 },
  statValue: { fontSize: 14, fontWeight: '700', color: C.gray900 },
  aiAssistantBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.navy900,
    borderRadius: 16, padding: 16, marginTop: 6,
  },
  aiTitle: { fontSize: 15, fontWeight: '700', color: C.white },
  aiSub: { fontSize: 12, color: C.gray400, marginTop: 2 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetNotif: { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', padding: 20 },
  handle: { width: 40, height: 4, backgroundColor: C.gray200, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetNotifTitle: { fontSize: 17, fontWeight: '700', color: C.gray900 },
  notifBadgePop: { backgroundColor: C.red100, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  notifBadgePopText: { fontSize: 10, fontWeight: '700', color: C.red700 },
  closeBtn: { padding: 6, backgroundColor: C.gray100, borderRadius: 12 },
  markAllPopBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.amber50, borderWidth: 1, borderColor: C.amber200, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
  markAllPopText: { fontSize: 12, fontWeight: '600', color: C.amber900 },
  emptyNotifBox: { alignItems: 'center', paddingVertical: 30, gap: 6 },
  emptyNotifTitle: { fontSize: 14, fontWeight: '700', color: C.gray900 },
  emptyNotifSub: { fontSize: 12, color: C.gray500 },
  notifCardItem: { backgroundColor: C.gray50, borderWidth: 1, borderColor: C.gray200, borderRadius: 12, padding: 12, position: 'relative' },
  notifCardItemUnread: { backgroundColor: C.white, borderColor: C.amber300, borderLeftWidth: 4, borderLeftColor: C.amber500 },
  notifIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  notifItemTitle: { fontSize: 13, fontWeight: '600', color: C.gray800 },
  notifItemMsg: { fontSize: 12, color: C.gray600, marginTop: 2 },
  notifItemDate: { fontSize: 10, color: C.gray400, marginTop: 4 },
  unreadDotPop: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.amber500 },
});
