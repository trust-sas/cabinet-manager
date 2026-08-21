/**
 * src/app/(tabs)/facturation.tsx
 * Écran de gestion de la facturation et des encaissements.
 * Inclus : Création de facture, suivi des retards, encaissements, envoi et téléchargement.
 */

import { AppColors as C } from '@/constants/theme';
import { useDossiers } from '@/hooks/useDossiers';
import { useFactures } from '@/hooks/useFactures';
import { extractErrorMessage } from '@/lib/api';
import {
  Facture, FactureStatut, getSoldeRestant, getTauxRecouvrement,
} from '@/services/facturation.service';
import { hasDossierAccess } from '@/services/dossierInvitations.service';
import { useRouter } from 'expo-router';
import {
  AlertTriangle, CheckCircle, Clock,
  DollarSign, FileText, Plus, Search, Send, X,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal,
  RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const STATUT_CFG: Record<FactureStatut, { label: string; bg: string; text: string; Icon: any }> = {
  brouillon: { label: 'Impayée',          bg: C.blue100,   text: C.blue700,   Icon: Clock },
  envoyee:   { label: 'Impayée',          bg: C.blue100,   text: C.blue700,   Icon: Clock },
  partielle: { label: 'Paiement partiel', bg: C.orange100, text: C.orange700, Icon: Clock },
  payee:     { label: 'Encaissée',        bg: C.green100,  text: C.green700,  Icon: CheckCircle },
  en_retard: { label: 'En retard',        bg: C.red100,    text: C.red700,    Icon: AlertTriangle },
};

const FILTER_ORDER: (FactureStatut | 'all')[] = ['all', 'envoyee', 'payee', 'en_retard', 'partielle'];

const fmtM = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';
const fmtD = (d: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));

export default function FacturationScreen() {
  const router = useRouter();
  const [search, setSearch]   = useState('');
  const [statut, setStatut]   = useState<FactureStatut | 'all'>('all');
  const [selected, setSelected] = useState<Facture | null>(null);

  // Modal Nouvelle Facture
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [factDossierId, setFactDossierId]     = useState<number | undefined>(undefined);
  const [factMontantHt, setFactMontantHt]     = useState('');
  const [factTva, setFactTva]                 = useState('19.25');
  const [factEcheance, setFactEcheance]       = useState('');
  const [factDesc, setFactDesc]               = useState('');
  const [creatingFact, setCreatingFact]       = useState(false);

  // Modal Édition Facture Sélectionnée
  const [editFactMontantHt, setEditFactMontantHt] = useState('');
  const [editFactTva, setEditFactTva]             = useState('19.25');
  const [editFactEcheance, setEditFactEcheance]   = useState('');
  const [editFactDesc, setEditFactDesc]           = useState('');
  const [editFactStatut, setEditFactStatut]       = useState<'payee' | 'envoyee'>('envoyee');
  const [savingEditFact, setSavingEditFact]       = useState(false);

  // Modal Encaissement
  const [encAmount, setEncAmount] = useState('');
  const [encMode, setEncMode]     = useState('virement');
  const [encRef, setEncRef]       = useState('');
  const [encaisseLoading, setEncaisseLoading] = useState(false);

  const {
    factures, isLoading, error, total,
    totalFacture, totalEncaisse, totalImpaye, tauxRecouvrement,
    refetch, create, update, envoyer, encaisser, supprimer,
  } = useFactures({ statut: statut !== 'all' ? statut : undefined });

  const { dossiers } = useDossiers({ pageSize: 50 });

  const userDossiers = dossiers.filter(d => hasDossierAccess(Number(d.id)));
  const userFactures = factures.filter(f => f.dossierId && hasDossierAccess(Number(f.dossierId)));

  const userTotalFacture  = userFactures.reduce((acc, f) => acc + Number(f.montantTtc || 0), 0);
  const userTotalEncaisse = userFactures.reduce((acc, f) => acc + Number(f.montantEncaisse || 0), 0);
  const userTotalImpaye   = Math.max(0, userTotalFacture - userTotalEncaisse);
  const userTaux          = userTotalFacture > 0 ? Math.round((userTotalEncaisse / userTotalFacture) * 100) : 0;

  const facturesRetard = userFactures.filter(f => f.statut === 'en_retard');

  const filtered = search.trim()
    ? userFactures.filter(f =>
        f.numeroFacture.toLowerCase().includes(search.toLowerCase()) ||
        (f.description ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : userFactures;

  const countByStatut = useCallback((s: FactureStatut) =>
    userFactures.filter(f => f.statut === s).length, [userFactures]);

  // Handlers Sélection / Édition Facture
  const handleSelectFacture = (f: Facture) => {
    setSelected(f);
    setEditFactMontantHt(String(f.montantHt));
    setEditFactTva(String(f.tauxTva));
    setEditFactEcheance(f.dateEcheance ? f.dateEcheance.slice(0, 10) : '');
    setEditFactDesc(f.description || '');
    setEditFactStatut(f.statut === 'payee' ? 'payee' : 'envoyee');
    setEncAmount(String(getSoldeRestant(f)));
  };

  const handleSaveEditFacture = async () => {
    if (!selected) return;
    const ht = Number(editFactMontantHt);
    if (isNaN(ht) || ht <= 0) {
      Alert.alert('Erreur', 'Veuillez saisir un montant Hors Taxe valide.');
      return;
    }
    setSavingEditFact(true);
    try {
      await update(selected.id, {
        montantHt: ht,
        tauxTva: Number(editFactTva) || 19.25,
        dateEcheance: editFactEcheance || undefined,
        description: editFactDesc.trim() || undefined,
        statut: editFactStatut,
      });
      setSelected(null);
      await refetch();
      Alert.alert('✅ Succès', 'Facture mise à jour avec succès.');
    } catch (e) {
      Alert.alert('Erreur', extractErrorMessage(e));
    } finally {
      setSavingEditFact(false);
    }
  };

  const handleToggleStatutDirect = async (f: Facture, target: 'payee' | 'envoyee') => {
    try {
      await update(f.id, { statut: target });
      setSelected(null);
      await refetch();
      Alert.alert('✅ Succès', target === 'payee' ? 'Facture marquée comme encaissée.' : 'Facture marquée comme impayée.');
    } catch (e) {
      Alert.alert('Erreur', extractErrorMessage(e));
    }
  };

  const handleDeleteFacture = (f: Facture) => {
    Alert.alert(
      'Supprimer la facture',
      `Voulez-vous supprimer définitivement la facture "${f.numeroFacture}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await supprimer(f.id);
              setSelected(null);
              await refetch();
              Alert.alert('✅ Succès', 'Facture supprimée.');
            } catch (e) {
              Alert.alert('Erreur', extractErrorMessage(e));
            }
          },
        },
      ],
    );
  };

  // Handlers Création Facture
  const handleOpenCreateModal = () => {
    if (userDossiers.length > 0) setFactDossierId(Number(userDossiers[0].id));
    setFactMontantHt('');
    setFactTva('19.25');
    const defaultEch = new Date();
    defaultEch.setDate(defaultEch.getDate() + 30);
    setFactEcheance(defaultEch.toISOString().slice(0, 10));
    setFactDesc('');
    setShowCreateModal(true);
  };

  const handleCreateFacture = async () => {
    if (!factMontantHt || isNaN(Number(factMontantHt)) || Number(factMontantHt) <= 0) {
      Alert.alert('Erreur', 'Veuillez saisir un montant Hors Taxe valide.');
      return;
    }
    const dossierSelected = userDossiers.find(d => Number(d.id) === Number(factDossierId));
    if (!dossierSelected) {
      Alert.alert('Erreur', 'Veuillez sélectionner un dossier.');
      return;
    }

    setCreatingFact(true);
    try {
      await create({
        dossierId: Number(dossierSelected.id),
        clientId: Number(dossierSelected.clientId),
        montantHt: Number(factMontantHt),
        tauxTva: Number(factTva) || 19.25,
        dateEcheance: factEcheance || undefined,
        description: factDesc.trim() || undefined,
      });

      setShowCreateModal(false);
      refetch();
      Alert.alert('Succès', 'Facture créée avec succès.');
    } catch (e) {
      Alert.alert('Erreur', extractErrorMessage(e));
    } finally {
      setCreatingFact(false);
    }
  };

  // Handlers Envoi & Encaissement
  const handleEnvoyer = async (f: Facture) => {
    try {
      await envoyer(f.id);
      setSelected(null);
      Alert.alert('Succès', `La facture ${f.numeroFacture} a été marquée comme envoyée.`);
    } catch (e) {
      Alert.alert('Erreur', extractErrorMessage(e));
    }
  };

  const handleEncaisser = async (f: Facture) => {
    const amt = Number(encAmount);
    if (!amt || amt <= 0) {
      Alert.alert('Erreur', 'Saisissez un montant valide.');
      return;
    }
    setEncaisseLoading(true);
    try {
      await encaisser(f.id, { montant: amt, modePaiement: encMode, reference: encRef || undefined });
      setSelected(null);
      setEncAmount(''); setEncRef('');
      Alert.alert('Succès', 'Encaissement enregistré avec succès.');
    } catch (e) {
      Alert.alert('Erreur', extractErrorMessage(e));
    } finally {
      setEncaisseLoading(false);
    }
  };

  const renderItem = useCallback(({ item: f }: { item: Facture }) => {
    const cfg   = STATUT_CFG[f.statut];
    const Icon  = cfg.Icon;
    const reste = getSoldeRestant(f);
    const pct   = getTauxRecouvrement(f);
    const borderColor =
      f.statut === 'en_retard' ? C.red500 :
      f.statut === 'payee'     ? C.green500 :
      f.statut === 'partielle' ? C.amber500 : C.gray200;

    return (
      <TouchableOpacity
        style={[s.card, { borderLeftColor: borderColor, borderLeftWidth: 4 }]}
        onPress={() => handleSelectFacture(f)}
        activeOpacity={0.85}
      >
        <View style={s.cardHeader}>
          <Text style={s.numFact}>{f.numeroFacture}</Text>
          <View style={[s.badge, { backgroundColor: cfg.bg }]}>
            <Icon color={cfg.text} size={11} />
            <Text style={[s.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
          </View>
        </View>

        {f.description ? <Text style={s.descText} numberOfLines={1}>{f.description}</Text> : null}

        <View style={s.amountsRow}>
          <View>
            <Text style={s.amtLabel}>Montant TTC</Text>
            <Text style={s.amtTtc}>{fmtM(Number(f.montantTtc))}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.amtLabel}>Reste dû</Text>
            <Text style={[s.amtReste, reste > 0 ? { color: C.red600 } : { color: C.green600 }]}>
              {fmtM(reste)}
            </Text>
          </View>
        </View>

        <View style={s.progressBg}>
          <View style={[s.progressFill, {
            width: `${pct}%` as any,
            backgroundColor: pct >= 80 ? C.green500 : pct >= 50 ? C.amber500 : C.red500,
          }]} />
        </View>
        <Text style={[s.dateText, { marginTop: 4 }]}>{pct}% encaissé</Text>
      </TouchableOpacity>
    );
  }, []);

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.navy900 }}>
        {/* Header Executive */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>Facturation</Text>
            <Text style={s.sub}>Honoraires et encaissements</Text>
          </View>
          <TouchableOpacity style={s.addBtn} onPress={handleOpenCreateModal} activeOpacity={0.8}>
            <Plus color={C.gray900} size={16} />
            <Text style={s.addBtnText}>Nouvelle facture</Text>
          </TouchableOpacity>
        </View>

        {/* KPIs */}
        <View style={s.kpiGrid}>
          {[
            { label: 'TOTAL FACTURÉ',     val: fmtM(userTotalFacture),  color: C.white },
            { label: 'ENCAISSÉ',          val: fmtM(userTotalEncaisse), color: C.green600 },
            { label: 'IMPAYÉ',            val: fmtM(userTotalImpaye),   color: C.orange600 },
            { label: 'RECOUVREMENT',      val: `${userTaux}%`,          color: C.amber400 },
          ].map(k => (
            <View key={k.label} style={s.kpiCard}>
              <Text style={s.kpiLabel}>{k.label}</Text>
              <Text style={[s.kpiVal, { color: k.color }]}>{k.val}</Text>
            </View>
          ))}
        </View>
      </SafeAreaView>

      {/* Search */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Search color={C.gray400} size={16} />
          <TextInput
            style={s.searchInput}
            placeholder="Rechercher par N° de facture ou description..."
            placeholderTextColor={C.gray400}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <X color={C.gray400} size={16} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
        {FILTER_ORDER.map(st => {
          const active = statut === st;
          const count  = st === 'all' ? userFactures.length : countByStatut(st);
          const label  = st === 'all' ? 'Toutes' : STATUT_CFG[st].label;
          return (
            <TouchableOpacity
              key={st}
              style={[s.filterChip, active && s.filterChipActive]}
              onPress={() => setStatut(st)}
              activeOpacity={0.8}
            >
              <Text style={[s.filterText, active && s.filterTextActive]}>
                {label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.amber500} />}
        ListEmptyComponent={
          !isLoading ? (
            <View style={s.center}>
              <DollarSign color={C.gray400} size={44} />
              <Text style={s.emptyText}>Aucune facture trouvée</Text>
            </View>
          ) : null
        }
      />

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={handleOpenCreateModal} activeOpacity={0.85}>
        <Plus color={C.gray900} size={28} />
      </TouchableOpacity>

      {/* ── MODAL NOUVELLE FACTURE ── */}
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setShowCreateModal(false)}>
          <TouchableOpacity style={s.sheet} activeOpacity={1} onPress={() => {}}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Nouvelle Facture</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.fieldLabel}>Dossier associé *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 6 }}>
                {userDossiers.map(d => (
                  <TouchableOpacity
                    key={d.id}
                    onPress={() => setFactDossierId(Number(d.id))}
                    style={[s.dossierChip, Number(factDossierId) === Number(d.id) && s.dossierChipActive]}
                  >
                    <Text style={[s.dossierChipText, Number(factDossierId) === Number(d.id) && s.dossierChipTextActive]}>
                      {d.numeroAffaire} — {d.titre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={s.fieldLabel}>Montant Hors Taxes (FCFA) *</Text>
              <TextInput style={s.fieldInput} value={factMontantHt} onChangeText={setFactMontantHt} keyboardType="numeric" placeholder="ex: 500000" />

              <Text style={s.fieldLabel}>Taux TVA (%)</Text>
              <TextInput style={s.fieldInput} value={factTva} onChangeText={setFactTva} keyboardType="numeric" placeholder="19.25" />

              <Text style={s.fieldLabel}>Date d'échéance (AAAA-MM-JJ)</Text>
              <TextInput style={s.fieldInput} value={factEcheance} onChangeText={setFactEcheance} placeholder="2026-10-15" />

              <Text style={s.fieldLabel}>Description</Text>
              <TextInput style={[s.fieldInput, { height: 75, textAlignVertical: 'top' }]} value={factDesc} onChangeText={setFactDesc} multiline numberOfLines={3} placeholder="ex: Honoraires de diligence..." />

              <TouchableOpacity style={[s.saveBtn, creatingFact && { opacity: 0.6 }]} onPress={handleCreateFacture} disabled={creatingFact}>
                {creatingFact ? <ActivityIndicator color={C.gray900} /> : <Text style={s.saveBtnText}>Créer la facture</Text>}
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── MODAL DÉTAILS / ÉDITION / ENCAISSEMENT ── */}
      {selected && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setSelected(null)}>
          <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setSelected(null)}>
            <TouchableOpacity style={[s.sheet, { maxHeight: '90%' }]} activeOpacity={1} onPress={() => {}}>
              <View style={s.handle} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <View>
                  <Text style={s.sheetTitle}>{selected.numeroFacture}</Text>
                  <Text style={s.sheetSub}>Dossier #{selected.dossierId}</Text>
                </View>
                <TouchableOpacity style={s.closeBtn} onPress={() => setSelected(null)}><X color={C.gray600} size={18} /></TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={s.fieldLabel}>Statut de la facture *</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  <TouchableOpacity style={[s.modeChip, { flex: 1, paddingVertical: 10 }, editFactStatut === 'envoyee' && s.modeChipActive]} onPress={() => setEditFactStatut('envoyee')}>
                    <Clock color={editFactStatut === 'envoyee' ? C.gray900 : C.gray500} size={16} /><Text style={[s.modeText, editFactStatut === 'envoyee' && s.modeTextActive]}> Impayée</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.modeChip, { flex: 1, paddingVertical: 10 }, editFactStatut === 'payee' && s.modeChipActive]} onPress={() => setEditFactStatut('payee')}>
                    <CheckCircle color={editFactStatut === 'payee' ? C.gray900 : C.gray500} size={16} /><Text style={[s.modeText, editFactStatut === 'payee' && s.modeTextActive]}> Encaissée</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.sheetAmtCard}>
                  <View style={s.sheetAmtRow}><Text style={s.sheetAmtLabel}>Montant HT :</Text><Text style={s.sheetAmtVal}>{fmtM(Number(selected.montantHt))}</Text></View>
                  <View style={s.sheetAmtRow}><Text style={s.sheetAmtLabel}>Reste dû :</Text><Text style={[s.sheetAmtVal, { fontWeight: '700', color: getSoldeRestant(selected) > 0 ? C.red600 : C.green600 }]}>{fmtM(getSoldeRestant(selected))}</Text></View>
                </View>

                <Text style={[s.fieldLabel, { marginTop: 10 }]}>Modifier les détails de la facture</Text>
                <TextInput style={s.fieldInput} value={editFactMontantHt} onChangeText={setEditFactMontantHt} keyboardType="numeric" placeholder="Montant HT" />
                <TextInput style={[s.fieldInput, { marginTop: 8 }]} value={editFactTva} onChangeText={setEditFactTva} keyboardType="numeric" placeholder="TVA %" />
                <TextInput style={[s.fieldInput, { marginTop: 8 }]} value={editFactEcheance} onChangeText={setEditFactEcheance} placeholder="AAAA-MM-JJ" />
                <TextInput style={[s.fieldInput, { marginTop: 8, height: 60 }]} value={editFactDesc} onChangeText={setEditFactDesc} multiline placeholder="Description..." />

                <TouchableOpacity style={[s.saveBtn, { marginTop: 8 }]} onPress={handleSaveEditFacture}>
                  {savingEditFact ? <ActivityIndicator color={C.gray900} /> : <Text style={s.saveBtnText}>Enregistrer modifications</Text>}
                </TouchableOpacity>

                {selected.statut !== 'payee' ? (
                  <TouchableOpacity style={[s.saveBtn, { backgroundColor: C.green600, marginTop: 8 }]} onPress={() => handleToggleStatutDirect(selected, 'payee')}>
                    <Text style={[s.saveBtnText, { color: C.white }]}>Marquer comme encaissée (100%)</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[s.saveBtn, { backgroundColor: C.blue600, marginTop: 8 }]} onPress={() => handleToggleStatutDirect(selected, 'envoyee')}>
                    <Text style={[s.saveBtnText, { color: C.white }]}>Marquer comme impayée</Text>
                  </TouchableOpacity>
                )}

                {getSoldeRestant(selected) > 0 && (
                  <View style={{ marginTop: 14 }}>
                    <Text style={s.encTitle}>Paiement partiel / Acompte</Text>
                    <TextInput style={s.fieldInput} placeholder="Montant (FCFA)" keyboardType="numeric" value={encAmount} onChangeText={setEncAmount} />
                    <View style={[s.modesRow, { marginVertical: 8 }]}>
                      {['virement', 'especes', 'cheque', 'mobile_money'].map(m => (
                        <TouchableOpacity key={m} style={[s.modeChip, encMode === m && s.modeChipActive]} onPress={() => setEncMode(m)}>
                          <Text style={[s.modeText, encMode === m && s.modeTextActive]}>{m.charAt(0).toUpperCase() + m.slice(1)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity style={s.saveBtn} onPress={() => handleEncaisser(selected)} disabled={encaisseLoading}>
                      {encaisseLoading ? <ActivityIndicator color={C.gray900} /> : <Text style={s.saveBtnText}>Valider l'acompte</Text>}
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity style={[s.saveBtn, { backgroundColor: '#fee2e2', marginTop: 14, borderWidth: 1, borderColor: '#fca5a5' }]} onPress={() => handleDeleteFacture(selected)}>
                  <Text style={{ color: '#991b1b', fontWeight: '700' }}>Supprimer la facture</Text>
                </TouchableOpacity>
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, backgroundColor: C.navy900,
  },
  title: { fontSize: 20, fontWeight: '700', color: C.white },
  sub: { fontSize: 12, color: C.amber400, marginTop: 2 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.amber500, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
  },
  addBtnText: { fontSize: 13, fontWeight: '600', color: C.gray900 },
  kpiGrid: { flexDirection: 'row', paddingHorizontal: 12, paddingBottom: 14, gap: 6, backgroundColor: C.navy900 },
  kpiCard: { flex: 1, backgroundColor: C.navy800, borderRadius: 10, padding: 8, borderWidth: 1, borderColor: C.navy700 },
  kpiLabel: { fontSize: 9, color: C.gray400, marginBottom: 2 },
  kpiVal: { fontSize: 13, fontWeight: '700' },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, padding: 12,
    backgroundColor: C.red50, borderRadius: 12, borderWidth: 1, borderColor: C.red200,
  },
  errorText: { flex: 1, fontSize: 13, color: C.red700 },
  retryBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: C.red100, borderRadius: 8 },
  retryText: { fontSize: 12, color: C.red700, fontWeight: '600' },
  alertCard: {
    flexDirection: 'row', alignItems: 'flex-start', margin: 12, padding: 12,
    backgroundColor: C.red50, borderRadius: 12, borderWidth: 1, borderColor: C.red200,
  },
  alertTitle: { fontSize: 13, fontWeight: '700', color: C.red700, marginBottom: 4 },
  alertItem: { fontSize: 12, color: C.red600, marginTop: 2 },
  searchRow: { paddingHorizontal: 14, paddingTop: 10 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.white, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: C.gray200,
  },
  searchInput: { flex: 1, fontSize: 13, color: C.gray900, padding: 0 },
  filterRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: C.gray100, borderWidth: 1, borderColor: C.gray200 },
  filterChipActive: { backgroundColor: C.amber500, borderColor: C.amber500 },
  filterText: { fontSize: 12, color: C.gray600, fontWeight: '500' },
  filterTextActive: { color: C.gray900, fontWeight: '700' },
  list: { padding: 14, paddingBottom: 60, gap: 10 },
  card: {
    backgroundColor: C.white, borderRadius: 14, padding: 14, gap: 8,
    shadowColor: C.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
    borderWidth: 1, borderColor: C.gray200,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  numFact: { fontSize: 14, fontWeight: '700', color: C.gray900 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  descText: { fontSize: 12, color: C.gray500 },
  amountsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amtLabel: { fontSize: 11, color: C.gray400 },
  amtTtc: { fontSize: 15, fontWeight: '700', color: C.gray900 },
  amtReste: { fontSize: 15, fontWeight: '700' },
  progressBg: { height: 6, backgroundColor: C.gray100, borderRadius: 3 },
  progressFill: { height: 6, borderRadius: 3 },
  datesRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 },
  dateText: { fontSize: 11, color: C.gray400 },
  center: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 14, color: C.gray500 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', padding: 20 },
  handle: { width: 40, height: 4, backgroundColor: C.gray200, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: C.gray900 },
  sheetSub: { fontSize: 12, color: C.gray400, marginTop: 2 },
  closeBtn: { padding: 6, backgroundColor: C.gray100, borderRadius: 12 },
  dossierChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.gray100, borderWidth: 1, borderColor: C.gray200 },
  dossierChipActive: { backgroundColor: C.amber100, borderColor: C.amber400 },
  dossierChipText: { fontSize: 12, color: C.gray700 },
  dossierChipTextActive: { color: C.amber900, fontWeight: '700' },
  calcSummaryBox: { backgroundColor: C.amber50, borderWidth: 1, borderColor: C.amber200, borderRadius: 10, padding: 10, marginBottom: 12 },
  calcSummaryText: { fontSize: 13, color: C.amber900 },
  sheetAmtCard: { backgroundColor: C.gray50, borderRadius: 12, padding: 12, gap: 6, marginBottom: 16 },
  sheetAmtRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sheetAmtLabel: { fontSize: 13, color: C.gray500 },
  sheetAmtVal: { fontSize: 13, color: C.gray900, fontWeight: '500' },
  envoyerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.blue600, borderRadius: 12, paddingVertical: 12, marginBottom: 16 },
  envoyerBtnText: { fontSize: 14, fontWeight: '600', color: C.white },
  encSection: { gap: 10 },
  encTitle: { fontSize: 14, fontWeight: '600', color: C.gray900 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: C.gray900, marginBottom: 6 },
  fieldInput: { borderWidth: 1, borderColor: C.gray200, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: C.gray900 },
  modesRow: { flexDirection: 'row', gap: 6 },
  modeChip: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: C.gray100 },
  modeChipActive: { backgroundColor: C.amber500 },
  modeText: { fontSize: 11, color: C.gray600, fontWeight: '500' },
  modeTextActive: { color: C.gray900, fontWeight: '700' },
  saveBtn: { backgroundColor: C.amber500, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  saveBtnText: { fontSize: 14, fontWeight: '600', color: C.gray900 },
  cancelBtn: { borderWidth: 1, borderColor: C.gray200, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  cancelBtnText: { fontSize: 14, fontWeight: '500', color: C.gray500 },
  fab: {
    position: 'absolute', bottom: 20, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: C.amber500,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.black, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 6,
    zIndex: 100,
  },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.amber500, borderRadius: 12,
    paddingHorizontal: 18, paddingVertical: 10, marginTop: 12,
  },
  emptyAddBtnText: { fontSize: 14, fontWeight: '700', color: C.gray900 },
});
