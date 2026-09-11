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
import { AlertCircle, Briefcase, ChevronRight, Pin, Plus, Search, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, RefreshControl, SectionList, StyleSheet,
  Text, TextInput, TouchableOpacity, View, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PINNED_DOSSIERS_KEY = '@cabinet_pinned_dossiers';

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
  const [pinnedIds, setPinnedIds] = useState<number[]>([]);

  // Chargement des dossiers épinglés depuis le stockage local
  useEffect(() => {
    AsyncStorage.getItem(PINNED_DOSSIERS_KEY).then(val => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) setPinnedIds(parsed.map(Number));
        } catch {}
      }
    });
  }, []);

  const togglePin = useCallback(async (id: number) => {
    setPinnedIds(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [id, ...prev];
      AsyncStorage.setItem(PINNED_DOSSIERS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

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

  // Tri STRICTEMENT par ordre de création (le plus récent en premier)
  const getCreationTime = (d: Dossier) => new Date(d.createdAt || d.dateOuverture).getTime();

  const sortedFiltered = useMemo(() => {
    return [...filtered].sort((a, b) => getCreationTime(b) - getCreationTime(a));
  }, [filtered]);

  // Groupage des dossiers épinglés et des autres dossiers
  const sections = useMemo(() => {
    const pinned = sortedFiltered.filter(d => pinnedIds.includes(Number(d.id)));
    const others = sortedFiltered.filter(d => !pinnedIds.includes(Number(d.id)));

    const list: Array<{ title: string; data: Dossier[]; isPinned: boolean }> = [];
    if (pinned.length > 0) {
      list.push({ title: 'Dossiers épinglés', data: pinned, isPinned: true });
    }
    if (others.length > 0 || pinned.length === 0) {
      list.push({
        title: pinned.length > 0 ? 'Autres affaires' : 'Toutes les affaires',
        data: others,
        isPinned: false,
      });
    }
    return list;
  }, [sortedFiltered, pinnedIds]);

  const handleStatutChange = useCallback((val: 'all' | DossierStatut) => {
    setSelectedStatut(val);
    setSearch('');
  }, []);

  const renderItem = useCallback(({ item: d }: { item: Dossier }) => {
    const isPinned = pinnedIds.includes(Number(d.id));
    const stat = STATUT_MAP[d.statut] ?? { label: d.statut, bg: 'rgba(148,163,184,0.15)', text: colors.textMuted };
    return (
      <TouchableOpacity
        style={[
          s.card,
          { backgroundColor: colors.surface, borderColor: isPinned ? C.amber500 + '70' : colors.border },
          isPinned && { backgroundColor: isDark ? 'rgba(245,158,11,0.06)' : 'rgba(254,243,199,0.3)' },
        ]}
        onPress={() => router.push({ pathname: '/affaire/[id]', params: { id: d.id } })}
        onLongPress={() => togglePin(Number(d.id))}
        activeOpacity={0.85}
      >
        <View style={s.cardMain}>
          <View style={s.cardTopRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {isPinned && <Pin size={13} color={C.amber500} fill={C.amber500} />}
              <Text style={[s.numAffaire, { color: colors.primary }]}>{d.numeroAffaire}</Text>
            </View>
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
        <View style={{ alignItems: 'center', gap: 10, marginLeft: 8 }}>
          <TouchableOpacity
            style={[s.pinActionBtn, isPinned && s.pinActionBtnActive]}
            onPress={() => togglePin(Number(d.id))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Pin size={15} color={isPinned ? C.amber500 : colors.textMuted} fill={isPinned ? C.amber500 : 'transparent'} />
          </TouchableOpacity>
          <ChevronRight color={colors.textMuted} size={18} style={s.arrow} />
        </View>
      </TouchableOpacity>
    );
  }, [router, colors, pinnedIds, togglePin, isDark]);

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
        <SectionList
          sections={sections}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={s.listContent}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={[s.sectionHeaderWrap, { backgroundColor: K.bg }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {section.isPinned ? (
                  <Pin size={14} color={C.amber500} fill={C.amber500} />
                ) : null}
                <Text style={[s.sectionHeaderText, { color: section.isPinned ? C.amber500 : colors.textMuted }]}>
                  {section.title.toUpperCase()}
                </Text>
                <Text style={[s.sectionHeaderCount, { color: colors.textMuted }]}>
                  ({section.data.length})
                </Text>
              </View>
              <View style={[s.sectionHeaderLine, { backgroundColor: colors.border }]} />
            </View>
          )}
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
  arrow: { marginLeft: 2 },
  pinActionBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.1)',
  },
  pinActionBtnActive: {
    backgroundColor: 'rgba(245,158,11,0.15)',
  },
  sectionHeaderWrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 12, paddingBottom: 6, paddingHorizontal: 4,
  },
  sectionHeaderText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  sectionHeaderCount: { fontSize: 11, fontWeight: '600' },
  sectionHeaderLine: { flex: 1, height: 1, marginLeft: 10, opacity: 0.4 },
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
