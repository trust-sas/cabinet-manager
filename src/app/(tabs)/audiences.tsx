/**
 * src/app/(tabs)/audiences.tsx
 * Écran principal : CALENDRIER HEBDOMADAIRE (Scrollable)
 *
 * Fonctionnalités :
 * 1. Vue calendrier hebdomadaire scrollable (Semaine courante, précédente, suivante, retour "Aujourd'hui").
 * 2. Sélection d'une date pour voir les événements / audiences du jour.
 * 3. Code Couleur Strict :
 *    - AUDIENCES = JAUNE (Amber/Yellow)
 *    - ÉVÉNEMENTS IMPORTANTS = JAUNE (Amber/Yellow)
 *    - RDV Client = Bleu, RDV Associé = Violet, Réunion = Indigo, Convocation = Vert
 * 4. Création d'événements (Audience, RDV Client, RDV Associé, Réunion, Convocation) avec liaison Dossier.
 * 5. Synchronisation automatique avec les audiences créées dans les dossiers.
 */

import { AppColors as C } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAudiences } from '@/hooks/useAudiences';
import { useDossiers } from '@/hooks/useDossiers';
import { extractErrorMessage } from '@/lib/api';
import { Audience } from '@/services/audiences.service';
import { hasDossierAccess, hasAudienceAccess, ajouterAccèsAudience } from '@/services/dossierInvitations.service';
import { DateTimePickerModal } from '@/components/DateTimePickerModal';
import { useRouter } from 'expo-router';
import {
  AlertCircle, Briefcase, Calendar, ChevronLeft, ChevronRight,
  Clock, MapPin, Plus, Star, Users, X,
} from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, RefreshControl,
  ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type EventCategory = 'Audience' | 'RDV Client' | 'RDV Associé' | 'Réunion' | 'Convocation';

const CATEGORIES: { id: EventCategory; label: string; icon: string }[] = [
  { id: 'Audience',     label: 'Audience',      icon: '⚖️' },
  { id: 'RDV Client',   label: 'RDV Client',    icon: '👤' },
  { id: 'RDV Associé',  label: 'RDV Associé',   icon: '🤝' },
  { id: 'Réunion',      label: 'Réunion',       icon: '💼' },
  { id: 'Convocation',  label: 'Convocation',   icon: '📜' },
];

// Helper formats de date
const toYYYYMMDD = (d: Date) => d.toISOString().slice(0, 10);

const DAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

export default function CalendrierScreen() {
  const router = useRouter();
  const { colors: K, isDark } = useTheme();

  // Date actuellement sélectionnée (par défaut aujourd'hui)
  const todayDate = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState<Date>(todayDate);
  const [weekOffset, setWeekOffset]     = useState<number>(0);

  // Modal d'ajout d'événement / audience
  const [showAddModal, setShowAddModal]   = useState(false);
  const [evtCategory, setEvtCategory]     = useState<EventCategory>('Audience');
  const [evtDateStr, setEvtDateStr]       = useState(toYYYYMMDD(todayDate));
  const [evtHeure, setEvtHeure]           = useState('09:00');
  const [evtTitre, setEvtTitre]           = useState('');
  const [evtDossierId, setEvtDossierId]   = useState<number | undefined>(undefined);
  const [evtLieu, setEvtLieu]             = useState('');
  const [evtNotes, setEvtNotes]           = useState('');
  const [evtImportant, setEvtImportant]   = useState(false);
  const [savingEvt, setSavingEvt]         = useState(false);
  const [showPicker, setShowPicker]       = useState(false);

  // Chargement des audiences & des dossiers
  const { audiences, isLoading, error, refetch, create: createAudience } = useAudiences({ lazy: false });
  const { dossiers } = useDossiers({ pageSize: 50 });

  // Données retournées et autorisées par le backend
  const userDossiers = dossiers;
  const userAudiences = audiences;

  // ── Calcul des 7 jours de la semaine affichée ─────────────────────────────
  const weekDays = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + weekOffset * 7);

    // Trouver le Lundi de cette semaine (1 = Lundi, 0 = Dimanche)
    const dayOfWeek = base.getDay();
    const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(base);
    monday.setDate(base.getDate() + distanceToMonday);

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return days;
  }, [weekOffset]);

  // Mois & Année affichés en haut de semaine
  const weekMonthYearLabel = useMemo(() => {
    if (weekDays.length === 0) return '';
    const first = weekDays[0];
    const last = weekDays[6];
    if (first.getMonth() === last.getMonth()) {
      return `${MONTHS_FR[first.getMonth()]} ${first.getFullYear()}`;
    }
    return `${MONTHS_FR[first.getMonth()]} - ${MONTHS_FR[last.getMonth()]} ${last.getFullYear()}`;
  }, [weekDays]);

  // Filtrage des événements pour la date sélectionnée
  const selectedDateStr = toYYYYMMDD(selectedDate);

  const eventsOnSelectedDate = useMemo(() => {
    return userAudiences.filter(a => {
      const aDateStr = new Date(a.dateAudience).toISOString().slice(0, 10);
      return aDateStr === selectedDateStr;
    }).sort((a, b) => (a.heure || '').localeCompare(b.heure || ''));
  }, [userAudiences, selectedDateStr]);

  // Map des dates ayant au moins un événement (pour les puces du calendrier)
  const eventsCountPerDate = useMemo(() => {
    const map: Record<string, number> = {};
    userAudiences.forEach(a => {
      const dStr = new Date(a.dateAudience).toISOString().slice(0, 10);
      map[dStr] = (map[dStr] || 0) + 1;
    });
    return map;
  }, [userAudiences]);

  // ── Handlers de création d'événement / audience ────────────────────────────

  const handleOpenAddModal = (initialDate?: Date) => {
    const d = initialDate || selectedDate;
    setEvtDateStr(toYYYYMMDD(d));
    setEvtHeure('09:00');
    setEvtCategory('Audience');
    setEvtTitre('');
    setEvtDossierId(userDossiers[0]?.id ? Number(userDossiers[0].id) : undefined);
    setEvtLieu('');
    setEvtNotes('');
    setEvtImportant(true); // Les audiences sont d'office des événements importants
    setShowAddModal(true);
  };

  const handleSaveEvent = async () => {
    if (!evtDateStr) {
      Alert.alert('Erreur', 'La date de l\'événement est obligatoire.');
      return;
    }
    const finalDossierId = Number(evtDossierId ?? userDossiers[0]?.id ?? 1);

    setSavingEvt(true);
    try {
      // Les audiences sont d'office des événements importants
      const isImportantFinal = evtImportant || evtCategory === 'Audience';

      let notesCombined = evtNotes.trim();
      if (isImportantFinal) {
        notesCombined = `[IMPORTANT] ${notesCombined}`;
      }

      const typeFinal = evtTitre.trim()
        ? `${evtCategory}: ${evtTitre.trim()}`
        : evtCategory;

      // Format ISO 8601 valide pour dateAudience
      const formattedDate = new Date(`${evtDateStr}T${evtHeure || '09:00'}:00.000Z`).toISOString();

      const created = await createAudience({
        dossierId: finalDossierId,
        dateAudience: formattedDate,
        heure: evtHeure || '09:00',
        typeAudience: typeFinal,
        juridiction: evtLieu.trim() || undefined,
        notes: notesCombined || undefined,
        statut: 'prevue',
      });
      if (created?.id) {
        ajouterAccèsAudience(Number(created.id));
      }

      setShowAddModal(false);
      refetch();
      Alert.alert('Succès', 'Événement ajouté au calendrier.');
    } catch (e) {
      Alert.alert('Erreur', extractErrorMessage(e));
    } finally {
      setSavingEvt(false);
    }
  };

  // ── Rendu d'une carte d'événement ─────────────────────────────────────────

  const renderEventItem = useCallback(({ item: a }: { item: Audience }) => {
    const isAudience = (a.typeAudience || '').toLowerCase().includes('audience') || !a.typeAudience;
    const isImportant = (a.notes || '').includes('[IMPORTANT]');
    const cleanNotes = (a.notes || '').replace('[IMPORTANT]', '').trim();

    // Règle de couleur stricte : Audiences ET Événements Importants en JAUNE (Amber)
    const isYellow = isAudience || isImportant;

    let badgeBg: string = C.blue100;
    let badgeText: string = C.blue700;
    let categoryLabel = a.typeAudience || 'Événement';

    if (isYellow) {
      badgeBg = C.amber100;
      badgeText = C.amber900;
    } else if (categoryLabel.includes('RDV Client')) {
      badgeBg = C.blue100; badgeText = C.blue700;
    } else if (categoryLabel.includes('RDV Associé')) {
      badgeBg = C.purple100; badgeText = C.purple600;
    } else if (categoryLabel.includes('Réunion')) {
      badgeBg = C.indigo100; badgeText = C.indigo600;
    } else if (categoryLabel.includes('Convocation')) {
      badgeBg = C.green100; badgeText = C.green700;
    }

    return (
      <TouchableOpacity
        style={[
          s.card,
          isYellow && s.cardYellow,
        ]}
        onPress={() => {
          if (a.dossierId) {
            router.push({ pathname: '/affaire/[id]', params: { id: a.dossierId } });
          }
        }}
        activeOpacity={0.8}
      >
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          {/* Box Heure */}
          <View style={[s.timeBox, isYellow && s.timeBoxYellow]}>
            <Clock color={isYellow ? C.amber900 : C.blue700} size={14} />
            <Text style={[s.timeText, isYellow && s.timeTextYellow]}>
              {a.heure || '09:00'}
            </Text>
          </View>

          {/* Contenu */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <View style={[s.catBadge, { backgroundColor: badgeBg }]}>
                <Text style={[s.catBadgeText, { color: badgeText }]}>{categoryLabel}</Text>
              </View>
              {isImportant && (
                <View style={s.importantPill}>
                  <Star color={C.amber900} size={10} fill={C.amber900} />
                  <Text style={s.importantPillText}>IMPORTANT</Text>
                </View>
              )}
            </View>

            {a.dossierId && (
              <Text style={s.evtDossierRef}>Dossier #{a.dossierId}</Text>
            )}

            {a.juridiction && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                <MapPin color={C.gray500} size={12} />
                <Text style={s.evtLieu} numberOfLines={1}>{a.juridiction}</Text>
              </View>
            )}

            {cleanNotes ? (
              <View style={[s.notesBox, isYellow && s.notesBoxYellow]}>
                <Text style={s.notesContent} numberOfLines={2}>{cleanNotes}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [router]);

  return (
    <View style={[s.root, { backgroundColor: K.bg }]}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: K.bgSecondary }}>

        {/* ── En-tête Principal ── */}
        <View style={s.header}>
          <View>
            <Text style={[s.title, { color: K.text }]}>Calendrier</Text>
            <Text style={s.sub}>{weekMonthYearLabel}</Text>
          </View>
          <TouchableOpacity style={s.addHeaderBtn} onPress={() => handleOpenAddModal()} activeOpacity={0.8}>
            <Plus color={isDark ? C.gray900 : '#ffffff'} size={18} />
            <Text style={s.addHeaderBtnText}>Ajouter</Text>
          </TouchableOpacity>
        </View>

        {/* ── Barre de Navigation Semaine ── */}
        <View style={s.weekNavRow}>
          <TouchableOpacity style={[s.navArrowBtn, { backgroundColor: K.bgTertiary }]} onPress={() => setWeekOffset(w => w - 1)}>
            <ChevronLeft color={K.primary} size={20} />
          </TouchableOpacity>

          <TouchableOpacity style={[s.todayBtn, { backgroundColor: K.bgTertiary, borderColor: K.border }]} onPress={() => { setWeekOffset(0); setSelectedDate(todayDate); }}>
            <Calendar color={K.primary} size={14} />
            <Text style={[s.todayBtnText, { color: K.primary }]}>Aujourd'hui</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.navArrowBtn, { backgroundColor: K.bgTertiary }]} onPress={() => setWeekOffset(w => w + 1)}>
            <ChevronRight color={K.primary} size={20} />
          </TouchableOpacity>
        </View>

        {/* ── Calendrier Hebdomadaire Scrollable (7 Jours) ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.weekStripContainer}
        >
          {weekDays.map(d => {
            const dStr = toYYYYMMDD(d);
            const isSelected = selectedDateStr === dStr;
            const isToday = toYYYYMMDD(todayDate) === dStr;
            const eventCount = eventsCountPerDate[dStr] || 0;

            return (
              <TouchableOpacity
                key={dStr}
                onPress={() => setSelectedDate(d)}
                style={[
                  s.dayCard,
                  { backgroundColor: K.surface, borderColor: K.border },
                  isSelected && s.dayCardSelected,
                  isToday && !isSelected && { borderColor: K.primary },
                ]}
                activeOpacity={0.85}
              >
                <Text style={[s.dayName, { color: K.textMuted }, isSelected ? s.dayNameSelected : isToday ? { color: K.primary, fontWeight: '700' } : null]}>
                  {DAYS_FR[d.getDay()]}
                </Text>
                <Text style={[s.dayNum, { color: K.text }, isSelected ? s.dayNumSelected : isToday ? { color: K.primary } : null]}>
                  {d.getDate()}
                </Text>

                {/* Indice d'événements */}
                {eventCount > 0 && (
                  <View style={[s.dotBadge, { backgroundColor: K.bgTertiary }, isSelected && s.dotBadgeSelected]}>
                    <Text style={[s.dotBadgeText, isSelected && s.dotBadgeTextSelected]}>
                      {eventCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      {/* ── Section Événements du Jour Sélectionné ── */}
      <View style={[s.selectedDayHeader, { backgroundColor: K.surface, borderBottomColor: K.border }]}>
        <Text style={[s.selectedDayTitle, { color: K.text }]}>
          {DAYS_FR[selectedDate.getDay()]} {selectedDate.getDate()} {MONTHS_FR[selectedDate.getMonth()]}
        </Text>
        <Text style={[s.selectedDayCount, { color: K.textMuted }]}>
          {eventsOnSelectedDate.length} événement(s)
        </Text>
      </View>

      {/* Message d'erreur */}
      {error && !isLoading && (
        <View style={s.errorBanner}>
          <AlertCircle color={C.red500} size={16} />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity onPress={refetch} style={s.retryBtn}>
            <Text style={s.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Liste des Événements */}
      <FlatList
        data={eventsOnSelectedDate}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading && audiences.length > 0} onRefresh={refetch} tintColor={C.amber500} />
        }
        ListEmptyComponent={
          isLoading
            ? <View style={s.center}><ActivityIndicator color={K.primary} size="large" /></View>
            : (
              <View style={s.center}>
                <Calendar color={K.textMuted} size={48} />
                <Text style={[s.emptyTitle, { color: K.text }]}>Aucun événement ce jour</Text>
                <Text style={[s.emptySub, { color: K.textMuted }]}>Planifiez une audience, un rendez-vous ou une réunion.</Text>
                <TouchableOpacity style={s.addEmptyBtn} onPress={() => handleOpenAddModal(selectedDate)}>
                  <Plus color={isDark ? C.gray900 : '#ffffff'} size={16} />
                  <Text style={s.addEmptyBtnText}>Ajouter un événement</Text>
                </TouchableOpacity>
              </View>
            )
        }
        renderItem={renderEventItem}
      />

      {/* FAB (Bouton Flottant) */}
      <TouchableOpacity style={s.fab} onPress={() => handleOpenAddModal(selectedDate)} activeOpacity={0.85}>
        <Plus color={isDark ? C.gray900 : '#ffffff'} size={28} />
      </TouchableOpacity>

      {/* ── MODAL CRÉATION ÉVÉNEMENT / AUDIENCE ── */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowAddModal(false)}>
          <KeyboardAvoidingView
            style={{ width: '100%', maxHeight: '90%' }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableOpacity style={[s.sheet, { backgroundColor: K.surface }]} activeOpacity={1} onPress={() => {}}>
              <View style={[s.sheetHandle, { backgroundColor: K.border }]} />
              <Text style={[s.sheetTitle, { color: K.text }]}>Ajouter au calendrier</Text>

              <ScrollView
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets={true}
                nestedScrollEnabled={true}
                contentContainerStyle={{ paddingBottom: 320 }}
              >

              {/* Sélection Catégorie */}
              <Text style={[s.fieldLabel, { color: K.text }]}>Type d'événement *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }} contentContainerStyle={{ gap: 8 }}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setEvtCategory(cat.id)}
                    style={[
                      s.catChip,
                      { backgroundColor: K.bgTertiary, borderColor: K.border },
                      evtCategory === cat.id && s.catChipActive,
                      evtCategory === cat.id && cat.id === 'Audience' && s.catChipYellow,
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text style={s.catChipIcon}>{cat.icon}</Text>
                    <Text style={[s.catChipText, { color: K.textSecondary }, evtCategory === cat.id && s.catChipTextActive]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Pop-up Sélecteur de Date & Heure */}
              <View style={{ marginBottom: 14 }}>
                <Text style={[s.fieldLabel, { color: K.text }]}>Date & Heure de l'événement *</Text>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    backgroundColor: K.primaryLight, borderWidth: 1.5, borderColor: K.primary,
                    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
                  }}
                  onPress={() => setShowPicker(true)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Calendar color={K.primary} size={18} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: K.text }}>
                      {evtDateStr || 'Choisir une date'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: K.surface, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: K.border }}>
                    <Clock color={K.primary} size={14} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: K.primary }}>
                      {evtHeure || '09:00'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Titre / Objet */}
              <View style={{ marginBottom: 12 }}>
                <Text style={[s.fieldLabel, { color: K.text }]}>Intitulé / Sujet de l'événement</Text>
                <TextInput
                  style={[s.fieldInput, { borderColor: K.border, color: K.text, backgroundColor: K.inputBg }]}
                  value={evtTitre}
                  onChangeText={setEvtTitre}
                  placeholder="ex: Plaidoirie, Entretien client, Signature..."
                  placeholderTextColor={K.textMuted}
                />
              </View>

              {/* Sélection Dossier */}
              {userDossiers.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={[s.fieldLabel, { color: K.text }]}>Lier à un dossier (Affaire)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {userDossiers.map(d => (
                      <TouchableOpacity
                        key={d.id}
                        onPress={() => setEvtDossierId(d.id)}
                        style={[s.dossierChip, { backgroundColor: K.bgTertiary, borderColor: K.border }, evtDossierId === d.id && s.dossierChipActive]}
                      >
                        <Text style={[s.dossierChipText, { color: K.textSecondary }, evtDossierId === d.id && s.dossierChipTextActive]}>
                          {d.numeroAffaire} — {d.titre}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Lieu / Juridiction */}
              <View style={{ marginBottom: 12 }}>
                <Text style={[s.fieldLabel, { color: K.text }]}>Lieu / Juridiction / Salle</Text>
                <TextInput
                  style={[s.fieldInput, { borderColor: K.border, color: K.text, backgroundColor: K.inputBg }]}
                  value={evtLieu}
                  onChangeText={setEvtLieu}
                  placeholder="ex: TGI de Yaoundé - Salle 2, Bureau Avocat..."
                  placeholderTextColor={K.textMuted}
                />
              </View>

              {/* Notes */}
              <View style={{ marginBottom: 12 }}>
                <Text style={[s.fieldLabel, { color: K.text }]}>Notes & Observations</Text>
                <TextInput
                  style={[s.fieldInput, { borderColor: K.border, color: K.text, backgroundColor: K.inputBg }, { height: 75, textAlignVertical: 'top' }]}
                  value={evtNotes}
                  onChangeText={setEvtNotes}
                  multiline
                  numberOfLines={3}
                  placeholder="Précisions supplémentaires..."
                  placeholderTextColor={K.textMuted}
                />
              </View>

              {/* Switch Marquer comme Important (Affiche en JAUNE) */}
              <View style={s.importantSwitchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.importantSwitchTitle}>⭐️ Marquer comme Important</Text>
                  <Text style={s.importantSwitchSub}>Sera mis en évidence en JAUNE sur le calendrier</Text>
                </View>
                <Switch
                  value={evtImportant}
                  onValueChange={setEvtImportant}
                  trackColor={{ false: C.gray300, true: C.amber500 }}
                  thumbColor={evtImportant ? C.amber600 : C.gray100}
                />
              </View>

              {/* Bouton de Sauvegarde */}
              <TouchableOpacity style={[s.saveBtn, savingEvt && { opacity: 0.6 }]} onPress={handleSaveEvent} disabled={savingEvt} activeOpacity={0.85}>
                {savingEvt ? <ActivityIndicator color={isDark ? C.gray900 : '#ffffff'} /> : <Text style={s.saveBtnText}>Enregistrer l'événement</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[s.cancelBtn, { borderColor: K.border }]} onPress={() => setShowAddModal(false)} activeOpacity={0.8}>
                <Text style={[s.cancelBtnText, { color: K.textMuted }]}>Annuler</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>

      {/* Pop-up Calendrier & Choix d'heure interactif (Date passée bloquée) */}
      <DateTimePickerModal
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        selectedDateStr={evtDateStr}
        selectedTimeStr={evtHeure}
        onSelectDate={setEvtDateStr}
        onSelectTime={setEvtHeure}
        minDateToday={true}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6,
  },
  title: { fontSize: 22, fontWeight: '700', color: C.white },
  sub: { fontSize: 13, color: C.amber400, marginTop: 2, fontWeight: '500' },
  addHeaderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.amber500, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
  },
  addHeaderBtnText: { fontSize: 13, fontWeight: '600', color: C.gray900 },
  weekNavRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  navArrowBtn: { padding: 6, backgroundColor: C.gray800, borderRadius: 8 },
  todayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.gray800, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    borderWidth: 1, borderColor: C.gray700,
  },
  todayBtnText: { fontSize: 12, color: C.amber400, fontWeight: '600' },
  weekStripContainer: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  dayCard: {
    width: 48, height: 64, borderRadius: 14,
    backgroundColor: C.gray800, borderWidth: 1, borderColor: C.gray700,
    alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  dayCardToday: { borderColor: C.amber400 },
  dayCardSelected: { backgroundColor: C.amber500, borderColor: C.amber500 },
  dayName: { fontSize: 11, fontWeight: '500', color: C.gray400 },
  dayNameToday: { color: C.amber400, fontWeight: '700' },
  dayNameSelected: { color: C.gray900, fontWeight: '700' },
  dayNum: { fontSize: 18, fontWeight: '700', color: C.white },
  dayNumToday: { color: C.amber400 },
  dayNumSelected: { color: C.gray900 },
  dotBadge: {
    backgroundColor: C.gray700, borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1, marginTop: 2,
  },
  dotBadgeSelected: { backgroundColor: C.gray900 },
  dotBadgeText: { fontSize: 9, fontWeight: '700', color: C.amber400 },
  dotBadgeTextSelected: { color: C.amber400 },
  selectedDayHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.white,
    borderBottomWidth: 1, borderBottomColor: C.gray200,
  },
  selectedDayTitle: { fontSize: 15, fontWeight: '700', color: C.gray900 },
  selectedDayCount: { fontSize: 12, fontWeight: '600', color: C.gray500 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, padding: 12,
    backgroundColor: C.red50, borderRadius: 12, borderWidth: 1, borderColor: C.red200,
  },
  errorText: { flex: 1, fontSize: 13, color: C.red700 },
  retryBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: C.red100, borderRadius: 8 },
  retryText: { fontSize: 12, color: C.red700, fontWeight: '600' },
  list: { padding: 12, paddingBottom: 100, gap: 10 },
  center: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: C.gray800 },
  emptySub: { fontSize: 13, color: C.gray500, textAlign: 'center', paddingHorizontal: 20 },
  addEmptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10,
    backgroundColor: C.amber500, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
  },
  addEmptyBtnText: { fontSize: 13, fontWeight: '600', color: C.gray900 },
  card: {
    backgroundColor: C.white, borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3, elevation: 2,
    borderLeftWidth: 4, borderLeftColor: C.blue500,
  },
  cardYellow: {
    backgroundColor: '#fffbeb', borderLeftColor: C.amber500, borderWidth: 1, borderColor: C.amber200,
  },
  timeBox: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.blue50, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8,
  },
  timeBoxYellow: { backgroundColor: C.amber100 },
  timeText: { fontSize: 12, fontWeight: '700', color: C.blue700 },
  timeTextYellow: { color: C.amber900 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  catBadgeText: { fontSize: 11, fontWeight: '700' },
  importantPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: C.amber200, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  importantPillText: { fontSize: 9, fontWeight: '800', color: C.amber900 },
  evtDossierRef: { fontSize: 12, fontWeight: '600', color: C.gray800, marginTop: 2 },
  evtLieu: { fontSize: 12, color: C.gray600 },
  notesBox: { backgroundColor: C.gray50, borderRadius: 8, padding: 8, marginTop: 6 },
  notesBoxYellow: { backgroundColor: '#fef3c7' },
  notesContent: { fontSize: 12, color: C.gray700 },
  fab: {
    position: 'absolute', bottom: 80, right: 20,
    width: 56, height: 56, backgroundColor: C.amber500, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.amber600, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', padding: 20 },
  sheetHandle: { width: 40, height: 4, backgroundColor: C.gray200, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: C.gray900, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: C.gray900, marginBottom: 6 },
  fieldInput: { borderWidth: 1, borderColor: C.gray200, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: C.gray900 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: C.gray100, borderWidth: 1, borderColor: C.gray200,
  },
  catChipActive: { backgroundColor: C.blue500, borderColor: C.blue500 },
  catChipYellow: { backgroundColor: C.amber500, borderColor: C.amber500 },
  catChipIcon: { fontSize: 14 },
  catChipText: { fontSize: 12, fontWeight: '500', color: C.gray700 },
  catChipTextActive: { color: C.gray900, fontWeight: '700' },
  dossierChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: C.gray100, borderWidth: 1, borderColor: C.gray200,
  },
  dossierChipActive: { backgroundColor: C.amber100, borderColor: C.amber400 },
  dossierChipText: { fontSize: 12, color: C.gray700 },
  dossierChipTextActive: { color: C.amber900, fontWeight: '700' },
  importantSwitchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.amber50, borderWidth: 1, borderColor: C.amber200,
    borderRadius: 12, padding: 12, marginBottom: 12,
  },
  importantSwitchTitle: { fontSize: 13, fontWeight: '700', color: C.amber900 },
  importantSwitchSub: { fontSize: 11, color: C.amber700, marginTop: 2 },
  saveBtn: { backgroundColor: C.amber500, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12, marginBottom: 10 },
  saveBtnText: { fontSize: 15, fontWeight: '600', color: C.gray900 },
  cancelBtn: { borderWidth: 1, borderColor: C.gray200, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '500', color: C.gray500 },
});
