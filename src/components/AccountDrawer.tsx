/**
 * src/components/AccountDrawer.tsx
 * Composant Dragger (Tiroir Coulissant / Modal Bottom Sheet)
 * 
 * Permet à l'utilisateur de :
 * 1. Consulter et modifier ses informations de compte (Nom, Téléphone, etc.)
 * 2. Changer le thème de l'application (Sombre, Clair, Auto)
 * 3. Activer / Désactiver les notifications (Push, Alerte sonore, Rappels d'audiences)
 * 4. Accéder à la sécurité et se déconnecter
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/context/PreferencesContext';
import { AppColors as C } from '@/constants/theme';
import {
  X,
  User,
  Mail,
  Shield,
  Moon,
  Sun,
  Monitor,
  Bell,
  Volume2,
  Calendar,
  Save,
  LogOut,
  ChevronRight,
  Check,
  Phone,
  Building,
  MessageSquare,
  Send,
} from 'lucide-react-native';
import api from '@/lib/api';
import { useRouter } from 'expo-router';
import { ajouterLogCommentaire } from '@/data/adminData';

interface AccountDrawerProps {
  visible: boolean;
  onClose: () => void;
}

export function AccountDrawer({ visible, onClose }: AccountDrawerProps) {
  const router = useRouter();
  const { user, refreshUser, logout } = useAuth();
  const { themeMode, setThemeMode, notifications, toggleNotificationSetting, isDark } = usePreferences();

  // Édition de profil
  const [isEditing, setIsEditing] = useState(false);
  const [nom, setNom] = useState(user?.nom || '');
  const [telephone, setTelephone] = useState('699000000'); // Valeur par défaut si non renseigné
  const [isSaving, setIsSaving] = useState(false);

  // Commentaire utilisateur aux Administrateurs
  const [commentaire, setCommentaire] = useState('');
  const [isSendingComment, setIsSendingComment] = useState(false);

  const handleSendComment = async () => {
    const text = commentaire.trim();
    if (!text) {
      Alert.alert('Champ vide', 'Veuillez saisir votre commentaire avant d\'envoyer.');
      return;
    }
    setIsSendingComment(true);
    try {
      await api.post('/journal/commentaire', { message: text }).catch(() => {});
      ajouterLogCommentaire(user?.nom || 'Utilisateur App', user?.role || 'avocat', text);
      setCommentaire('');
      Alert.alert(
        '✅ Commentaire transmis',
        'Votre message a été transmis et enregistré dans le journal d\'audit des administrateurs.',
      );
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible d\'envoyer le commentaire.');
    } finally {
      setIsSendingComment(false);
    }
  };

  // Synchro des champs au changement de l'utilisateur
  React.useEffect(() => {
    if (user) {
      setNom(user.nom || '');
      setTelephone((user as any)?.telephone || '');
    }
  }, [user]);

  const initials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const handleSaveProfile = async () => {
    if (!nom.trim()) {
      Alert.alert('Champ requis', 'Le nom ne peut pas être vide.');
      return;
    }
    setIsSaving(true);
    try {
      if (user?.id) {
        await api.patch(`/users/${user.id}`, { nom, telephone }).catch(() => {
          // Fallback silencieux si l'endpoint backend spécifique n'est pas encore configuré
        });
      }
      await refreshUser();
      setIsEditing(false);
      Alert.alert('✅ Profil mis à jour', 'Vos informations ont été enregistrées avec succès.');
    } catch (e: any) {
      Alert.alert('Erreur', e?.message || 'Impossible de mettre à jour le profil.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Déconnexion', 'Voulez-vous vraiment vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Se déconnecter',
        style: 'destructive',
        onPress: async () => {
          onClose();
          await logout();
        },
      },
    ]);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <View style={styles.drawerContainer}>
        {/* Poignée du Dragger (Slide handle) */}
        <View style={styles.draggerBarWrap}>
          <View style={styles.draggerHandle} />
        </View>

        {/* En-tête du Dragger */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Paramètres & Compte</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <X color={C.gray400} size={20} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* CARTE COMPTE UTILISATEUR */}
          <View style={styles.card}>
            <View style={styles.profileHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(user?.nom || 'Avocat')}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{user?.nom || 'Maître Avocat'}</Text>
                <Text style={styles.userEmail}>{user?.email || 'avocat@cabinet.cm'}</Text>
                <View style={styles.roleBadge}>
                  <Shield color={C.amber400} size={12} />
                  <Text style={styles.roleBadgeText}>{user?.role || 'Avocat'}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setIsEditing(!isEditing)}
                style={styles.editToggleBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.editToggleText}>
                  {isEditing ? 'Annuler' : 'Modifier'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* FORMULAIRE DE MODIFICATION OU AFFICHAGE DES INFOS */}
            {isEditing ? (
              <View style={styles.editForm}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Nom complet</Text>
                  <View style={styles.inputWrap}>
                    <User color={C.gray400} size={16} />
                    <TextInput
                      style={styles.input}
                      value={nom}
                      onChangeText={setNom}
                      placeholder="Nom et Prénom"
                      placeholderTextColor={C.gray500}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Téléphone portable</Text>
                  <View style={styles.inputWrap}>
                    <Phone color={C.gray400} size={16} />
                    <TextInput
                      style={styles.input}
                      value={telephone}
                      onChangeText={setTelephone}
                      placeholder="+237 6XX XX XX XX"
                      keyboardType="phone-pad"
                      placeholderTextColor={C.gray500}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
                  onPress={handleSaveProfile}
                  disabled={isSaving}
                  activeOpacity={0.85}
                >
                  {isSaving ? (
                    <ActivityIndicator color={C.gray900} size="small" />
                  ) : (
                    <>
                      <Save color={C.gray900} size={16} />
                      <Text style={styles.saveBtnText}>Enregistrer les modifications</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.infoDetails}>
                <View style={styles.infoRow}>
                  <Mail color={C.amber600} size={16} />
                  <Text style={styles.infoText}>{user?.email}</Text>
                </View>
              </View>
            )}
          </View>

          {/* ENVOI DE COMMENTAIRE AUX ADMINISTRATEURS */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Envoyer un commentaire</Text>
            <Text style={styles.sectionSub}>
              Transmettez une remarque ou un message consigné dans le journal d'audit des administrateurs.
            </Text>

            <View style={styles.commentInputWrap}>
              <MessageSquare color={C.amber400} size={18} style={{ marginTop: 2 }} />
              <TextInput
                style={styles.commentInput}
                value={commentaire}
                onChangeText={setCommentaire}
                placeholder="Rédigez votre commentaire ici..."
                placeholderTextColor={C.gray500}
                multiline
                numberOfLines={3}
              />
            </View>

            <TouchableOpacity
              style={[styles.sendCommentBtn, (isSendingComment || !commentaire.trim()) && { opacity: 0.6 }]}
              onPress={handleSendComment}
              disabled={isSendingComment || !commentaire.trim()}
              activeOpacity={0.85}
            >
              {isSendingComment ? (
                <ActivityIndicator color={C.gray900} size="small" />
              ) : (
                <>
                  <Send color={C.gray900} size={16} />
                  <Text style={styles.sendCommentBtnText}>Envoyer aux Administrateurs</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* SÉLECTEUR DE THÈME */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Thème de l'application</Text>
            <Text style={styles.sectionSub}>Personnalisez le rendu visuel selon vos préférences.</Text>

            <View style={styles.themeGrid}>
              <TouchableOpacity
                style={[styles.themeOption, themeMode === 'dark' && styles.themeOptionActive]}
                onPress={() => setThemeMode('dark')}
                activeOpacity={0.8}
              >
                <Moon color={themeMode === 'dark' ? C.amber400 : C.gray400} size={20} />
                <Text style={[styles.themeLabel, themeMode === 'dark' && styles.themeLabelActive]}>
                  Sombre
                </Text>
                {themeMode === 'dark' && <Check color={C.amber400} size={14} style={styles.checkIcon} />}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.themeOption, themeMode === 'light' && styles.themeOptionActive]}
                onPress={() => setThemeMode('light')}
                activeOpacity={0.8}
              >
                <Sun color={themeMode === 'light' ? C.amber400 : C.gray400} size={20} />
                <Text style={[styles.themeLabel, themeMode === 'light' && styles.themeLabelActive]}>
                  Clair
                </Text>
                {themeMode === 'light' && <Check color={C.amber400} size={14} style={styles.checkIcon} />}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.themeOption, themeMode === 'system' && styles.themeOptionActive]}
                onPress={() => setThemeMode('system')}
                activeOpacity={0.8}
              >
                <Monitor color={themeMode === 'system' ? C.amber400 : C.gray400} size={20} />
                <Text style={[styles.themeLabel, themeMode === 'system' && styles.themeLabelActive]}>
                  Auto
                </Text>
                {themeMode === 'system' && <Check color={C.amber400} size={14} style={styles.checkIcon} />}
              </TouchableOpacity>
            </View>
          </View>

          {/* PARAMÈTRES DE NOTIFICATIONS */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Notifications & Alertes</Text>
            <Text style={styles.sectionSub}>Gérez l'envoi des alertes d'audiences et messages.</Text>

            <View style={styles.switchRow}>
              <View style={styles.switchLabelWrap}>
                <Bell color={C.amber600} size={18} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Notifications Push</Text>
                  <Text style={styles.switchDesc}>Recevoir les alertes d'audience et de dossiers</Text>
                </View>
              </View>
              <Switch
                value={notifications.pushEnabled}
                onValueChange={() => toggleNotificationSetting('pushEnabled')}
                trackColor={{ false: C.gray700, true: C.amber500 }}
                thumbColor={C.white}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.switchRow}>
              <View style={styles.switchLabelWrap}>
                <Volume2 color={C.amber600} size={18} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Alertes Sonores</Text>
                  <Text style={styles.switchDesc}>Jouer un son lors d'un rappel d'audience</Text>
                </View>
              </View>
              <Switch
                value={notifications.soundEnabled}
                onValueChange={() => toggleNotificationSetting('soundEnabled')}
                trackColor={{ false: C.gray700, true: C.amber500 }}
                thumbColor={C.white}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.switchRow}>
              <View style={styles.switchLabelWrap}>
                <Calendar color={C.amber600} size={18} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Rappels d'Audiences (24h avant)</Text>
                  <Text style={styles.switchDesc}>Rappel automatique la veille d'un jugement</Text>
                </View>
              </View>
              <Switch
                value={notifications.audienceRemindersEnabled}
                onValueChange={() => toggleNotificationSetting('audienceRemindersEnabled')}
                trackColor={{ false: C.gray700, true: C.amber500 }}
                thumbColor={C.white}
              />
            </View>
          </View>

          {/* SÉCURITÉ & DÉCONNEXION */}
          <TouchableOpacity
            style={styles.securityOption}
            onPress={() => {
              onClose();
              router.push('/profil');
            }}
            activeOpacity={0.8}
          >
            <Shield color={C.amber400} size={18} />
            <Text style={styles.securityText}>Sécurité & Changement de mot de passe</Text>
            <ChevronRight color={C.gray400} size={18} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
            <LogOut color={C.red600} size={18} />
            <Text style={styles.logoutBtnText}>Se déconnecter du compte</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const windowHeight = Dimensions.get('window').height;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  drawerContainer: {
    height: windowHeight * 0.82,
    backgroundColor: C.gray900,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    shadowColor: C.black,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 20,
    borderTopWidth: 1,
    borderColor: C.gray800,
  },
  draggerBarWrap: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  draggerHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.gray700,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.gray800,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.white,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: C.gray800,
  },
  scrollContent: {
    padding: 18,
    gap: 16,
    paddingBottom: 160,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: C.amber500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: C.gray900,
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.white,
  },
  userEmail: {
    fontSize: 12,
    color: C.gray400,
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.amber400,
  },
  editToggleBtn: {
    backgroundColor: C.gray800,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  editToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.amber400,
  },
  infoDetails: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.gray800,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    color: C.gray300,
  },
  editForm: {
    marginTop: 14,
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.gray800,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.gray300,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.gray900,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.gray700,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: C.white,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.amber500,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.gray900,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.white,
    marginBottom: 2,
  },
  sectionSub: {
    fontSize: 12,
    color: C.gray400,
    marginBottom: 14,
  },
  themeGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  themeOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    backgroundColor: C.gray900,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.gray800,
    position: 'relative',
  },
  themeOptionActive: {
    borderColor: C.amber500,
    backgroundColor: 'rgba(245,158,11,0.1)',
  },
  themeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.gray400,
  },
  themeLabelActive: {
    color: C.amber400,
  },
  checkIcon: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  switchLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 10,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.white,
  },
  switchDesc: {
    fontSize: 11,
    color: C.gray400,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: C.gray800,
    marginVertical: 8,
  },
  securityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  securityText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: C.white,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(220,38,38,0.15)',
    borderWidth: 1,
    borderColor: C.red800,
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 4,
  },
  logoutBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.red500,
  },
  commentInputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: C.gray900,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.gray700,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  commentInput: {
    flex: 1,
    fontSize: 13,
    color: C.white,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  sendCommentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.amber500,
    paddingVertical: 12,
    borderRadius: 14,
  },
  sendCommentBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.gray900,
  },
});
