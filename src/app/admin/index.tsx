import { AppColors as C } from '@/constants/theme';
import { journalActivites, roles, utilisateursAdmin } from '@/data/adminData';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'expo-router';
import {
    Activity,
    AlertTriangle,
    ArrowLeft,
    CheckCircle,
    Key,
    Lock,
    LogOut,
    ScrollText,
    Shield,
    TrendingUp,
    Users,
    XCircle
} from 'lucide-react-native';
import {
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAdminUsers } from '@/hooks/useAdminUsers';

export default function AdminDashboard() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { users } = useAdminUsers();

  const actifs   = users.filter(u => u.actif).length;
  const inactifs = users.filter(u => !u.actif).length;
  const sans2fa  = 0;
  const comptesBloques = 0;

  const logsAujourdhui = journalActivites.filter(l => {
    const d = new Date(l.horodatage);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  const alertesSecurite = journalActivites.filter(
    l => l.action === 'connexion_echec' || l.action === 'tentative_acces_refuse'
  ).length;

  const recentLogs = [...journalActivites]
    .sort((a, b) => new Date(b.horodatage).getTime() - new Date(a.horodatage).getTime())
    .slice(0, 5);

  const fmtDate = (d: string) => {
    const dt = new Date(d);
    const diff = Date.now() - dt.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `Il y a ${mins} min`;
    const h = Math.floor(diff / 3600000);
    if (h < 24) return `Il y a ${h}h`;
    return `Il y a ${Math.floor(diff / 86400000)}j`;
  };

  const ACTION_COLORS: Record<string, string> = {
    connexion: C.green500, deconnexion: C.gray400,
    connexion_echec: C.red500, tentative_acces_refuse: C.red600,
    creation_dossier: C.blue500, modification_dossier: C.orange500,
    ajout_document: C.purple600, creation_facture: C.green600,
    paiement_enregistre: C.green500, modification_permissions: C.red500,
    creation_utilisateur: C.blue600, planification_audience: C.amber500,
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1a0a0a" />
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#1a0a0a' }}>
        <View style={s.header}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={s.backBtn} activeOpacity={0.7}>
              <ArrowLeft color={C.gray400} size={18} />
              <Text style={s.backText}>App</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={logout} style={s.logoutHeaderBtn} activeOpacity={0.8}>
              <LogOut color={C.red400} size={16} />
              <Text style={s.logoutHeaderText}>Déconnexion</Text>
            </TouchableOpacity>
          </View>

          <View style={s.titleRow}>
            <View style={s.adminBadge}>
              <Shield color={C.white} size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Espace Administrateur</Text>
              <Text style={s.sub}>{user ? `${user.nom} (${user.email})` : 'Administrateur'}</Text>
            </View>
          </View>
          <View style={s.secureTag}>
            <Lock color={C.red400} size={12} />
            <Text style={s.secureText}>Accès restreint</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* KPIs */}
        <View style={s.kpiGrid}>
          <View style={[s.kpiCard, { borderLeftColor: C.green500 }]}>
            <CheckCircle color={C.green500} size={22} />
            <Text style={s.kpiVal}>{actifs}</Text>
            <Text style={s.kpiLabel}>Comptes actifs</Text>
          </View>
          <View style={[s.kpiCard, { borderLeftColor: C.gray500 }]}>
            <XCircle color={C.gray500} size={22} />
            <Text style={s.kpiVal}>{inactifs}</Text>
            <Text style={s.kpiLabel}>Comptes inactifs</Text>
          </View>
          <View style={[s.kpiCard, { borderLeftColor: C.amber500 }]}>
            <Activity color={C.amber500} size={22} />
            <Text style={s.kpiVal}>{logsAujourdhui}</Text>
            <Text style={s.kpiLabel}>Actions aujourd'hui</Text>
          </View>
        </View>

        {/* Navigation rapide */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Gestion du système</Text>
          <View style={s.navGrid}>
            {[
              {
                Icon: Users, label: 'Utilisateurs',
                sub: `${utilisateursAdmin.length} comptes`,
                color: C.blue600, bg: C.blue50, border: C.blue100,
                route: '/admin/utilisateurs',
              },
              {
                Icon: Key, label: 'Rôles & Permissions',
                sub: `${roles.length} rôles configurés`,
                color: '#7c3aed', bg: '#faf5ff', border: '#f3e8ff',
                route: '/admin/roles',
              },
              {
                Icon: ScrollText, label: 'Journal d\'audit',
                sub: `${journalActivites.length} entrées`,
                color: C.orange600, bg: C.orange50, border: C.orange100,
                route: '/admin/audit' as any,
              },
              {
                Icon: TrendingUp, label: 'Reporting',
                sub: 'Statistiques globales',
                color: C.green600, bg: C.green50, border: C.green100,
                route: '/admin/audit' as any,
              },
            ].map(item => (
              <TouchableOpacity
                key={item.label}
                style={[s.navCard, { backgroundColor: item.bg, borderColor: item.border }]}
                onPress={() => router.push(item.route as any)}
                activeOpacity={0.8}
              >
                <View style={[s.navIcon, { backgroundColor: item.color }]}>
                  <item.Icon color={C.white} size={20} />
                </View>
                <Text style={s.navLabel}>{item.label}</Text>
                <Text style={s.navSub}>{item.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Répartition des rôles */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Répartition des rôles</Text>
          <View style={s.rolesCard}>
            {roles.map(role => (
              <View key={role.id} style={s.roleRow}>
                <View style={[s.roleDot, { backgroundColor: role.couleur }]} />
                <Text style={s.roleLabel}>{role.label}</Text>
                <View style={s.roleBar}>
                  <View style={[
                    s.roleBarFill,
                    {
                      backgroundColor: role.couleur,
                      width: `${(role.nbUtilisateurs / utilisateursAdmin.length) * 100}%` as any,
                    },
                  ]} />
                </View>
                <Text style={s.roleCount}>{role.nbUtilisateurs}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Dernières activités */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Dernières activités</Text>
            <TouchableOpacity onPress={() => router.push('/admin/audit' as any)} activeOpacity={0.7}>
              <Text style={s.seeAll}>Voir tout</Text>
            </TouchableOpacity>
          </View>
          <View style={s.logsCard}>
            {recentLogs.map((log, i) => (
              <View key={log.id} style={[s.logRow, i < recentLogs.length - 1 && s.logRowBorder]}>
                <View style={[s.logDot, { backgroundColor: ACTION_COLORS[log.action] ?? C.gray400 }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.logDesc} numberOfLines={1}>{log.description}</Text>
                  <Text style={s.logMeta}>{log.utilisateurNom} · {log.module}</Text>
                </View>
                <Text style={s.logTime}>{fmtDate(log.horodatage)}</Text>
              </View>
            ))}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  header: { padding: 16, paddingBottom: 14 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: 13, color: C.gray400 },
  logoutHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(239, 68, 68, 0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' },
  logoutHeaderText: { fontSize: 12, color: C.red400, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  adminBadge: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.red600,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.red600, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 6,
  },
  title: { fontSize: 20, fontWeight: '700', color: C.white },
  sub: { fontSize: 12, color: '#fca5a5', marginTop: 2 },
  secureTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(220,38,38,0.15)',
    borderWidth: 1, borderColor: 'rgba(220,38,38,0.3)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start',
  },
  secureText: { fontSize: 11, color: '#fca5a5', fontWeight: '600' },
  alertBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: C.red50, borderWidth: 1, borderColor: C.red100,
    borderRadius: 14, margin: 14, padding: 14,
  },
  alertTitle: { fontSize: 14, fontWeight: '700', color: '#7f1d1d', marginBottom: 4 },
  alertItem: { fontSize: 12, color: C.red700, lineHeight: 20 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14, paddingTop: 6 },
  kpiCard: {
    width: '47%', backgroundColor: C.white, borderRadius: 14,
    borderLeftWidth: 4, padding: 14, gap: 4,
    shadowColor: C.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3, elevation: 2,
  },
  kpiVal: { fontSize: 28, fontWeight: '700', color: C.gray900 },
  kpiLabel: { fontSize: 12, color: C.gray500 },
  section: { paddingHorizontal: 14, marginTop: 6, marginBottom: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.gray900, marginBottom: 12 },
  seeAll: { fontSize: 13, color: C.red600, fontWeight: '500' },
  navGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  navCard: {
    width: '47%', borderRadius: 16, borderWidth: 1,
    padding: 16, gap: 8,
    shadowColor: C.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  navIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: 13, fontWeight: '700', color: C.gray900 },
  navSub: { fontSize: 11, color: C.gray500 },
  rolesCard: { backgroundColor: C.white, borderRadius: 16, padding: 16, gap: 12, shadowColor: C.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3, elevation: 2 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  roleDot: { width: 10, height: 10, borderRadius: 5 },
  roleLabel: { fontSize: 13, color: C.gray700, width: 100 },
  roleBar: { flex: 1, height: 8, backgroundColor: C.gray100, borderRadius: 4, overflow: 'hidden' },
  roleBarFill: { height: 8, borderRadius: 4 },
  roleCount: { fontSize: 13, fontWeight: '700', color: C.gray900, width: 20, textAlign: 'right' },
  logsCard: { backgroundColor: C.white, borderRadius: 16, overflow: 'hidden', shadowColor: C.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3, elevation: 2 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  logRowBorder: { borderBottomWidth: 1, borderBottomColor: C.gray50 },
  logDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  logDesc: { fontSize: 13, fontWeight: '500', color: C.gray900 },
  logMeta: { fontSize: 11, color: C.gray500, marginTop: 2 },
  logTime: { fontSize: 11, color: C.gray400 },
});
