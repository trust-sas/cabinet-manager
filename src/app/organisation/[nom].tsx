/**
 * src/app/organisation/[nom].tsx
 * Écran de détail d'une Organisation — style GitHub
 * Onglets : Dossiers / Clients / Membres / (Demandes si chef)
 */

import { AppColors as C } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import {
  ajouterMembre,
  demanderRejoindre,
  getOrganisationDetails,
  OrganisationDetails,
  OrgDossier,
  OrgClient,
  JoinRequest,
  OrganisationMembre,
  retirerDossier,
  retirerClient,
  supprimerMembre,
  traiterDemande,
  partagerDossier,
  partagerClient,
} from '@/services/organisations.service';
import { extractErrorMessage } from '@/lib/api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft, Briefcase, Building2, Calendar, CheckCircle2, Clock,
  FolderOpen, Lock, MoreVertical, RefreshCw, Shield, Trash2, UserMinus,
  UserPlus, Users, X, XCircle,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDossiers } from '@/hooks/useDossiers';

type OrgTab = 'dossiers' | 'clients' | 'membres' | 'demandes';

function initials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase();
}

function formatDate(dateStr?: string) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function OrganisationDetailScreen() {
  const { nom } = useLocalSearchParams<{ nom: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { colors: K, isDark } = useTheme();
  const { dossiers: mesDossiers } = useDossiers({ pageSize: 100 });

  const [org, setOrg] = useState<OrganisationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<OrgTab>('dossiers');

  // Modals
  const [showShareDossierModal, setShowShareDossierModal] = useState(false);
  const [showShareClientModal, setShowShareClientModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberInput, setAddMemberInput] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  const fetchOrg = useCallback(async () => {
    if (!nom) return;
    try {
      const data = await getOrganisationDetails(nom);
      setOrg(data);
    } catch (e: any) {
      Alert.alert('Erreur', extractErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [nom]);

  useEffect(() => { fetchOrg(); }, [fetchOrg]);

  const handleRejoindre = async () => {
    try {
      await demanderRejoindre(nom);
      Alert.alert(
        "Demande d'adhésion envoyée",
        `Vous avez fait une demande d'adhésion pour rejoindre l'organisation "${nom}". Une notification a été envoyée à l'administrateur.`,
      );
    } catch (e: any) {
      Alert.alert('Erreur', extractErrorMessage(e));
    }
  };

  const handleRetirerDossier = async (dossierId: number) => {
    Alert.alert('Retirer le dossier ?', 'Ce dossier ne sera plus visible dans l\'organisation.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await retirerDossier(nom, dossierId);
            fetchOrg();
          } catch (e: any) {
            Alert.alert('Erreur', extractErrorMessage(e));
          }
        },
      },
    ]);
  };

  const handleRetirerClient = async (clientId: number) => {
    Alert.alert('Retirer le client ?', 'Ce client ne sera plus partagé dans l\'organisation.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await retirerClient(nom, clientId);
            fetchOrg();
          } catch (e: any) {
            Alert.alert('Erreur', extractErrorMessage(e));
          }
        },
      },
    ]);
  };

  const handleSupprimerMembre = async (userId: number, nomMembre: string) => {
    Alert.alert(`Retirer ${nomMembre} ?`, 'Ce membre n\'aura plus accès à l\'organisation.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerMembre(nom, userId);
            fetchOrg();
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
      fetchOrg();
    } catch (e: any) {
      Alert.alert('Erreur', extractErrorMessage(e));
    }
  };

  const handleAddMember = async () => {
    if (!nom || !addMemberInput.trim()) {
      Alert.alert('Erreur', 'Veuillez saisir un e-mail ou numéro de téléphone.');
      return;
    }
    setAddingMember(true);
    try {
      await ajouterMembre(nom, { identifiant: addMemberInput.trim() });
      setAddMemberInput('');
      setShowAddMemberModal(false);
      fetchOrg();
      Alert.alert('✅ Succès', 'Membre ajouté à l\'organisation.');
    } catch (e: any) {
      Alert.alert('Erreur', extractErrorMessage(e));
    } finally {
      setAddingMember(false);
    }
  };

  const handlePartagerDossier = async (dossierId: number) => {
    try {
      await partagerDossier(nom, dossierId);
      setShowShareDossierModal(false);
      fetchOrg();
    } catch (e: any) {
      Alert.alert('Erreur', extractErrorMessage(e));
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: K.bg },
    header: {
      backgroundColor: K.surface,
      paddingHorizontal: 16, paddingBottom: 0,
      borderBottomWidth: 1, borderBottomColor: K.border,
    },
    headerTop: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
    backBtn: { padding: 4 },
    orgAvatar: {
      width: 44, height: 44, borderRadius: 10,
      backgroundColor: C.amber500 + '22',
      alignItems: 'center', justifyContent: 'center',
    },
    orgAvatarText: { fontSize: 16, fontWeight: '700', color: C.amber500 },
    headerInfo: { flex: 1 },
    orgName: { fontSize: 17, fontWeight: '700', color: K.text },
    orgDesc: { fontSize: 12, color: K.textMuted, marginTop: 1 },
    tabs: { flexDirection: 'row', gap: 2, marginTop: 8 },
    tab: {
      paddingHorizontal: 14, paddingVertical: 10,
      borderBottomWidth: 2, borderBottomColor: 'transparent',
    },
    tabActive: { borderBottomColor: C.amber500 },
    tabText: { fontSize: 13, fontWeight: '600', color: K.textMuted },
    tabTextActive: { color: C.amber500 },
    content: { flex: 1 },
    section: { padding: 16, gap: 10 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: K.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.amber500, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    addBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    card: {
      backgroundColor: K.surface, borderRadius: 12,
      borderWidth: 1, borderColor: K.border,
      padding: 14, gap: 6,
    },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardTitle: { fontSize: 14, fontWeight: '700', color: K.text, flex: 1 },
    cardSub: { fontSize: 12, color: K.textMuted, marginTop: 2 },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: C.amber500 + '22' },
    badgeText: { fontSize: 11, fontWeight: '700', color: C.amber500 },
    lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    lockText: { fontSize: 11, color: K.textMuted },
    actionRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
    actionBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: K.border, alignItems: 'center' },
    actionBtnDanger: { borderColor: '#ef4444' + '44', backgroundColor: '#ef4444' + '11' },
    actionBtnText: { fontSize: 12, fontWeight: '600', color: K.textMuted },
    actionBtnDangerText: { color: '#ef4444' },
    memberAvatar: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: C.amber500 + '22',
      alignItems: 'center', justifyContent: 'center',
    },
    memberAvatarText: { fontSize: 14, fontWeight: '700', color: C.amber500 },
    memberInfo: { flex: 1, marginLeft: 12 },
    memberName: { fontSize: 14, fontWeight: '600', color: K.text },
    memberEmail: { fontSize: 12, color: K.textMuted },
    rolePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    rolePillChef: { backgroundColor: C.amber500 + '22' },
    rolePillMembre: { backgroundColor: K.border },
    rolePillText: { fontSize: 11, fontWeight: '700', color: C.amber500 },
    rolePillTextMembre: { fontSize: 11, fontWeight: '600', color: K.textMuted },
    emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyText: { fontSize: 14, color: K.textMuted, textAlign: 'center' },
    joinBtn: {
      margin: 16, padding: 14, backgroundColor: C.amber500,
      borderRadius: 12, alignItems: 'center',
    },
    joinBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    statsRow: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 0 },
    statCard: {
      flex: 1, backgroundColor: K.surface, borderRadius: 10,
      borderWidth: 1, borderColor: K.border,
      padding: 12, alignItems: 'center', gap: 4,
    },
    statNum: { fontSize: 22, fontWeight: '800', color: K.text },
    statLabel: { fontSize: 11, color: K.textMuted, fontWeight: '500' },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: '#00000080', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: K.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
    modalTitle: { fontSize: 16, fontWeight: '700', color: K.text, marginBottom: 12 },
    modalItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: K.border, marginBottom: 8 },
    modalItemText: { flex: 1, fontSize: 13, fontWeight: '600', color: K.text, marginLeft: 10 },
    modalItemSub: { fontSize: 11, color: K.textMuted },
  });

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.amber500} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!org) return null;

  const isChef = org.role === 'chef';
  const isMembre = org.estMembre;

  const TABS: { id: OrgTab; label: string; count?: number }[] = [
    { id: 'dossiers', label: 'Dossiers', count: org.dossiers.length },
    { id: 'clients', label: 'Clients', count: org.clients.length },
    { id: 'membres', label: 'Membres', count: org.membres.length },
    ...(isChef && org.demandesEnAttente.length > 0
      ? [{ id: 'demandes' as OrgTab, label: 'Demandes', count: org.demandesEnAttente.length }]
      : []),
  ];

  const dossiersNonPartages = mesDossiers.filter(
    d => !org.dossiers.some(od => od.id === Number(d.id))
  );

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header style GitHub */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <ArrowLeft color={K.textMuted} size={22} />
          </TouchableOpacity>
          <View style={s.orgAvatar}>
            <Text style={s.orgAvatarText}>{initials(org.nom)}</Text>
          </View>
          <View style={s.headerInfo}>
            <Text style={s.orgName}>{org.nom}</Text>
            <Text style={s.orgDesc} numberOfLines={1}>
              {org.description || `Créée le ${formatDate(org.createdAt)}`}
            </Text>
          </View>
          <TouchableOpacity onPress={() => { setRefreshing(true); fetchOrg(); }}>
            <RefreshCw color={K.textMuted} size={18} />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={s.tabs}>
            {TABS.map(tab => (
              <TouchableOpacity
                key={tab.id}
                style={[s.tab, activeTab === tab.id && s.tabActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Text style={[s.tabText, activeTab === tab.id && s.tabTextActive]}>
                  {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Bouton rejoindre si non membre */}
      {!isMembre && (
        <TouchableOpacity style={s.joinBtn} onPress={handleRejoindre}>
          <Text style={s.joinBtnText}>Demander à rejoindre cette organisation</Text>
        </TouchableOpacity>
      )}

      {/* Stats */}
      {isMembre && (
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statNum}>{org.dossiers.length}</Text>
            <Text style={s.statLabel}>Dossiers</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{org.clients.length}</Text>
            <Text style={s.statLabel}>Clients</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{org.membres.length}</Text>
            <Text style={s.statLabel}>Membres</Text>
          </View>
        </View>
      )}

      <ScrollView
        style={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrg(); }} tintColor={C.amber500} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* ── Onglet Dossiers ── */}
        {activeTab === 'dossiers' && (
          <View style={s.section}>
            {isMembre && (
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Dossiers partagés</Text>
                {dossiersNonPartages.length > 0 && (
                  <TouchableOpacity style={s.addBtn} onPress={() => setShowShareDossierModal(true)}>
                    <UserPlus color="#fff" size={13} />
                    <Text style={s.addBtnText}>Partager</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {org.dossiers.length === 0 ? (
              <View style={s.emptyState}>
                <FolderOpen color={K.textMuted} size={32} />
                <Text style={s.emptyText}>Aucun dossier partagé dans cette organisation.</Text>
                {isMembre && <Text style={s.emptyText}>Partagez vos dossiers pour les rendre visibles aux membres.</Text>}
              </View>
            ) : (
              org.dossiers.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={s.card}
                  onPress={() => router.push({ pathname: '/affaire/[id]', params: { id: d.id } })}
                  activeOpacity={0.8}
                >
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle} numberOfLines={1}>{d.titre}</Text>
                    <View style={s.badge}><Text style={s.badgeText}>{d.statut}</Text></View>
                  </View>
                  <Text style={s.cardSub}>N° {d.numeroAffaire} · Partagé par {d.proprietaireNom}</Text>
                  {d.juridiction && <Text style={s.cardSub}>{d.juridiction}</Text>}

                  <View style={s.lockRow}>
                    <Lock color={K.textMuted} size={12} />
                    <Text style={s.lockText}>
                      {d.estProprietaire
                        ? 'Vous êtes propriétaire de ce dossier'
                        : `Partagé par ${d.proprietaireNom}`}
                    </Text>
                  </View>

                  {d.estProprietaire && (
                    <TouchableOpacity
                      style={[s.actionBtn, s.actionBtnDanger, { marginTop: 6 }]}
                      onPress={() => handleRetirerDossier(d.id)}
                    >
                      <Text style={s.actionBtnDangerText}>Retirer de l'organisation</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* ── Onglet Clients ── */}
        {activeTab === 'clients' && (
          <View style={s.section}>
            {isMembre && (
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Clients partagés</Text>
              </View>
            )}
            {org.clients.length === 0 ? (
              <View style={s.emptyState}>
                <Users color={K.textMuted} size={32} />
                <Text style={s.emptyText}>Aucun client partagé dans cette organisation.</Text>
              </View>
            ) : (
              org.clients.map((c) => (
                <View key={c.id} style={s.card}>
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle}>{c.nomComplet}</Text>
                    {c.estProprietaire && (
                      <TouchableOpacity onPress={() => handleRetirerClient(c.id)}>
                        <Trash2 color="#ef4444" size={16} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {c.telephone && <Text style={s.cardSub}>📞 {c.telephone}</Text>}
                  {c.email && <Text style={s.cardSub}>✉️ {c.email}</Text>}
                </View>
              ))
            )}
          </View>
        )}

        {/* ── Onglet Membres ── */}
        {activeTab === 'membres' && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>{org.membres.length} membre(s)</Text>
              {isChef && (
                <TouchableOpacity style={s.addBtn} onPress={() => setShowAddMemberModal(true)}>
                  <UserPlus color="#fff" size={13} />
                  <Text style={s.addBtnText}>Ajouter</Text>
                </TouchableOpacity>
              )}
            </View>
            {org.membres.map((m) => (
              <View key={m.userId} style={[s.card, { flexDirection: 'row', alignItems: 'center' }]}>
                <View style={s.memberAvatar}>
                  <Text style={s.memberAvatarText}>{initials(m.nom)}</Text>
                </View>
                <View style={s.memberInfo}>
                  <Text style={s.memberName}>{m.nom}</Text>
                  <Text style={s.memberEmail}>{m.email || m.telephone || 'N/A'}</Text>
                  <Text style={[s.memberEmail, { marginTop: 2 }]}>Depuis {formatDate(m.joinedAt)}</Text>
                </View>
                <View style={[s.rolePill, m.role === 'chef' ? s.rolePillChef : s.rolePillMembre]}>
                  <Text style={m.role === 'chef' ? s.rolePillText : s.rolePillTextMembre}>
                    {m.role === 'chef' ? 'Administrateur' : 'Membre'}
                  </Text>
                </View>
                {isChef && m.role !== 'chef' && (
                  <TouchableOpacity
                    style={{ marginLeft: 8, padding: 6 }}
                    onPress={() => handleSupprimerMembre(m.userId, m.nom)}
                  >
                    <UserMinus color="#ef4444" size={18} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {/* ── Onglet Demandes (chef only) ── */}
        {activeTab === 'demandes' && isChef && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Demandes d'adhésion</Text>
            {org.demandesEnAttente.length === 0 ? (
              <View style={s.emptyState}>
                <CheckCircle2 color={K.textMuted} size={32} />
                <Text style={s.emptyText}>Aucune demande en attente.</Text>
              </View>
            ) : (
              org.demandesEnAttente.map((req) => (
                <View key={req.id} style={s.card}>
                  <View style={s.cardRow}>
                    <Text style={s.cardTitle}>{req.user?.nom || req.user?.email || `User #${req.userId}`}</Text>
                    <Text style={s.cardSub}>{formatDate(req.createdAt)}</Text>
                  </View>
                  <View style={s.actionRow}>
                    <TouchableOpacity
                      style={[s.actionBtn, { backgroundColor: '#22c55e' + '22', borderColor: '#22c55e' + '44' }]}
                      onPress={() => handleTraiterDemande(req.id, 'accepted')}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#22c55e' }}>✓ Accepter</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, s.actionBtnDanger]}
                      onPress={() => handleTraiterDemande(req.id, 'rejected')}
                    >
                      <Text style={s.actionBtnDangerText}>✕ Refuser</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Modal — Partager un dossier */}
      <Modal visible={showShareDossierModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={s.modalTitle}>Partager un dossier</Text>
              <TouchableOpacity onPress={() => setShowShareDossierModal(false)}>
                <X color={K.textMuted} size={20} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {dossiersNonPartages.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={s.modalItem}
                  onPress={() => handlePartagerDossier(Number(d.id))}
                >
                  <Briefcase color={C.amber500} size={18} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={s.modalItemText}>{d.titre}</Text>
                    <Text style={s.modalItemSub}>N° {d.numeroAffaire} · {d.statut}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal — Ajouter un membre */}
      <Modal visible={showAddMemberModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={s.modalTitle}>Ajouter un membre</Text>
              <TouchableOpacity onPress={() => setShowAddMemberModal(false)}>
                <X color={K.textMuted} size={20} />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: K.textMuted, marginBottom: 8 }}>
              Entrez l'adresse e-mail ou le numéro de téléphone du membre :
            </Text>
            <View style={{ borderWidth: 1, borderColor: K.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 }}>
              <TextInput
                style={{ fontSize: 14, color: K.text }}
                placeholder="ex: collegue@cabinet.com"
                placeholderTextColor={K.textMuted}
                autoCapitalize="none"
                value={addMemberInput}
                onChangeText={setAddMemberInput}
              />
            </View>
            <TouchableOpacity
              style={[s.joinBtn, { marginTop: 4 }]}
              onPress={handleAddMember}
              disabled={addingMember}
            >
              {addingMember ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.joinBtnText}>Ajouter à l'organisation</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
