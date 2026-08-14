/**
 * src/app/(tabs)/clients.tsx
 * Liste & Fiches des Clients du Cabinet.
 * Design 2026 : Thème adaptatif (dark/light), Skeleton Loader, Modales adaptatives.
 */

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  Modal, ScrollView, Linking, ActivityIndicator, RefreshControl, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Search, Plus, Phone, Mail, MapPin, User,
  ChevronRight, X, AlertCircle, Trash2, Pencil,
} from 'lucide-react-native';
import { AppColors as C } from '@/constants/theme';
import { useClients } from '@/hooks/useClients';
import { useDossiers } from '@/hooks/useDossiers';
import { hasDossierAccess, hasClientAccess } from '@/services/dossierInvitations.service';
import { Client, deleteClient, updateClient } from '@/services/clients.service';
import { extractErrorMessage } from '@/lib/api';
import { useTheme } from '@/hooks/useTheme';
import { SkeletonList } from '@/components/ui/SkeletonLoader';
import { useToast } from '@/components/ui/Toast';

export default function ClientsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Client | null>(null);

  // Édit client states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editNom, setEditNom]             = useState('');
  const [editTel, setEditTel]             = useState('');
  const [editEmail, setEditEmail]         = useState('');
  const [updatingClient, setUpdatingClient] = useState(false);

  const { clients, isLoading, error, total, refetch } = useClients({
    search: search.trim() ? search.trim() : undefined,
  });

  const { dossiers } = useDossiers({ pageSize: 100 });
  const userDossierClientIds = dossiers
    .filter(d => hasDossierAccess(Number(d.id)))
    .map(d => Number(d.clientId));

  const userClients = clients.filter(c => hasClientAccess(Number(c.id), userDossierClientIds));

  const initials = (c: Client) => {
    const parts = c.nomComplet.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return c.nomComplet.slice(0, 2).toUpperCase() || '?';
  };

  const handleDeleteClient = (c: Client) => {
    Alert.alert(
      'Supprimer le client',
      `Êtes-vous sûr de vouloir supprimer définitivement le client "${c.nomComplet}" ? Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteClient(Number(c.id));
              setSelected(null);
              refetch();
              showToast('success', 'Client supprimé', `Le client "${c.nomComplet}" a été supprimé.`);
            } catch (e) {
              showToast('error', 'Erreur', extractErrorMessage(e));
            }
          },
        },
      ]
    );
  };

  const handleOpenEditModal = (c: Client) => {
    setEditNom(c.nomComplet);
    setEditTel(c.telephone || '');
    setEditEmail(c.email || '');
    setShowEditModal(true);
  };

  const handleUpdateClient = async () => {
    if (!selected) return;
    if (!editNom.trim()) {
      showToast('warning', 'Champ requis', 'Le nom du client est obligatoire.');
      return;
    }
    setUpdatingClient(true);
    try {
      await updateClient(Number(selected.id), {
        nomComplet: editNom.trim(),
        telephone: editTel.trim() || undefined,
        email: editEmail.trim() || undefined,
      });
      setShowEditModal(false);
      setSelected(null);
      refetch();
      showToast('success', 'Client mis à jour', 'Informations du client modifiées avec succès.');
    } catch (e) {
      showToast('error', 'Erreur', extractErrorMessage(e));
    } finally {
      setUpdatingClient(false);
    }
  };

  const K = colors;

  return (
    <View style={[s.root, { backgroundColor: K.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: K.surface }}>
        {/* Header */}
        <View style={[s.header, { backgroundColor: K.surface }]}>
          <View>
            <Text style={[s.title, { color: K.text }]}>Clients</Text>
            <Text style={[s.sub, { color: K.primary }]}>
              {userClients.length} client{userClients.length > 1 ? 's' : ''} au total
            </Text>
          </View>
          <TouchableOpacity style={s.addBtn} onPress={() => router.push('/nouveau-client')} activeOpacity={0.8}>
            <Plus color={C.gray900} size={20} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[s.searchWrap, { backgroundColor: K.inputBg, borderColor: K.inputBorder }]}>
          <Search color={K.textMuted} size={18} />
          <TextInput
            style={[s.searchInput, { color: K.inputText }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher un client..."
            placeholderTextColor={K.inputPlaceholder}
          />
          {search !== '' && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <X color={K.textMuted} size={16} />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>

      {error && !isLoading && (
        <View style={[s.errorBanner, { backgroundColor: K.dangerLight, borderColor: K.danger }]}>
          <AlertCircle color={K.danger} size={16} />
          <Text style={[s.errorText, { color: K.danger }]}>{error}</Text>
          <TouchableOpacity onPress={refetch} style={[s.retryBtn, { backgroundColor: K.dangerLight }]}>
            <Text style={[s.retryText, { color: K.danger }]}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      {isLoading && userClients.length === 0 ? (
        <SkeletonList count={6} />
      ) : (
        <FlatList
          data={userClients}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isLoading && userClients.length > 0} onRefresh={refetch} tintColor={C.amber500} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={[s.emptyText, { color: K.textMuted }]}>Aucun client trouvé dans la base de données</Text>
            </View>
          }
          renderItem={({ item: c }) => (
            <TouchableOpacity
              style={[s.card, { backgroundColor: K.surface, borderColor: K.border }]}
              onPress={() => setSelected(c)}
              activeOpacity={0.8}
            >
              <View style={[s.avatar, { backgroundColor: C.amber500 }]}>
                <Text style={s.avatarText}>{initials(c)}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Text style={[s.clientName, { color: K.text }]} numberOfLines={1}>{c.nomComplet}</Text>
                  <User color={K.primary} size={13} />
                </View>
                {c.email ? <Text style={[s.clientEmail, { color: K.textMuted }]} numberOfLines={1}>{c.email}</Text> : null}
                {c.telephone ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Phone color={K.textMuted} size={11} />
                    <Text style={[s.clientMeta, { color: K.textMuted }]}>{c.telephone}</Text>
                  </View>
                ) : null}
              </View>
              <ChevronRight color={K.textMuted} size={18} />
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity style={s.fab} onPress={() => router.push('/nouveau-client')} activeOpacity={0.85}>
        <Plus color={C.gray900} size={28} />
      </TouchableOpacity>

      {/* Detail Modal */}
      <Modal visible={selected !== null} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <TouchableOpacity style={s.modalOverlay} onPress={() => setSelected(null)} activeOpacity={1}>
          <TouchableOpacity style={[s.sheet, { backgroundColor: K.surface }]} activeOpacity={1} onPress={() => {}}>
            <View style={[s.sheetHandle, { backgroundColor: K.border }]} />
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Avatar + Name */}
                <View style={s.sheetHeader}>
                  <View style={[s.avatarLg, { backgroundColor: C.amber500 }]}>
                    <Text style={s.avatarLgText}>{initials(selected)}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[s.sheetName, { color: K.text }]}>{selected.nomComplet}</Text>
                  </View>
                </View>

                {/* Contact */}
                <View style={[s.contactBox, { backgroundColor: K.bgSecondary }]}>
                  {selected.telephone ? (
                    <TouchableOpacity style={s.contactRow} onPress={() => Linking.openURL(`tel:${selected.telephone}`)}>
                      <Phone color={K.primary} size={16} />
                      <Text style={[s.contactLink, { color: K.primary }]}>{selected.telephone}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {selected.email ? (
                    <TouchableOpacity style={s.contactRow} onPress={() => Linking.openURL(`mailto:${selected.email}`)}>
                      <Mail color={K.primary} size={16} />
                      <Text style={[s.contactLink, { color: K.primary, flex: 1 }]} numberOfLines={1}>{selected.email}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Actions */}
                <View style={{ marginTop: 12, gap: 10 }}>
                  <TouchableOpacity
                    style={[s.editBtn, { backgroundColor: K.primaryLight, borderColor: K.primary }]}
                    onPress={() => handleOpenEditModal(selected)}
                    activeOpacity={0.8}
                  >
                    <Pencil color={K.primary} size={18} />
                    <Text style={[s.editBtnText, { color: K.primary }]}>Modifier les informations</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[s.deleteBtn, { backgroundColor: K.dangerLight, borderColor: K.danger }]}
                    onPress={() => handleDeleteClient(selected)}
                    activeOpacity={0.8}
                  >
                    <Trash2 color={K.danger} size={18} />
                    <Text style={[s.deleteBtnText, { color: K.danger }]}>Supprimer ce client</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={[s.closeBtn, { borderColor: K.border }]} onPress={() => setSelected(null)} activeOpacity={0.8}>
                    <Text style={[s.closeBtnText, { color: K.textMuted }]}>Fermer</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Modal Édition Client */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <TouchableOpacity style={s.modalOverlay} onPress={() => setShowEditModal(false)} activeOpacity={1}>
          <TouchableOpacity style={[s.sheet, { backgroundColor: K.surface }]} activeOpacity={1} onPress={() => {}}>
            <View style={[s.sheetHandle, { backgroundColor: K.border }]} />
            <Text style={[s.modalTitle, { color: K.text }]}>Modifier le client</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ marginBottom: 12 }}>
                <Text style={[s.inputLabel, { color: K.textSecondary }]}>Nom complet *</Text>
                <TextInput
                  style={[s.modalInput, { backgroundColor: K.inputBg, borderColor: K.inputBorder, color: K.inputText }]}
                  value={editNom}
                  onChangeText={setEditNom}
                  placeholder="Nom et Prénom du client"
                  placeholderTextColor={K.inputPlaceholder}
                />
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={[s.inputLabel, { color: K.textSecondary }]}>Téléphone</Text>
                <TextInput
                  style={[s.modalInput, { backgroundColor: K.inputBg, borderColor: K.inputBorder, color: K.inputText }]}
                  value={editTel}
                  onChangeText={setEditTel}
                  keyboardType="phone-pad"
                  placeholder="+237 6..."
                  placeholderTextColor={K.inputPlaceholder}
                />
              </View>

              <View style={{ marginBottom: 16 }}>
                <Text style={[s.inputLabel, { color: K.textSecondary }]}>Adresse Email</Text>
                <TextInput
                  style={[s.modalInput, { backgroundColor: K.inputBg, borderColor: K.inputBorder, color: K.inputText }]}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="client@domaine.com"
                  placeholderTextColor={K.inputPlaceholder}
                />
              </View>

              <TouchableOpacity
                style={[s.saveBtn, updatingClient && { opacity: 0.6 }]}
                onPress={handleUpdateClient}
                disabled={updatingClient}
                activeOpacity={0.85}
              >
                {updatingClient ? <ActivityIndicator color={C.gray900} /> : <Text style={s.saveBtnText}>Enregistrer les modifications</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={[s.cancelBtn, { borderColor: K.border }]} onPress={() => setShowEditModal(false)} activeOpacity={0.8}>
                <Text style={[s.cancelBtnText, { color: K.textMuted }]}>Annuler</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 2, fontWeight: '600' },
  addBtn: { width: 38, height: 38, backgroundColor: C.amber500, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 14, marginHorizontal: 16, paddingHorizontal: 12, marginBottom: 12, height: 46,
  },
  searchInput: { flex: 1, fontSize: 14 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, padding: 12,
    borderRadius: 12, borderWidth: 1,
  },
  errorText: { flex: 1, fontSize: 13 },
  retryBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  retryText: { fontSize: 12, fontWeight: '600' },
  list: { padding: 14, paddingBottom: 100, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14 },
  card: {
    borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.gray900, fontWeight: '800', fontSize: 16 },
  clientName: { fontSize: 15, fontWeight: '700' },
  clientEmail: { fontSize: 12 },
  clientMeta: { fontSize: 12 },
  fab: {
    position: 'absolute', bottom: 20, right: 20,
    width: 56, height: 56, backgroundColor: C.amber500, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.amber500, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 8,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', padding: 20 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatarLg: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarLgText: { color: C.gray900, fontWeight: '800', fontSize: 22 },
  sheetName: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  contactBox: { borderRadius: 14, padding: 14, marginBottom: 16, gap: 12 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  contactLink: { fontSize: 14, fontWeight: '600' },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 14 },
  editBtnText: { fontSize: 14, fontWeight: '700' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 14 },
  deleteBtnText: { fontSize: 14, fontWeight: '700' },
  closeBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  closeBtnText: { fontSize: 14, fontWeight: '500' },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  saveBtn: { backgroundColor: C.amber500, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: C.gray900 },
  cancelBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  cancelBtnText: { fontSize: 14, fontWeight: '500' },
});
