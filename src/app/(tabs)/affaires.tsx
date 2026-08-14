/**
 * src/app/(tabs)/affaires.tsx
 * Liste des Affaires & Dossiers du Cabinet.
 * Design 2026 : Thème adaptatif (dark/light), Skeleton Loader, Cartes interactives.
 */

import { AppColors as C } from '@/constants/theme';
import { useDossiers } from '@/hooks/useDossiers';
import { deleteDossier, Dossier, DossierStatut } from '@/services/dossiers.service';
import { hasDossierAccess } from '@/services/dossierInvitations.service';
import { extractErrorMessage } from '@/lib/api';
import { useTheme } from '@/hooks/useTheme';
import { SkeletonList } from '@/components/ui/SkeletonLoader';
import { useRouter } from 'expo-router';
import { AlertCircle, Briefcase, ChevronRight, Plus, Search, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet,
  Text, TextInput, TouchableOpacity, View, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const STATUT_MAP: Record<DossierStatut, { label: string; bg: string; text: string }> = {
  'Ouvert':    { label: 'Ouvert',    bg: 'rgba(59,130,246,0.15)',  text: '#3b82f6' },
  'En cours':  { label: 'En cours',  bg: 'rgba(249,115,22,0.15)', text: '#f97316' },
  'Cloture':   { label: 'Clôturé',   bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' },
};

const FILTRES: Array<{ value: 'all' | DossierStatut; label: string }> = [
  { value: 'all',       label: 'Toutes les affaires' },
  { value: 'Ouvert',    label: 'Ouvertes' },
  { value: 'En cours',  label: 'En cours' },
  { value: 'Cloture',   label: 'Clôturées' },
];

const fmt = (d: string) => {
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));
  } catch {
    return d;
  }
};

export default function AffairesScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [search, setSearch] = useState('');
  const [selectedStatut, setSelectedStatut] = useState<'all' | DossierStatut>('all');

  const { dossiers, isLoading, isLoadingMore, error, refetch, loadMore } =
    useDossiers({
      statut: selectedStatut !== 'all' ? selectedStatut : undefined,
    });

  const accessibleDossiers = dossiers.filter(d => hasDossierAccess(Number(d.id)));

  const filtered = search.trim()
    ? accessibleDossiers.filter(d => {
        const q = search.toLowerCase();
        return d.titre.toLowerCase().includes(q) || d.numeroAffaire.toLowerCase().includes(q);
      })
    : accessibleDossiers;

  const handleStatutChange = useCallback((val: 'all' | DossierStatut) => {
    setSelectedStatut(val);
    setSearch('');
  }, []);

  const renderItem = useCallback(({ item: d }: { item: Dossier }) => {
    const stat = STATUT_MAP[d.statut] ?? { label: d.statut, bg: 'rgba(148,163,184,0.15)', text: colors.textMuted };
    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => router.push({ pathname: '/affaire/[id]', params: { id: d.id } })}
        activeOpacity={0.85}
      >
        <View style={s.cardMain}>
          <View style={s.cardTopRow}>
            <Text style={[s.numAffaire, { color: colors.primary }]}>{d.numeroAffaire}</Text>
            <View style={[s.badge, { backgroundColor: stat.bg }]}>
              <Text style={[s.badgeText, { color: stat.text }]}>{stat.label}</Text>
            </View>
          </View>
          <Text style={[s.titreAffaire, { color: colors.text }]} numberOfLines={2}>{d.titre}</Text>
          {d.juridiction ? (
            <Text style={[s.juridictionText, { color: colors.textMuted }]} numberOfLines={1}>{d.juridiction}</Text>
          ) : null}
          <View style={s.cardFooter}>
            <Text style={[s.dateText, { color: colors.textMuted }]}>Ouvert le {fmt(d.dateOuverture)}</Text>
          </View>
        </View>
        <ChevronRight color={colors.textMuted} size={18} style={s.arrow} />
      </TouchableOpacity>
    );
  }, [router, colors]);

  const K = colors;

  return (
    <View style={[s.root, { backgroundColor: K.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={{ backgroundColor: K.surface }} edges={['top']}>
        {/* Header */}
        <View style={[s.header, { backgroundColor: K.surface }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: K.text }]}>Affaires & Dossiers</Text>
            <Text style={[s.subtitle, { color: K.primary }]}>
              {accessibleDossiers.length > 0 ? `${accessibleDossiers.length} affaire(s) enregistrée(s)` : 'Gestion du contentieux'}
            </Text>
          </View>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => router.push('/nouvelle-affaire')}
            activeOpacity={0.8}
          >
            <Plus color={C.gray900} size={16} />
            <Text style={s.addBtnText}>Nouvelle affaire</Text>
          </TouchableOpacity>
        </View>

        {/* Barre de Recherche */}
        <View style={[s.searchWrap, { backgroundColor: K.surface }]}>
          <View style={[s.searchBox, { backgroundColor: K.inputBg, borderColor: K.inputBorder }]}>
            <Search color={K.textMuted} size={16} />
            <TextInput
              style={[s.searchInput, { color: K.inputText }]}
              placeholder="Rechercher par titre ou numéro..."
              placeholderTextColor={K.inputPlaceholder}
              value={search}
              onChangeText={setSearch}
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        {/* Filtres Statut Chips */}
        <View style={[s.filtresWrap, { backgroundColor: K.surface, borderBottomColor: K.border }]}>
          <FlatList
            horizontal
            data={FILTRES}
            keyExtractor={item => item.value}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filtresList}
            renderItem={({ item }) => {
              const active = selectedStatut === item.value;
              return (
                <TouchableOpacity
                  style={[
                    s.chip,
                    {
                      backgroundColor: active ? K.primaryLight : K.bgSecondary,
                      borderColor: active ? K.primary : K.border,
                    },
                  ]}
                  onPress={() => handleStatutChange(item.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.chipText, { color: active ? K.primary : K.textMuted, fontWeight: active ? '700' : '500' }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </SafeAreaView>

      {/* Contenu Liste */}
      {error ? (
        <View style={s.center}>
          <AlertCircle color={K.danger} size={36} />
          <Text style={[s.errorTitle, { color: K.text }]}>Erreur de chargement</Text>
          <Text style={[s.errorSub, { color: K.danger }]}>{error}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={refetch}>
            <Text style={s.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : isLoading && dossiers.length === 0 ? (
        <SkeletonList count={5} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={s.listContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={isLoading && dossiers.length > 0}
              onRefresh={refetch}
              tintColor={C.amber500}
            />
          }
          ListEmptyComponent={
            <View style={s.center}>
              <Briefcase color={K.textMuted} size={48} />
              <Text style={[s.emptyTitle, { color: K.text }]}>Aucune affaire trouvée</Text>
              <Text style={[s.emptySub, { color: K.textMuted }]}>
                {search ? 'Modifiez vos critères de recherche.' : 'Créez une première affaire dans le cabinet.'}
              </Text>
              {!search && (
                <TouchableOpacity
                  style={s.emptyAddBtn}
                  onPress={() => router.push('/nouvelle-affaire')}
                  activeOpacity={0.8}
                >
                  <Plus color={C.gray900} size={16} />
                  <Text style={s.emptyAddBtnText}>Créer un dossier</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          ListFooterComponent={
            isLoadingMore ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator color={C.amber500} />
              </View>
            ) : null
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => router.push('/nouvelle-affaire')}
        activeOpacity={0.85}
      >
        <Plus color={C.gray900} size={26} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10,
  },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2, fontWeight: '600' },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  filtresWrap: { paddingBottom: 12, borderBottomWidth: 1 },
  filtresList: { paddingHorizontal: 14, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5,
  },
  chipText: { fontSize: 12 },
  listContent: { padding: 14, paddingBottom: 100, gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, padding: 16, borderWidth: 1,
  },
  cardMain: { flex: 1, gap: 4 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numAffaire: { fontSize: 12, fontWeight: '700' },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  titreAffaire: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  juridictionText: { fontSize: 12 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  dateText: { fontSize: 11 },
  arrow: { marginLeft: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  errorTitle: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  errorSub: { fontSize: 13, textAlign: 'center' },
  retryBtn: { marginTop: 12, backgroundColor: C.amber500, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  retryText: { fontSize: 13, fontWeight: '700', color: C.gray900 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  emptySub: { fontSize: 13, textAlign: 'center' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.amber500, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  addBtnText: { fontSize: 12, fontWeight: '700', color: C.gray900 },
  fab: {
    position: 'absolute', bottom: 20, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.amber500,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.amber500, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 8,
    zIndex: 100,
  },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.amber500, borderRadius: 12,
    paddingHorizontal: 18, paddingVertical: 10, marginTop: 12,
  },
  emptyAddBtnText: { fontSize: 14, fontWeight: '700', color: C.gray900 },
});
