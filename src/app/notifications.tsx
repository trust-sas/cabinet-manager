/**
 * src/app/notifications.tsx
 * Écran des Notifications & Invitations aux Dossiers.
 * Inclus : Réponses [Accepter] / [Refuser] aux invitations de dossiers et demandes de permission.
 */

import { AppColors as C } from '@/constants/theme';
import {
  getNotifications, marquerNotificationCommeLue, marquerToutesNotificationsCommeLues,
  supprimerNotification, NotificationItem, NotificationType,
} from '@/services/notifications.service';
import {
  getAllNotifications, repondreInvitation, repondrePermissionConsultation,
  chargerDonneesInvitationsPersistantes, repondreInvitationApi,
  AppNotification, DossierInvitation, PermissionRequest,
} from '@/services/dossierInvitations.service';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';
import {
  AlertTriangle, ArrowLeft, Bell, Calendar, Check, CheckCheck, ChevronRight,
  Clock, DollarSign, FileText, Info, Mail, Lock, ShieldAlert, Trash2, UserCheck, UserX, X,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, FlatList, Modal, PanResponder, RefreshControl, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { extractErrorMessage } from '@/lib/api';
import { SafeAreaView } from 'react-native-safe-area-context';

const TYPE_CFG: Record<string, { label: string; Icon: any; color: string; bg: string }> = {
  audience_rappel:    { label: 'Audience',     Icon: Calendar,      color: C.blue600,   bg: C.blue100 },
  facture_retard:     { label: 'Facture',      Icon: DollarSign,    color: C.red600,    bg: C.red100 },
  rdv_rappel:         { label: 'Rendez-vous',  Icon: Calendar,      color: C.purple600, bg: C.purple100 },
  invitation:         { label: 'Invitation',   Icon: Mail,          color: C.amber600,  bg: C.amber100 },
  permission_requete: { label: 'Permission',   Icon: Lock,          color: C.purple600, bg: C.purple100 },
  permission_reponse: { label: 'Autorisation', Icon: ShieldAlert,    color: C.green600,  bg: C.green100 },
  info:               { label: 'Information',  Icon: Info,          color: C.gray600,   bg: C.gray100 },
};

const formatDate = (date: string) => {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffH < 24) return `Il y a ${diffH}h`;
  if (diffD === 1) return 'Hier';
  if (diffD < 7) return `Il y a ${diffD} jours`;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(d);
};

type Filter = 'all' | 'unread';

function SwipeableCard({
  onDelete,
  children,
}: {
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const pan = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 80 || gestureState.dx < -80) {
          Animated.timing(pan.x, {
            toValue: gestureState.dx > 0 ? 500 : -500,
            duration: 200,
            useNativeDriver: false,
          }).start(() => onDelete());
        } else {
          Animated.spring(pan.x, { toValue: 0, useNativeDriver: false }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan.x, { toValue: 0, useNativeDriver: false }).start();
      },
    })
  ).current;

  return (
    <View style={s.swipeWrap}>
      <View style={s.swipeBg}>
        <Trash2 color={C.white} size={18} />
        <Text style={s.swipeText}>Glissez pour supprimer</Text>
        <Trash2 color={C.white} size={18} />
      </View>
      <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX: pan.x }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<(NotificationItem | AppNotification)[]>([]);
  const [nonLues, setNonLues] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<Filter>('all');
  const [selectedInvModal, setSelectedInvModal] = useState<DossierInvitation | null>(null);

  const fetchNotifs = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Notifications backend (audiences, factures, etc.)
      const apiRes = await getNotifications().catch(() => ({ data: [], nonLuesCount: 0 }));

      // 2. Invitations depuis /api/v1/invitations
      const invitations = await chargerDonneesInvitationsPersistantes();
      const invMap = new Map<number, DossierInvitation>();
      invitations.forEach(inv => invMap.set(Number(inv.dossierId), inv));

      const backendMapped: (NotificationItem | AppNotification)[] = (apiRes.data as NotificationItem[]).map(n => {
        const matchInv = n.entiteId ? invMap.get(Number(n.entiteId)) : undefined;
        if (matchInv || n.titre.includes('Invitation')) {
          return {
            id: String(n.id),
            titre: n.titre,
            message: n.message,
            type: 'invitation' as const,
            lu: n.lu,
            createdAt: n.createdAt,
            invitationData: matchInv || (invitations.length > 0 ? invitations[0] : undefined),
          };
        }
        return n;
      });

      const matchedInvDossierIds = new Set(
        backendMapped
          .filter(n => (n as AppNotification).invitationData)
          .map(n => Number((n as AppNotification).invitationData?.dossierId))
      );

      const standaloneInvs: AppNotification[] = invitations
        .filter(inv => !matchedInvDossierIds.has(Number(inv.dossierId)))
        .map(inv => ({
          id: `inv-${inv.id}`,
          titre: `📩 Invitation — Dossier ${inv.dossierNumero}`,
          message: `${inv.inviteurNom} vous a invité à rejoindre le dossier "${inv.dossierTitre}".`,
          type: 'invitation' as const,
          lu: inv.statut !== 'en_attente',
          createdAt: inv.createdAt,
          invitationData: inv,
        }));

      const combined = [...standaloneInvs, ...backendMapped];
      setNotifs(combined);
      setNonLues(combined.filter(n => !n.lu).length);
    } catch (e) {
      console.log('Notification fetch error', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifs();
  }, [fetchNotifs]);

  const handleMarkAllRead = async () => {
    try {
      await marquerToutesNotificationsCommeLues().catch(() => {});
      setNotifs(prev => prev.map(n => ({ ...n, lu: true })));
      setNonLues(0);
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de marquer comme lu');
    }
  };

  const handleResponseInvitation = async (inv: DossierInvitation, accepter: boolean) => {
    try {
      const res = await repondreInvitationApi(inv.id, accepter);
      if (res.success) {
        Alert.alert(accepter ? '✅ Invitation acceptée' : '❌ Invitation refusée', res.message);
        fetchNotifs();
      }
    } catch (e: any) {
      Alert.alert('Erreur', extractErrorMessage(e));
    }
  };

  const handleDeleteNotif = async (notif: NotificationItem | AppNotification) => {
    // Invitation locale : juste la retirer de l'état
    if (typeof notif.id === 'string' && String(notif.id).startsWith('inv-')) {
      setNotifs(prev => prev.filter(n => n.id !== notif.id));
      return;
    }
    // Notification backend : appel DELETE /notifications/:id
    try {
      await supprimerNotification(Number(notif.id));
      setNotifs(prev => prev.filter(n => n.id !== notif.id));
      setNonLues(prev => Math.max(0, notif.lu ? prev : prev - 1));
    } catch {
      // Si la suppression échoue silencieusement, on retire quand même de l'UI
      setNotifs(prev => prev.filter(n => n.id !== notif.id));
    }
  };

  const handleResponsePermission = (req: PermissionRequest, autoriser: boolean) => {
    const res = repondrePermissionConsultation(req.id, autoriser);
    if (res.success) {
      Alert.alert(autoriser ? '🔓 Accès autorisé' : '🚫 Accès refusé', res.message);
      fetchNotifs();
    }
  };

  const filtered = notifs.filter(n => activeFilter === 'all' || !n.lu);

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.navy900 }}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
            <ArrowLeft color={C.gray400} size={20} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Notifications & Invitations</Text>
            <Text style={s.sub}>{nonLues > 0 ? `${nonLues} non lue(s)` : 'Tout est à jour'}</Text>
          </View>
          {nonLues > 0 && (
            <TouchableOpacity style={s.markAllBtn} onPress={handleMarkAllRead} activeOpacity={0.8}>
              <CheckCheck color={C.amber300} size={14} />
              <Text style={s.markAllText}>Tout lire</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={s.filtersContent}>
          {[
            { key: 'all', label: `Toutes (${notifs.length})` },
            { key: 'unread', label: `Non lues (${nonLues})` },
          ].map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              onPress={() => setActiveFilter(key as Filter)}
              style={[s.filterBtn, activeFilter === key && s.filterBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[s.filterText, activeFilter === key && s.filterTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>

      <FlatList
        data={filtered}
        keyExtractor={(item, index) => String(item.id || index)}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={fetchNotifs} tintColor={C.amber500} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={s.empty}>
              <ActivityIndicator color={C.amber500} size="large" />
            </View>
          ) : (
            <View style={s.empty}>
              <Bell color={C.gray400} size={48} />
              <Text style={s.emptyTitle}>Aucune notification</Text>
              <Text style={s.emptyDesc}>Vous êtes parfaitement à jour !</Text>
            </View>
          )
        }
        renderItem={({ item: notif }) => {
          const cfg = TYPE_CFG[notif.type] || TYPE_CFG.info;
          const Icon = cfg.Icon;
          const inv = (notif as AppNotification).invitationData || (
            (notif.type === 'invitation' || notif.titre.toLowerCase().includes('invitation')) ? {
              id: (notif as any).entiteId || notif.id,
              dossierId: Number((notif as any).entiteId) || 0,
              dossierNumero: notif.titre.replace(/.*dossier\s*/i, '') || 'Dossier',
              dossierTitre: notif.message,
              juridiction: 'Tribunal',
              inviteurNom: 'Avocat confrère',
              inviteurTelephone: '',
              inviteurEmail: undefined,
              destinataireTelephone: '',
              destinataireEmail: undefined,
              statut: 'en_attente' as const,
              createdAt: (notif as any).createdAt || new Date().toISOString(),
            } : undefined
          );
          const perm = (notif as AppNotification).permissionData;

          const isInvNotif = Boolean(inv || notif.type === 'invitation' || notif.titre.toLowerCase().includes('invitation'));

          return (
            <SwipeableCard onDelete={() => handleDeleteNotif(notif)}>
              <TouchableOpacity
                style={[s.card, !notif.lu && s.cardUnread]}
                activeOpacity={isInvNotif ? 0.88 : 1}
                onPress={() => {
                  if (isInvNotif) {
                    router.push('/invitations-mail');
                  }
                }}
              >
                {/* Bouton × fermer — positionné en haut à droite */}
                <TouchableOpacity
                  style={s.closeCross}
                  onPress={(e) => { e.stopPropagation?.(); handleDeleteNotif(notif); }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                  <X color={C.gray500} size={11} />
                </TouchableOpacity>

              <View style={s.cardContent}>
                <View style={[s.iconWrap, { backgroundColor: cfg.bg }]}>
                  <Icon color={cfg.color} size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.titleRow}>
                    <Text style={[s.notifTitle, !notif.lu && { color: C.gray900 }]} numberOfLines={1}>
                      {notif.titre}
                    </Text>
                    <View style={[s.typeBadge, { backgroundColor: cfg.bg }]}>
                      <Text style={[s.typeBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>

                  <Text style={s.notifMsg}>{notif.message}</Text>

                  {/* ALERTE INVITATION → Appuyer pour ouvrir le mail d'invitation */}
                  {isInvNotif && (
                    <View style={s.invitationBox}>
                      <TouchableOpacity
                        style={s.tapHintRow}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          router.push('/invitations-mail');
                        }}
                        activeOpacity={0.85}
                      >
                        <Mail color={C.amber600} size={14} />
                        <Text style={s.tapHintText}>✉️ Voir le mail d'invitation dans la Boîte de Réception →</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* PERMISSION CONSULTATION */}
                  {perm && (
                    <View style={s.invitationBox}>
                      <Text style={s.invDossierTitle}>🔐 Demande d'accès : {perm.dossierNumero}</Text>
                      <Text style={s.invSender}>Demandeur : {perm.demandeurNom} ({perm.demandeurEmail})</Text>

                      {perm.statut === 'en_attente' ? (
                        <View style={s.actionBtnRow}>
                          <TouchableOpacity
                            style={s.acceptBtn}
                            onPress={() => handleResponsePermission(perm, true)}
                            activeOpacity={0.85}
                          >
                            <Check color={C.white} size={15} />
                            <Text style={s.acceptBtnText}>Autoriser</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={s.refuseBtn}
                            onPress={() => handleResponsePermission(perm, false)}
                            activeOpacity={0.85}
                          >
                            <X color={C.white} size={15} />
                            <Text style={s.refuseBtnText}>Refuser</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={s.statusTag}>
                          <Text style={[s.statusTagText, perm.statut === 'autorisee' ? { color: C.green700 } : { color: C.red700 }]}>
                            {perm.statut === 'autorisee' ? '✓ Accès autorisé' : '✕ Accès refusé'}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  <View style={s.bottomRow}>
                    <Text style={s.notifDate}>{(notif as any).createdAt ? formatDate((notif as any).createdAt) : 'Récemment'}</Text>
                  </View>
                </View>
              </View>
              {!notif.lu && <View style={s.unreadDot} />}
            </TouchableOpacity>
          </SwipeableCard>
          );
        }}
      />
      {/* ── MODAL POP-UP INTERACTIF ACCEPTER / REFUSER L'INVITATION ── */}
      {selectedInvModal && (
        <View style={s.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setSelectedInvModal(null)}
          />
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View style={s.modalIconWrap}>
                <Mail color={C.amber600} size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>Invitation à un Dossier</Text>
                <Text style={s.modalSub}>Confirmez votre accès au dossier</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedInvModal(null)} style={s.modalCloseBtn}>
                <X color={C.gray500} size={20} />
              </TouchableOpacity>
            </View>

            <View style={s.modalBody}>
              <View style={s.modalInfoRow}>
                <Text style={s.modalInfoLabel}>Numéro d'affaire :</Text>
                <Text style={s.modalInfoVal}>{selectedInvModal.dossierNumero}</Text>
              </View>

              <View style={s.modalInfoRow}>
                <Text style={s.modalInfoLabel}>Intitulé du dossier :</Text>
                <Text style={s.modalInfoVal}>{selectedInvModal.dossierTitre}</Text>
              </View>

              <View style={s.modalInfoRow}>
                <Text style={s.modalInfoLabel}>Juridiction :</Text>
                <Text style={s.modalInfoVal}>{selectedInvModal.juridiction || 'Tribunal'}</Text>
              </View>

              <View style={s.modalInfoRow}>
                <Text style={s.modalInfoLabel}>Invité par :</Text>
                <Text style={[s.modalInfoVal, { color: C.amber700, fontWeight: '700' }]}>
                  {selectedInvModal.inviteurNom} ({selectedInvModal.inviteurEmail})
                </Text>
              </View>
            </View>

            {selectedInvModal.statut === 'en_attente' ? (
              <View style={{ gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={s.modalAcceptBtn}
                  onPress={() => {
                    const inv = selectedInvModal;
                    setSelectedInvModal(null);
                    handleResponseInvitation(inv, true);
                  }}
                  activeOpacity={0.85}
                >
                  <UserCheck color={C.white} size={18} />
                  <Text style={s.modalAcceptText}>ACCEPTER L'INVITATION</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.modalRefuseBtn}
                  onPress={() => {
                    const inv = selectedInvModal;
                    setSelectedInvModal(null);
                    handleResponseInvitation(inv, false);
                  }}
                  activeOpacity={0.85}
                >
                  <UserX color={C.white} size={18} />
                  <Text style={s.modalRefuseText}>REFUSER L'INVITATION</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ marginTop: 16, alignItems: 'center', gap: 12 }}>
                <View style={[s.modalStatusBadge, selectedInvModal.statut === 'acceptee' ? { backgroundColor: C.green100 } : { backgroundColor: C.red100 }]}>
                  <Text style={[s.modalStatusText, selectedInvModal.statut === 'acceptee' ? { color: C.green700 } : { color: C.red700 }]}>
                    {selectedInvModal.statut === 'acceptee' ? '✓ Invitation déjà acceptée (Dossier rattaché)' : '✕ Invitation déjà refusée'}
                  </Text>
                </View>
                <TouchableOpacity style={s.modalCloseFullBtn} onPress={() => setSelectedInvModal(null)}>
                  <Text style={s.modalCloseFullText}>Fermer</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  header: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingBottom: 10, gap: 12, backgroundColor: C.navy900 },
  backBtn: { paddingTop: 4 },
  title: { fontSize: 20, fontWeight: '700', color: C.white },
  sub: { fontSize: 12, color: C.amber400, marginTop: 2 },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.navy800, borderWidth: 1, borderColor: C.navy700, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  markAllText: { fontSize: 12, color: C.amber400, fontWeight: '500' },
  filtersContent: { paddingHorizontal: 14, gap: 8, paddingBottom: 10, backgroundColor: C.navy900 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: C.navy700, backgroundColor: C.navy800 },
  filterBtnActive: { backgroundColor: C.amber500, borderColor: C.amber500 },
  filterText: { fontSize: 12, fontWeight: '500', color: C.gray400 },
  filterTextActive: { color: C.gray900, fontWeight: '700' },
  list: { padding: 14, paddingBottom: 60, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.gray900 },
  emptyDesc: { fontSize: 12, color: C.gray500 },
  card: { position: 'relative', backgroundColor: C.white, borderRadius: 14, padding: 14, paddingRight: 36, shadowColor: C.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1, borderWidth: 1, borderColor: C.gray200 },
  cardUnread: { borderLeftWidth: 4, borderLeftColor: C.amber500 },
  cardContent: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4, paddingRight: 10 },
  notifTitle: { fontSize: 14, fontWeight: '700', color: C.gray900, flex: 1 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },
  notifMsg: { fontSize: 13, color: C.gray700, lineHeight: 19, marginBottom: 6 },
  
  invitationBox: {
    backgroundColor: C.gray100,
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: C.gray300,
    gap: 4,
  },
  invDossierTitle: { fontSize: 13, fontWeight: '700', color: C.gray900 },
  invDossierSub: { fontSize: 12, color: C.gray700, fontStyle: 'italic' },
  invJuridiction: { fontSize: 11, color: C.gray600 },
  invSender: { fontSize: 11, color: C.amber700, fontWeight: '600', marginTop: 2 },
  actionBtnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.green600,
    paddingVertical: 9,
    borderRadius: 10,
  },
  acceptBtnText: { fontSize: 13, fontWeight: '700', color: C.white },
  refuseBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.red600,
    paddingVertical: 9,
    borderRadius: 10,
  },
  refuseBtnText: { fontSize: 13, fontWeight: '700', color: C.white },
  statusTag: { marginTop: 6, paddingTop: 4 },
  statusTagText: { fontSize: 12, fontWeight: '700' },

  tapHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: C.amber50, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: C.amber200 },
  tapHintText: { fontSize: 12, fontWeight: '600', color: C.amber700, flex: 1 },
  expiryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  expiryText: { fontSize: 10, color: C.gray400 },

  bottomRow: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', marginTop: 4 },
  notifDate: { fontSize: 11, color: C.gray400 },
  closeCross: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 99,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.gray200,
  },
  deleteBtn: { padding: 4, borderRadius: 6 },
  unreadDot: { position: 'absolute', top: 10, right: 38, width: 8, height: 8, borderRadius: 4, backgroundColor: C.amber500 },

  // ── Swipe-to-Delete Styles ──
  swipeWrap: { position: 'relative', marginVertical: 4, borderRadius: 14, overflow: 'hidden' },
  swipeBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.red600,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  swipeText: { color: C.white, fontWeight: '700', fontSize: 12 },

  // ── Modal Pop-up ──
  modalOverlay: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 999999,
  },
  modalCard: { width: '100%', maxWidth: 440, backgroundColor: C.white, borderRadius: 20, padding: 20, shadowColor: C.black, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 15, elevation: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.gray200, marginBottom: 4 },
  modalIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.amber100, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: C.gray900 },
  modalSub: { fontSize: 12, color: C.gray500 },
  modalCloseBtn: { padding: 4 },
  modalBody: { gap: 10, marginTop: 10, backgroundColor: C.gray50, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.gray200 },
  modalInfoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  modalInfoLabel: { fontSize: 12, fontWeight: '600', color: C.gray500 },
  modalInfoVal: { fontSize: 12, fontWeight: '700', color: C.gray900, flex: 1, textAlign: 'right' },
  modalAcceptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.green600, borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  modalAcceptText: { fontSize: 14, fontWeight: '700', color: C.white },
  modalRefuseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.red600, borderRadius: 14, paddingVertical: 14, marginTop: 10 },
  modalRefuseText: { fontSize: 14, fontWeight: '700', color: C.white },
  modalStatusBadge: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  modalStatusText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  modalCloseFullBtn: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: C.gray200, borderRadius: 10 },
  modalCloseFullText: { fontSize: 13, fontWeight: '700', color: C.gray700 },
});

