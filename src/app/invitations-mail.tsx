/**
 * src/app/invitations-mail.tsx
 * Boîte de Réception dédiée aux Invitations (Messagerie In-App).
 *
 * Reçoit les emails d'invitations aux dossiers.
 * Un clic sur un mail ouvre le Pop-up Modal d'acceptation / refus.
 */

import { AppColors as C } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { extractErrorMessage } from '@/lib/api';
import {
  chargerDonneesInvitationsPersistantes,
  repondreInvitationApi,
  DossierInvitation,
} from '@/services/dossierInvitations.service';
import {
  getMesDemandesPermissions,
  repondreDemandeAccesDocument,
  DocumentPermissionItem,
} from '@/services/documents.service';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Clock,
  Check,
  Mail,
  RefreshCw,
  Trash2,
  UserCheck,
  UserX,
  X,
  Lock,
  ShieldAlert,
  FileText,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  PanResponder,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type FilterStatut = 'all' | 'en_attente' | 'acceptee' | 'refusee';

interface InboxItem {
  kind: 'invitation' | 'permission';
  id: string;
  dossierId: number;
  dossierNumero?: string | null;
  title: string;
  subtitle: string;
  senderName: string;
  senderContact: string;
  statut: 'en_attente' | 'acceptee' | 'refusee' | 'autorisee';
  createdAt?: string;
  invRaw?: DossierInvitation;
  permRaw?: DocumentPermissionItem;
}

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
        return Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 90 || gestureState.dx < -90) {
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

const formatDate = (dateStr?: string) => {
  if (!dateStr) return 'Récemment';
  const d = new Date(dateStr);
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

export default function InvitationsMailScreen() {
  const router = useRouter();
  const { colors: K, isDark } = useTheme();
  const { user } = useAuth();

  const [invitations, setInvitations] = useState<DossierInvitation[]>([]);
  const [permissions, setPermissions] = useState<DocumentPermissionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatut>('all');

  const [selectedInvModal, setSelectedInvModal] = useState<DossierInvitation | null>(null);
  const [selectedPermModal, setSelectedPermModal] = useState<DocumentPermissionItem | null>(null);

  const fetchInbox = useCallback(async () => {
    setIsLoading(true);
    try {
      const [invData, permData] = await Promise.all([
        chargerDonneesInvitationsPersistantes().catch(() => []),
        getMesDemandesPermissions().catch(() => []),
      ]);
      setInvitations(invData);
      setPermissions(permData);
    } catch (e) {
      console.log('Erreur fetch invitations/permissions mail', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  const handleResponseInvitation = async (inv: DossierInvitation, accepter: boolean) => {
    try {
      const res = await repondreInvitationApi(inv.id, accepter);
      Alert.alert(
        accepter ? '✓ Invitation acceptée' : '✕ Invitation refusée',
        res.message,
      );
      setInvitations(prev =>
        prev.map(item =>
          item.id === inv.id
            ? { ...item, statut: accepter ? ('acceptee' as const) : ('refusee' as const) }
            : item,
        ),
      );
      if (selectedInvModal?.id === inv.id) {
        setSelectedInvModal(null);
      }
    } catch (e) {
      Alert.alert('Erreur', extractErrorMessage(e));
    }
  };

  const handleResponsePermission = async (perm: DocumentPermissionItem, autoriser: boolean) => {
    try {
      const res = await repondreDemandeAccesDocument(perm.id, autoriser);
      Alert.alert(
        autoriser ? '🔓 Accès autorisé' : '🚫 Accès refusé',
        res.message || (autoriser ? 'Accès accordé au confrère demandeur.' : 'Demande refusée.'),
      );
      setPermissions(prev =>
        prev.map(item =>
          item.id === perm.id
            ? { ...item, statut: autoriser ? 'autorisee' : 'refusee' }
            : item,
        ),
      );
      if (selectedPermModal?.id === perm.id) {
        setSelectedPermModal(null);
      }
    } catch (e) {
      Alert.alert('Erreur', extractErrorMessage(e));
    }
  };

  const allItems: InboxItem[] = useMemo(() => {
    const invItems: InboxItem[] = invitations.map(inv => ({
      kind: 'invitation',
      id: `inv-${inv.id}`,
      dossierId: inv.dossierId,
      dossierNumero: inv.dossierNumero,
      title: `📁 Dossier : ${inv.dossierNumero} — ${inv.dossierTitre}`,
      subtitle: `Juridiction : ${inv.juridiction || 'Tribunal'}`,
      senderName: inv.inviteurNom,
      senderContact: inv.inviteurEmail || inv.destinataireTelephone || '',
      statut: inv.statut,
      createdAt: inv.createdAt,
      invRaw: inv,
    }));

    const permItems: InboxItem[] = permissions.map(perm => ({
      kind: 'permission',
      id: `perm-${perm.id}`,
      dossierId: perm.dossierId,
      dossierNumero: perm.dossierNumero,
      title: `🔒 Demande d'accès secret : ${perm.documentNom}`,
      subtitle: `Affaire : ${perm.dossierNumero}`,
      senderName: perm.demandeurNom || 'Confrère invité',
      senderContact: perm.demandeurTelephone || perm.demandeurEmail || '',
      statut: perm.statut,
      createdAt: perm.createdAt,
      permRaw: perm,
    }));

    return [...permItems, ...invItems].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }, [invitations, permissions]);

  const handleDeleteItem = (id: string) => {
    if (id.startsWith('inv-')) {
      const realId = id.replace('inv-', '');
      setInvitations(prev => prev.filter(i => String(i.id) !== realId));
    } else if (id.startsWith('perm-')) {
      const realId = id.replace('perm-', '');
      setPermissions(prev => prev.filter(p => String(p.id) !== realId));
    }
  };

  const filtered = allItems.filter(i => {
    if (filter === 'en_attente') return i.statut === 'en_attente';
    if (filter === 'acceptee') return i.statut === 'acceptee' || i.statut === 'autorisee';
    if (filter === 'refusee') return i.statut === 'refusee';
    return true;
  });

  const pendingCount = allItems.filter(i => i.statut === 'en_attente').length;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: K.bg }]} edges={['top', 'left', 'right']}>
      {/* ── En-tête Navigation ── */}
      <View style={[s.header, { backgroundColor: K.bgSecondary }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <ArrowLeft color={K.text} size={22} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Mail color={K.primary} size={20} />
            <Text style={[s.title, { color: K.text }]}>Boîte de Réception</Text>
          </View>
          <Text style={[s.sub, { color: K.textMuted }]}>Invitations et demandes d'accès aux dossiers</Text>
        </View>
        <TouchableOpacity style={[s.refreshBtn, { backgroundColor: K.bgTertiary }]} onPress={fetchInbox} activeOpacity={0.7}>
          <RefreshCw color={K.primary} size={18} />
        </TouchableOpacity>
      </View>

      {/* ── Filtres de la Messagerie ── */}
      <View style={[s.filtersContainer, { backgroundColor: K.bgSecondary }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersContent}>
          {[
            { key: 'all', label: `Toutes (${allItems.length})` },
            { key: 'en_attente', label: `En attente (${pendingCount})` },
            { key: 'acceptee', label: 'Validées' },
            { key: 'refusee', label: 'Refusées' },
          ].map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              onPress={() => setFilter(key as FilterStatut)}
              style={[
                s.filterBtn,
                { backgroundColor: K.bgTertiary, borderColor: K.border },
                filter === key && { backgroundColor: K.primary, borderColor: K.primary }
              ]}
              activeOpacity={0.8}
            >
              <Text style={[s.filterText, { color: K.textMuted }, filter === key && { color: isDark ? C.gray900 : '#ffffff', fontWeight: '700' }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Liste des messages dans la boîte de réception ── */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={fetchInbox} tintColor={C.amber500} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={s.empty}>
              <ActivityIndicator color={K.primary} size="large" />
            </View>
          ) : (
            <View style={s.empty}>
              <Mail color={K.textMuted} size={48} />
              <Text style={[s.emptyTitle, { color: K.text }]}>Boîte de réception vide</Text>
              <Text style={[s.emptyDesc, { color: K.textMuted }]}>Aucune invitation ni demande d'accès en attente.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const isPerm = item.kind === 'permission';
          const isPending = item.statut === 'en_attente';

          return (
            <SwipeableCard onDelete={() => handleDeleteItem(item.id)}>
              <TouchableOpacity
                style={[
                  s.card,
                  { backgroundColor: K.surface, borderColor: K.border },
                  isPending && { borderLeftWidth: 4, borderLeftColor: isPerm ? C.purple600 : K.primary },
                ]}
                activeOpacity={0.88}
                onPress={() => {
                  if (isPerm && item.permRaw) {
                    setSelectedPermModal(item.permRaw);
                  } else if (!isPerm && item.invRaw) {
                    setSelectedInvModal(item.invRaw);
                  }
                }}
              >
                {/* Header Row */}
                <View style={s.cardHeaderRow}>
                  <View style={[s.iconWrap, { backgroundColor: isPerm ? C.purple100 : K.primaryLight }]}>
                    {isPerm ? <Lock color={C.purple700} size={20} /> : <Mail color={K.primary} size={20} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.senderRow}>
                      <Text style={[s.senderName, { color: K.text }]} numberOfLines={1}>
                        {isPerm ? `🔒 Demande de : ${item.senderName}` : item.senderName}
                      </Text>
                      <Text style={[s.mailDate, { color: K.textMuted }]}>{formatDate(item.createdAt)}</Text>
                    </View>
                    <Text style={[s.senderEmail, { color: K.textMuted }]} numberOfLines={1}>
                      {item.senderContact}
                    </Text>
                  </View>
                </View>

                {/* Body Box */}
                <View style={[s.mailBodyBox, { backgroundColor: K.bgSecondary, borderColor: K.border }]}>
                  <Text style={[s.dossierTitle, { color: K.text }]}>{item.title}</Text>
                  <Text style={[s.juridictionText, { color: K.textMuted }]}>{item.subtitle}</Text>
                </View>

                {/* Status & Actions */}
                {isPending ? (
                  <View style={{ marginTop: 8 }}>
                    <TouchableOpacity
                      style={[
                        s.tapToOpenRow,
                        {
                          backgroundColor: isPerm ? C.purple50 : K.primaryLight,
                          borderColor: isPerm ? C.purple300 : K.primary,
                        },
                      ]}
                      onPress={() => {
                        if (isPerm && item.permRaw) {
                          setSelectedPermModal(item.permRaw);
                        } else if (!isPerm && item.invRaw) {
                          setSelectedInvModal(item.invRaw);
                        }
                      }}
                      activeOpacity={0.85}
                    >
                      {isPerm ? <Lock color={C.purple700} size={14} /> : <Mail color={K.primary} size={14} />}
                      <Text
                        style={[
                          s.tapToOpenText,
                          { color: isPerm ? C.purple700 : K.primary },
                        ]}
                      >
                        {isPerm ? "🔐 Ouvrir pour Autoriser / Refuser l'accès →" : "📩 Voir les détails de l'invitation →"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={s.statusTag}>
                    <Text
                      style={[
                        s.statusTagText,
                        item.statut === 'acceptee' || item.statut === 'autorisee'
                          ? { color: K.success }
                          : { color: K.danger },
                      ]}
                    >
                      {item.statut === 'acceptee'
                        ? '✓ Invitation acceptée (Dossier rattaché)'
                        : item.statut === 'autorisee'
                        ? '✓ Accès autorisé au document secret'
                        : '✕ Demande refusée'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </SwipeableCard>
          );
        }}
      />

      {/* ── POP-UP MODAL INVITATION DOSSIER ── */}
      {selectedInvModal && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedInvModal(null)}
        >
          <TouchableOpacity
            style={s.modalOverlay}
            activeOpacity={1}
            onPress={() => setSelectedInvModal(null)}
          >
            <TouchableOpacity
              style={[s.modalCard, { backgroundColor: K.surface }]}
              activeOpacity={1}
              onPress={() => {}}
            >
              <View style={[s.modalHeader, { borderBottomColor: K.border }]}>
                <View style={[s.modalIconWrap, { backgroundColor: K.primaryLight }]}>
                  <Mail color={K.primary} size={24} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.modalTitle, { color: K.text }]}>Détails de l'Invitation</Text>
                  <Text style={[s.modalSub, { color: K.textMuted }]}>Confirmez ou refusez l'accès au dossier</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedInvModal(null)} style={s.modalCloseBtn}>
                  <X color={K.textMuted} size={20} />
                </TouchableOpacity>
              </View>

              <View style={[s.modalBody, { backgroundColor: K.bgSecondary, borderColor: K.border }]}>
                <View style={s.modalInfoRow}>
                  <Text style={[s.modalInfoLabel, { color: K.textMuted }]}>Numéro d'affaire :</Text>
                  <Text style={[s.modalInfoVal, { color: K.text }]}>{selectedInvModal.dossierNumero}</Text>
                </View>

                <View style={s.modalInfoRow}>
                  <Text style={[s.modalInfoLabel, { color: K.textMuted }]}>Intitulé du dossier :</Text>
                  <Text style={[s.modalInfoVal, { color: K.text }]}>{selectedInvModal.dossierTitre}</Text>
                </View>

                <View style={s.modalInfoRow}>
                  <Text style={[s.modalInfoLabel, { color: K.textMuted }]}>Juridiction :</Text>
                  <Text style={[s.modalInfoVal, { color: K.text }]}>{selectedInvModal.juridiction || 'Tribunal'}</Text>
                </View>

                <View style={s.modalInfoRow}>
                  <Text style={[s.modalInfoLabel, { color: K.textMuted }]}>Invité par :</Text>
                  <Text style={[s.modalInfoVal, { color: K.primary, fontWeight: '700' }]}>
                    {selectedInvModal.inviteurNom}
                  </Text>
                </View>
              </View>

              {selectedInvModal.statut === 'en_attente' ? (
                <View style={{ gap: 10, marginTop: 16 }}>
                  <TouchableOpacity
                    style={[s.modalAcceptBtn, { backgroundColor: K.success }]}
                    onPress={() => handleResponseInvitation(selectedInvModal, true)}
                    activeOpacity={0.85}
                  >
                    <UserCheck color="#ffffff" size={18} />
                    <Text style={s.modalAcceptText}>ACCEPTER L'INVITATION</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.modalRefuseBtn, { backgroundColor: K.danger }]}
                    onPress={() => handleResponseInvitation(selectedInvModal, false)}
                    activeOpacity={0.85}
                  >
                    <UserX color="#ffffff" size={18} />
                    <Text style={s.modalRefuseText}>REFUSER L'INVITATION</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ marginTop: 16, alignItems: 'center', gap: 12 }}>
                  <View style={[s.modalStatusBadge, selectedInvModal.statut === 'acceptee' ? { backgroundColor: K.successLight } : { backgroundColor: K.dangerLight }]}>
                    <Text style={[s.modalStatusText, selectedInvModal.statut === 'acceptee' ? { color: K.success } : { color: K.danger }]}>
                      {selectedInvModal.statut === 'acceptee' ? '✓ Invitation déjà acceptée (Dossier rattaché)' : '✕ Invitation déjà refusée'}
                    </Text>
                  </View>
                  <TouchableOpacity style={[s.modalCloseFullBtn, { backgroundColor: K.bgTertiary }]} onPress={() => setSelectedInvModal(null)}>
                    <Text style={[s.modalCloseFullText, { color: K.textSecondary }]}>Fermer</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* ── POP-UP MODAL PERMISSION DOCUMENT SECRET ── */}
      {selectedPermModal && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedPermModal(null)}
        >
          <TouchableOpacity
            style={s.modalOverlay}
            activeOpacity={1}
            onPress={() => setSelectedPermModal(null)}
          >
            <TouchableOpacity
              style={[s.modalCard, { backgroundColor: K.surface }]}
              activeOpacity={1}
              onPress={() => {}}
            >
              <View style={[s.modalHeader, { borderBottomColor: K.border }]}>
                <View style={[s.modalIconWrap, { backgroundColor: C.purple100 }]}>
                  <Lock color={C.purple700} size={24} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.modalTitle, { color: K.text }]}>Demande d'Accès Secret</Text>
                  <Text style={[s.modalSub, { color: K.textMuted }]}>Autoriser le confrère à consulter la pièce</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedPermModal(null)} style={s.modalCloseBtn}>
                  <X color={K.textMuted} size={20} />
                </TouchableOpacity>
              </View>

              <View style={[s.modalBody, { backgroundColor: K.bgSecondary, borderColor: K.border }]}>
                <View style={s.modalInfoRow}>
                  <Text style={[s.modalInfoLabel, { color: K.textMuted }]}>Document protégé :</Text>
                  <Text style={[s.modalInfoVal, { color: K.text }]} numberOfLines={2}>{selectedPermModal.documentNom}</Text>
                </View>

                <View style={s.modalInfoRow}>
                  <Text style={[s.modalInfoLabel, { color: K.textMuted }]}>Dossier :</Text>
                  <Text style={[s.modalInfoVal, { color: K.text }]}>{selectedPermModal.dossierNumero}</Text>
                </View>

                <View style={s.modalInfoRow}>
                  <Text style={[s.modalInfoLabel, { color: K.textMuted }]}>Demandeur :</Text>
                  <Text style={[s.modalInfoVal, { color: C.purple700, fontWeight: '700' }]}>
                    {selectedPermModal.demandeurNom || 'Confrère invité'}
                  </Text>
                </View>

                {selectedPermModal.demandeurTelephone ? (
                  <View style={s.modalInfoRow}>
                    <Text style={[s.modalInfoLabel, { color: K.textMuted }]}>Téléphone :</Text>
                    <Text style={[s.modalInfoVal, { color: K.text }]}>{selectedPermModal.demandeurTelephone}</Text>
                  </View>
                ) : null}
              </View>

              {selectedPermModal.statut === 'en_attente' ? (
                <View style={{ gap: 10, marginTop: 16 }}>
                  <TouchableOpacity
                    style={[s.modalAcceptBtn, { backgroundColor: C.green600 }]}
                    onPress={() => handleResponsePermission(selectedPermModal, true)}
                    activeOpacity={0.85}
                  >
                    <Check color="#ffffff" size={18} />
                    <Text style={s.modalAcceptText}>AUTORISER L'ACCÈS AU DOCUMENT</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.modalRefuseBtn, { backgroundColor: C.red600 }]}
                    onPress={() => handleResponsePermission(selectedPermModal, false)}
                    activeOpacity={0.85}
                  >
                    <X color="#ffffff" size={18} />
                    <Text style={s.modalRefuseText}>REFUSER LA DEMANDE</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ marginTop: 16, alignItems: 'center', gap: 12 }}>
                  <View style={[s.modalStatusBadge, selectedPermModal.statut === 'autorisee' ? { backgroundColor: K.successLight } : { backgroundColor: K.dangerLight }]}>
                    <Text style={[s.modalStatusText, selectedPermModal.statut === 'autorisee' ? { color: K.success } : { color: K.danger }]}>
                      {selectedPermModal.statut === 'autorisee' ? '✓ Accès autorisé au confrère' : '✕ Demande d\'accès refusée'}
                    </Text>
                  </View>
                  <TouchableOpacity style={[s.modalCloseFullBtn, { backgroundColor: K.bgTertiary }]} onPress={() => setSelectedPermModal(null)}>
                    <Text style={[s.modalCloseFullText, { color: K.textSecondary }]}>Fermer</Text>
                  </TouchableOpacity>
                </View>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 12, gap: 12, backgroundColor: C.navy900 },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '700', color: C.white },
  sub: { fontSize: 12, color: C.amber400, marginTop: 2 },
  refreshBtn: { padding: 8, backgroundColor: C.navy800, borderRadius: 10 },

  filtersContainer: { backgroundColor: C.navy900, paddingBottom: 10 },
  filtersContent: { paddingHorizontal: 14, gap: 8 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: C.navy700, backgroundColor: C.navy800 },
  filterBtnActive: { backgroundColor: C.amber500, borderColor: C.amber500 },
  filterText: { fontSize: 12, fontWeight: '500', color: C.gray400 },
  filterTextActive: { color: C.gray900, fontWeight: '700' },

  list: { padding: 14, paddingBottom: 60, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.gray900 },
  emptyDesc: { fontSize: 12, color: C.gray500 },

  card: { position: 'relative', backgroundColor: C.white, borderRadius: 14, padding: 14, paddingRight: 36, borderWidth: 1, borderColor: C.gray200, shadowColor: C.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  cardPending: { borderLeftWidth: 4, borderLeftColor: C.amber500 },
  closeCross: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 99,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.gray300,
  },

  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.amber100, alignItems: 'center', justifyContent: 'center' },
  senderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  senderName: { fontSize: 14, fontWeight: '700', color: C.gray900, flex: 1 },
  mailDate: { fontSize: 11, color: C.gray400, marginLeft: 8 },
  senderEmail: { fontSize: 12, color: C.gray500 },

  mailBodyBox: { backgroundColor: C.gray50, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: C.gray200, marginVertical: 4, gap: 2 },
  dossierTitle: { fontSize: 13, fontWeight: '700', color: C.gray900 },
  juridictionText: { fontSize: 11, color: C.gray600 },

  tapToOpenRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.amber50, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: C.amber200, marginTop: 4 },
  tapToOpenText: { fontSize: 12, fontWeight: '700', color: C.amber700, flex: 1 },

  expiryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  expiryText: { fontSize: 11, color: C.gray500 },

  statusTag: { marginTop: 6, paddingTop: 4 },
  statusTagText: { fontSize: 12, fontWeight: '700' },

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

  // ── Modal Pop-up Styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
  modalAcceptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.green600, borderRadius: 14, paddingVertical: 14 },
  modalAcceptText: { fontSize: 14, fontWeight: '700', color: C.white },
  modalRefuseBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.red600, borderRadius: 14, paddingVertical: 14 },
  modalRefuseText: { fontSize: 14, fontWeight: '700', color: C.white },
  modalStatusBadge: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  modalStatusText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  modalCloseFullBtn: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: C.gray200, borderRadius: 10 },
  modalCloseFullText: { fontSize: 13, fontWeight: '700', color: C.gray700 },
});
