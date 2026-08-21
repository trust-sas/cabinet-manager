/**
 * src/app/admin/audit.tsx
 * Fenêtre d'Audit — Commentaires et Remarques des Utilisateurs uniquement.
 */
import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MessageSquare, User, Clock, Globe, ArrowLeft,
} from 'lucide-react-native';
import { AppColors as C } from '@/constants/theme';
import { journalActivites, type LogActivite, type RoleKey } from '@/data/adminData';
import { useRouter } from 'expo-router';

const ROLE_COLORS: Record<RoleKey, string> = {
  administrateur: '#dc2626',
  associe: '#7c3aed',
  avocat: C.blue600,
  assistant: C.green600,
};

export default function AuditScreen() {
  const router = useRouter();
  const [logs] = useState<LogActivite[]>(journalActivites);
  const [selectedLog, setSelectedLog] = useState<LogActivite | null>(null);

  // Filtrer uniquement les commentaires des utilisateurs
  const commentaires = logs
    .filter(l => l.action === 'commentaire_utilisateur')
    .sort((a, b) => new Date(b.horodatage).getTime() - new Date(a.horodatage).getTime());

  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(dt);
  };

  const fmtRel = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m} min`;
    const h = Math.floor(diff / 3600000);
    if (h < 24) return `${h}h`;
    return `${Math.floor(diff / 86400000)}j`;
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#1a0a0a' }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
            <ArrowLeft color={C.gray400} size={18} />
            <Text style={s.backText}>Admin</Text>
          </TouchableOpacity>

          <View style={s.titleWrap}>
            <Text style={s.title}>Commentaires des Utilisateurs</Text>
            <Text style={s.sub}>
              {commentaires.length} commentaire(s) transmis aux administrateurs
            </Text>
          </View>
        </View>

        {/* Total Badge */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <MessageSquare color={C.amber400} size={20} />
            <Text style={s.statVal}>{commentaires.length}</Text>
            <Text style={s.statLabel}>Messages & Remarques reçus</Text>
          </View>
        </View>
      </SafeAreaView>

      <FlatList
        data={commentaires}
        keyExtractor={item => item.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.empty}>
            <MessageSquare color={C.gray400} size={48} />
            <Text style={s.emptyTitle}>Aucun commentaire</Text>
            <Text style={s.emptyText}>Les commentaires envoyés depuis le menu tiroir apparaîtront ici.</Text>
          </View>
        }
        renderItem={({ item: log }) => {
          const roleColor = ROLE_COLORS[log.utilisateurRole] || C.blue600;
          const msgText = log.nouvelleValeur || log.description.replace(/^💬 Commentaire utilisateur : "/, '').replace(/"$/, '');

          return (
            <TouchableOpacity
              style={s.commentCard}
              onPress={() => setSelectedLog(log)}
              activeOpacity={0.85}
            >
              <View style={s.cardHeader}>
                <View style={s.userBadgeRow}>
                  <View style={[s.roleDot, { backgroundColor: roleColor }]} />
                  <Text style={s.userName}>{log.utilisateurNom}</Text>
                  <View style={s.roleBadge}>
                    <Text style={[s.roleBadgeText, { color: roleColor }]}>
                      {log.utilisateurRole ? log.utilisateurRole.toUpperCase() : 'UTILISATEUR'}
                    </Text>
                  </View>
                </View>
                <Text style={s.timeText}>{fmtRel(log.horodatage)}</Text>
              </View>

              <View style={s.msgBubble}>
                <Text style={s.msgText}>{msgText}</Text>
              </View>

              <View style={s.cardFooter}>
                <Clock color={C.gray500} size={12} />
                <Text style={s.footerDate}>{fmtDate(log.horodatage)}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Modal Détail du Commentaire */}
      <Modal visible={selectedLog !== null} transparent animationType="slide" onRequestClose={() => setSelectedLog(null)}>
        <TouchableOpacity style={s.overlay} onPress={() => setSelectedLog(null)} activeOpacity={1}>
          <TouchableOpacity style={s.sheet} activeOpacity={1} onPress={() => {}}>
            <View style={s.handle} />
            {selectedLog && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.sheetHeader}>
                  <View style={s.iconWrap}>
                    <MessageSquare color={C.amber400} size={24} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sheetTitle}>Commentaire de {selectedLog.utilisateurNom}</Text>
                    <Text style={s.sheetSub}>{fmtDate(selectedLog.horodatage)}</Text>
                  </View>
                </View>

                <View style={s.descBox}>
                  <Text style={s.descLabel}>Message transmis :</Text>
                  <Text style={s.descText}>
                    {selectedLog.nouvelleValeur || selectedLog.description}
                  </Text>
                </View>

                <View style={s.infoGrid}>
                  <View style={s.infoRow}>
                    <Text style={s.infoLabel}>Expéditeur</Text>
                    <Text style={s.infoVal}>{selectedLog.utilisateurNom}</Text>
                  </View>
                  <View style={s.infoRow}>
                    <Text style={s.infoLabel}>Rôle</Text>
                    <Text style={s.infoVal}>{selectedLog.utilisateurRole}</Text>
                  </View>
                  <View style={s.infoRow}>
                    <Text style={s.infoLabel}>Adresse IP</Text>
                    <Text style={s.infoVal}>{selectedLog.adresseIP}</Text>
                  </View>
                </View>

                <TouchableOpacity style={s.closeBtn} onPress={() => setSelectedLog(null)} activeOpacity={0.8}>
                  <Text style={s.closeBtnText}>Fermer</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0F17' },
  header: { padding: 18, paddingBottom: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backText: { fontSize: 13, color: C.gray400 },
  titleWrap: { gap: 2 },
  title: { fontSize: 22, fontWeight: '800', color: C.white },
  sub: { fontSize: 13, color: C.gray400 },

  statsRow: { paddingHorizontal: 18, paddingBottom: 14 },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#161F30',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  statVal: { fontSize: 22, fontWeight: '800', color: C.white },
  statLabel: { fontSize: 13, color: C.gray300, fontWeight: '500' },

  list: { padding: 16, paddingBottom: 100, gap: 12 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.white },
  emptyText: { fontSize: 13, color: C.gray500, textAlign: 'center', maxWidth: 280 },

  commentCard: {
    backgroundColor: '#131B2A',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  userBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleDot: { width: 8, height: 8, borderRadius: 4 },
  userName: { fontSize: 15, fontWeight: '700', color: C.white },
  roleBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: { fontSize: 10, fontWeight: '700' },
  timeText: { fontSize: 12, color: C.gray500 },

  msgBubble: {
    backgroundColor: '#1C273C',
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: C.amber500,
  },
  msgText: { fontSize: 14, color: C.white, lineHeight: 21 },

  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end' },
  footerDate: { fontSize: 11, color: C.gray500 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#131B2A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, maxHeight: '85%' },
  handle: { width: 40, height: 4, backgroundColor: C.gray700, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  iconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(245,158,11,0.15)', alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: C.white },
  sheetSub: { fontSize: 12, color: C.gray400, marginTop: 2 },
  descBox: { backgroundColor: '#1C273C', borderRadius: 14, padding: 14, marginBottom: 14 },
  descLabel: { fontSize: 12, color: C.amber400, fontWeight: '600', marginBottom: 6 },
  descText: { fontSize: 14, color: C.white, lineHeight: 22 },
  infoGrid: { backgroundColor: '#1A2436', borderRadius: 14, padding: 12, marginBottom: 16, gap: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  infoLabel: { fontSize: 13, color: C.gray400 },
  infoVal: { fontSize: 13, fontWeight: '600', color: C.white },
  closeBtn: { backgroundColor: '#1E293B', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  closeBtnText: { fontSize: 14, fontWeight: '600', color: C.white },
});
