import { AppColors as C } from '@/constants/theme';
import { useAdminUsers } from '@/hooks/useAdminUsers';
import { UserProfile } from '@/services/users.service';
import { extractErrorMessage } from '@/lib/api';
import {
    AlertCircle,
    CheckCircle,
    ChevronRight, Lock,
    Mail,
    Search,
    Trash2,
    User,
    X,
    XCircle
} from 'lucide-react-native';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ROLE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  Administrateur: { label: 'Administrateur', color: '#dc2626', bg: '#fef2f2' },
  Associe:        { label: 'Associé',        color: '#7c3aed', bg: '#faf5ff' },
  Avocat:         { label: 'Avocat',          color: C.blue600, bg: C.blue50 },
  Assistant:      { label: 'Assistant',       color: C.green600, bg: C.green50 },
};

export default function UtilisateursScreen() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selected, setSelected] = useState<UserProfile | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const { users, isLoading, error, refetch, toggleActivation, deleteAccount } = useAdminUsers();

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const match = `${u.nom} ${u.email} ${u.role}`.toLowerCase().includes(q);
    return match && (roleFilter === 'all' || u.role === roleFilter);
  });

  const handleToggleActif = async (u: UserProfile) => {
    setIsUpdating(true);
    try {
      await toggleActivation(u.id, u.actif);
      const newStatus = !u.actif;
      Alert.alert(
        'Statut mis à jour',
        `Le compte de ${u.nom} est désormais ${newStatus ? 'ACTIF' : 'INACTIF'}.`
      );
      if (selected?.id === u.id) {
        setSelected((prev) => (prev ? { ...prev, actif: newStatus } : null));
      }
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de modifier le statut du compte.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = (u: UserProfile) => {
    Alert.alert(
      'Supprimer le compte',
      `Êtes-vous sûr de vouloir supprimer définitivement le compte de ${u.nom} (${u.email}) ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setIsUpdating(true);
            try {
              await deleteAccount(u.id);
              setSelected(null);
              Alert.alert('Compte supprimé', `Le compte de ${u.nom} a été supprimé.`);
            } catch (e) {
              Alert.alert('Erreur', extractErrorMessage(e) || 'Impossible de supprimer le compte.');
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ],
    );
  };

  const initials = (nom: string) => {
    const parts = nom.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return nom.slice(0, 2).toUpperCase() || '?';
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#1a0a0a' }}>
        <View style={s.header}>
          <View>
            <Text style={s.title}>Utilisateurs</Text>
            <Text style={s.sub}>
              {users.filter(u => u.actif).length} actif{users.filter(u => u.actif).length > 1 ? 's' : ''} · {users.length} total (Base de données)
            </Text>
          </View>
        </View>

        {/* Search */}
        <View style={s.searchWrap}>
          <Search color={C.gray400} size={16} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher par nom, email, rôle..."
            placeholderTextColor={C.gray500}
          />
          {search !== '' && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <X color={C.gray500} size={14} />
            </TouchableOpacity>
          )}
        </View>

        {/* Role filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersRow}>
          {([
            { key: 'all', label: `Tous (${users.length})` },
            { key: 'Administrateur', label: `Admin (${users.filter(u => u.role === 'Administrateur').length})` },
            { key: 'Avocat', label: `Avocats (${users.filter(u => u.role === 'Avocat').length})` },
            { key: 'Assistant', label: `Assistants (${users.filter(u => u.role === 'Assistant').length})` },
            { key: 'Associe', label: `Associés (${users.filter(u => u.role === 'Associe').length})` },
          ]).map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              onPress={() => setRoleFilter(key)}
              style={[s.filterBtn, roleFilter === key && s.filterBtnActive]}
              activeOpacity={0.8}
            >
              <Text style={[s.filterText, roleFilter === key && s.filterTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>

      {error && !isLoading && (
        <View style={s.errorBanner}>
          <AlertCircle color={C.red500} size={16} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={refetch} style={s.retryBtn}>
            <Text style={s.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={u => String(u.id)}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading && users.length > 0} onRefresh={refetch} tintColor={C.red500} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={s.empty}><ActivityIndicator color={C.red600} size="large" /></View>
          ) : (
            <View style={s.empty}>
              <Text style={s.emptyText}>Aucun utilisateur dans la base de données</Text>
            </View>
          )
        }
        renderItem={({ item: u }) => {
          const rc = ROLE_CFG[u.role] ?? { label: u.role, color: C.gray600, bg: C.gray100 };
          return (
            <TouchableOpacity style={[s.card, !u.actif && s.cardInactif]} onPress={() => setSelected(u)} activeOpacity={0.8}>
              <View style={s.cardLeft}>
                <View style={[s.avatar, { backgroundColor: rc.color }]}>
                  <Text style={s.avatarText}>{initials(u.nom)}</Text>
                </View>
                <View style={[s.activeDot, { backgroundColor: u.actif ? C.green500 : C.gray400 }]} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <View style={s.nameRow}>
                  <Text style={s.userName}>{u.nom}</Text>
                  {!u.actif && (
                    <View style={s.pendingBadge}>
                      <Text style={s.pendingText}>DÉSACTIVÉ</Text>
                    </View>
                  )}
                </View>
                <Text style={s.userEmail} numberOfLines={1}>{u.email}</Text>
                <View style={s.metaRow}>
                  <View style={[s.rolePill, { backgroundColor: rc.bg }]}>
                    <Text style={[s.rolePillText, { color: rc.color }]}>{rc.label}</Text>
                  </View>
                </View>
              </View>
              <ChevronRight color={C.gray300} size={16} />
            </TouchableOpacity>
          );
        }}
      />

      {/* Modal détail utilisateur */}
      <Modal visible={selected !== null} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <TouchableOpacity style={s.overlay} onPress={() => setSelected(null)} activeOpacity={1}>
          <TouchableOpacity style={s.sheet} activeOpacity={1} onPress={() => {}}>
            <View style={s.handle} />
            {selected && (() => {
              const rc = ROLE_CFG[selected.role] ?? { label: selected.role, color: C.gray600, bg: C.gray100 };
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Avatar + nom */}
                  <View style={s.sheetHeader}>
                    <View style={[s.avatarLg, { backgroundColor: rc.color }]}>
                      <Text style={s.avatarLgText}>{initials(selected.nom)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.sheetName}>{selected.nom}</Text>
                      <View style={[s.rolePill, { backgroundColor: rc.bg, alignSelf: 'flex-start' }]}>
                        <Text style={[s.rolePillText, { color: rc.color }]}>{rc.label}</Text>
                      </View>
                    </View>
                    <View style={[s.statusPill, selected.actif ? s.statusActive : s.statusInactive]}>
                      {selected.actif
                        ? <CheckCircle color={C.green600} size={13} />
                        : <XCircle color={C.gray500} size={13} />}
                      <Text style={[s.statusText, { color: selected.actif ? C.green600 : C.gray500 }]}>
                        {selected.actif ? 'Actif' : 'Désactivé'}
                      </Text>
                    </View>
                  </View>

                  {/* Infos */}
                  <View style={s.infoBox}>
                    <View style={s.infoRow}>
                      <Mail color={C.gray400} size={15} />
                      <Text style={s.infoText} numberOfLines={1}>{selected.email}</Text>
                    </View>
                    <View style={s.infoRow}>
                      <User color={C.gray400} size={15} />
                      <Text style={s.infoText}>Rôle : {selected.role}</Text>
                    </View>
                  </View>

                  {/* Actions : Désactivation / Activation + Suppression */}
                  <View style={{ marginTop: 8, paddingBottom: 20, gap: 10 }}>
                    {selected.actif ? (
                      <TouchableOpacity
                        style={[s.actionBtn, s.actionBtnWarning]}
                        onPress={() => handleToggleActif(selected)}
                        disabled={isUpdating}
                        activeOpacity={0.85}
                      >
                        {isUpdating ? (
                          <ActivityIndicator color={C.amber800} />
                        ) : (
                          <>
                            <Lock color={C.amber800} size={16} />
                            <Text style={s.actionBtnWarningText}>Désactiver le compte</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[s.actionBtn, s.actionBtnSuccess]}
                        onPress={() => handleToggleActif(selected)}
                        disabled={isUpdating}
                        activeOpacity={0.85}
                      >
                        {isUpdating ? (
                          <ActivityIndicator color={C.green700} />
                        ) : (
                          <>
                            <CheckCircle color={C.green700} size={16} />
                            <Text style={s.actionBtnSuccessText}>Réactiver le compte</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[s.actionBtn, s.actionBtnDanger]}
                      onPress={() => handleDelete(selected)}
                      disabled={isUpdating}
                      activeOpacity={0.85}
                    >
                      <Trash2 color={C.red700} size={16} />
                      <Text style={s.actionBtnDangerText}>Supprimer définitivement le compte</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={s.closeBtn} onPress={() => setSelected(null)} activeOpacity={0.8}>
                      <Text style={s.closeBtnText}>Fermer</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              );
            })()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16, paddingBottom: 10 },
  title: { fontSize: 22, fontWeight: '700', color: C.white },
  sub: { fontSize: 13, color: '#fca5a5', marginTop: 2 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, marginHorizontal: 14, marginBottom: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: C.white },
  filtersRow: { paddingHorizontal: 12, gap: 8, paddingBottom: 10 },
  filterBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.07)' },
  filterBtnActive: { backgroundColor: C.red600, borderColor: C.red600 },
  filterText: { fontSize: 12, fontWeight: '500', color: C.gray400 },
  filterTextActive: { color: C.white },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 12, padding: 12,
    backgroundColor: C.red50, borderRadius: 12, borderWidth: 1, borderColor: C.red200,
  },
  errorText: { flex: 1, fontSize: 13, color: C.red700 },
  retryBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: C.red100, borderRadius: 8 },
  retryText: { fontSize: 12, color: C.red700, fontWeight: '600' },
  list: { padding: 12, paddingBottom: 100, gap: 10 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 15, color: C.gray500 },
  card: { backgroundColor: C.white, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', shadowColor: C.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3, elevation: 2 },
  cardInactif: { borderLeftWidth: 4, borderLeftColor: C.amber500 },
  cardLeft: { position: 'relative' },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.white, fontWeight: '700', fontSize: 15 },
  activeDot: { position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: C.white },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  userName: { fontSize: 14, fontWeight: '600', color: C.gray900 },
  pendingBadge: { backgroundColor: C.amber100, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  pendingText: { fontSize: 10, color: C.amber800, fontWeight: '700' },
  userEmail: { fontSize: 12, color: C.gray500, marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rolePill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  rolePillText: { fontSize: 11, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', padding: 20 },
  handle: { width: 40, height: 4, backgroundColor: C.gray200, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  avatarLg: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  avatarLgText: { color: C.white, fontWeight: '700', fontSize: 20 },
  sheetName: { fontSize: 18, fontWeight: '700', color: C.gray900, marginBottom: 6 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  statusActive: { backgroundColor: C.green50 },
  statusInactive: { backgroundColor: C.amber50 },
  statusText: { fontSize: 12, fontWeight: '600' },
  infoBox: { backgroundColor: C.gray50, borderRadius: 14, padding: 14, gap: 10, marginBottom: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 13, color: C.gray700, flex: 1 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, marginBottom: 10 },
  actionBtnDanger: { backgroundColor: C.red50, borderWidth: 1, borderColor: C.red200 },
  actionBtnDangerText: { fontSize: 15, fontWeight: '600', color: C.red700 },
  actionBtnWarning: { backgroundColor: C.amber50, borderWidth: 1, borderColor: C.amber200 },
  actionBtnWarningText: { fontSize: 15, fontWeight: '600', color: C.amber800 },
  actionBtnSuccess: { backgroundColor: C.green50, borderWidth: 1, borderColor: C.green200 },
  actionBtnSuccessText: { fontSize: 15, fontWeight: '600', color: C.green700 },
  closeBtn: { borderWidth: 1, borderColor: C.gray200, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  closeBtnText: { fontSize: 14, fontWeight: '500', color: C.gray500 },
  disabledNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.gray50, borderWidth: 1, borderColor: C.gray200, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10 },
  disabledNoticeText: { fontSize: 14, color: C.gray500, fontWeight: '500' },
});
