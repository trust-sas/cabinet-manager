// ─── Types Admin ─────────────────────────────────────────────────────────────

export type RoleKey = 'administrateur' | 'associe' | 'avocat' | 'assistant';

export interface Permission {
  id: string;
  module: string;
  action: string;
  label: string;
}

export interface Role {
  id: string;
  key: RoleKey;
  label: string;
  description: string;
  couleur: string;
  permissions: string[]; // ids des permissions
  nbUtilisateurs: number;
  modifiable: boolean;
}

export interface UtilisateurAdmin {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  role: RoleKey;
  actif: boolean;
  dateCreation: string;
  derniereConnexion: string | null;
  authentif2FA: boolean;
  barreau?: string;
  tentativesEchouees: number;
}

export type ActionLog =
  | 'connexion' | 'deconnexion' | 'creation_dossier' | 'modification_dossier'
  | 'cloture_dossier' | 'ajout_document' | 'suppression_document'
  | 'creation_facture' | 'paiement_enregistre' | 'creation_client'
  | 'modification_client' | 'creation_utilisateur' | 'modification_role'
  | 'modification_permissions' | 'export_donnees' | 'consultation_dossier'
  | 'planification_audience' | 'connexion_echec' | 'tentative_acces_refuse'
  | 'restauration_donnees' | 'commentaire_utilisateur';

export interface LogActivite {
  id: string;
  utilisateurId: string;
  utilisateurNom: string;
  utilisateurRole: RoleKey;
  action: ActionLog;
  module: string;
  description: string;
  horodatage: string;
  adresseIP: string;
  ressourceId?: string;
  ressourceType?: string;
  ancienneValeur?: string;
  nouvelleValeur?: string;
  restaurable: boolean;
}

// ─── Permissions ──────────────────────────────────────────────────────────────

export const permissions: Permission[] = [
  // Dossiers
  { id: 'p01', module: 'Dossiers', action: 'lire',         label: 'Consulter les dossiers' },
  { id: 'p02', module: 'Dossiers', action: 'creer',        label: 'Créer un dossier' },
  { id: 'p03', module: 'Dossiers', action: 'modifier',     label: 'Modifier un dossier' },
  { id: 'p04', module: 'Dossiers', action: 'cloturer',     label: 'Clôturer un dossier' },
  { id: 'p05', module: 'Dossiers', action: 'supprimer',    label: 'Supprimer un dossier' },
  { id: 'p06', module: 'Dossiers', action: 'tous_dossiers',label: 'Voir tous les dossiers (pas seulement les siens)' },
  // Clients
  { id: 'p07', module: 'Clients',  action: 'lire',         label: 'Consulter les clients' },
  { id: 'p08', module: 'Clients',  action: 'creer',        label: 'Créer un client' },
  { id: 'p09', module: 'Clients',  action: 'modifier',     label: 'Modifier un client' },
  // Documents
  { id: 'p10', module: 'Documents',action: 'lire',         label: 'Consulter les documents' },
  { id: 'p11', module: 'Documents',action: 'ajouter',      label: 'Ajouter un document' },
  { id: 'p12', module: 'Documents',action: 'supprimer',    label: 'Supprimer un document' },
  // Facturation
  { id: 'p13', module: 'Facturation', action: 'lire',      label: 'Consulter les factures' },
  { id: 'p14', module: 'Facturation', action: 'creer',     label: 'Créer une facture' },
  { id: 'p15', module: 'Facturation', action: 'paiement',  label: 'Enregistrer un paiement' },
  { id: 'p16', module: 'Facturation', action: 'toutes',    label: 'Voir toutes les factures' },
  // Audiences
  { id: 'p17', module: 'Audiences', action: 'lire',        label: 'Consulter les audiences' },
  { id: 'p18', module: 'Audiences', action: 'planifier',   label: 'Planifier une audience' },
  // Tableau de bord
  { id: 'p19', module: 'Dashboard', action: 'lire',        label: 'Accéder au tableau de bord' },
  { id: 'p20', module: 'Dashboard', action: 'reporting',   label: 'Générer des rapports' },
  // IA
  { id: 'p21', module: 'Assistant IA', action: 'utiliser', label: 'Utiliser l\'assistant IA' },
  // Administration
  { id: 'p22', module: 'Administration', action: 'utilisateurs', label: 'Gérer les utilisateurs' },
  { id: 'p23', module: 'Administration', action: 'roles',        label: 'Gérer les rôles et permissions' },
  { id: 'p24', module: 'Administration', action: 'audit',        label: 'Consulter le journal d\'audit' },
  { id: 'p25', module: 'Administration', action: 'restaurer',    label: 'Restaurer des données' },
];

// ─── Rôles ────────────────────────────────────────────────────────────────────

export const roles: Role[] = [
  {
    id: 'r1',
    key: 'administrateur',
    label: 'Administrateur',
    description: 'Accès complet à toutes les fonctionnalités, gestion des utilisateurs et des droits.',
    couleur: '#dc2626',
    permissions: permissions.map(p => p.id), // toutes les permissions
    nbUtilisateurs: 1,
    modifiable: false,
  },
  {
    id: 'r2',
    key: 'associe',
    label: 'Associé',
    description: 'Visibilité étendue sur tous les dossiers et le reporting, sans accès administration.',
    couleur: '#7c3aed',
    permissions: ['p01','p02','p03','p04','p06','p07','p08','p09','p10','p11','p13','p14','p15','p16','p17','p18','p19','p20','p21'],
    nbUtilisateurs: 1,
    modifiable: true,
  },
  {
    id: 'r3',
    key: 'avocat',
    label: 'Avocat',
    description: 'Gestion de ses propres dossiers, agenda, facturation et accès à l\'assistant IA.',
    couleur: '#2563eb',
    permissions: ['p01','p02','p03','p04','p07','p08','p09','p10','p11','p13','p14','p15','p17','p18','p19','p21'],
    nbUtilisateurs: 2,
    modifiable: true,
  },
  {
    id: 'r4',
    key: 'assistant',
    label: 'Assistant',
    description: 'Saisie et organisation documentaire des dossiers. Pas d\'accès à la facturation complète.',
    couleur: '#059669',
    permissions: ['p01','p07','p08','p09','p10','p11','p17','p19'],
    nbUtilisateurs: 1,
    modifiable: true,
  },
];

// ─── Utilisateurs Admin ───────────────────────────────────────────────────────

export const utilisateursAdmin: UtilisateurAdmin[] = [
  {
    id: 'u1',
    nom: 'Tchio',
    prenom: 'Paul',
    email: 'p.tchio@cabinet.cm',
    telephone: '+237 699 345 678',
    role: 'administrateur',
    actif: true,
    dateCreation: '2023-01-10',
    derniereConnexion: new Date(Date.now() - 2 * 3600000).toISOString(),
    authentif2FA: true,
    barreau: 'Barreau du Centre',
    tentativesEchouees: 0,
  },
  {
    id: 'u2',
    nom: 'Nkodo',
    prenom: 'Jean-Pierre',
    email: 'jp.nkodo@cabinet.cm',
    telephone: '+237 655 123 456',
    role: 'avocat',
    actif: true,
    dateCreation: '2023-02-15',
    derniereConnexion: new Date(Date.now() - 30 * 60000).toISOString(),
    authentif2FA: true,
    barreau: 'Barreau de Yaoundé',
    tentativesEchouees: 0,
  },
  {
    id: 'u3',
    nom: 'Mbarga',
    prenom: 'Hélène',
    email: 'h.mbarga@cabinet.cm',
    telephone: '+237 677 234 567',
    role: 'avocat',
    actif: true,
    dateCreation: '2023-03-20',
    derniereConnexion: new Date(Date.now() - 5 * 3600000).toISOString(),
    authentif2FA: false,
    barreau: 'Barreau de Yaoundé',
    tentativesEchouees: 0,
  },
  {
    id: 'u4',
    nom: 'Elong',
    prenom: 'Sophie',
    email: 's.elong@cabinet.cm',
    telephone: '+237 654 456 789',
    role: 'assistant',
    actif: true,
    dateCreation: '2023-06-01',
    derniereConnexion: new Date(Date.now() - 48 * 3600000).toISOString(),
    authentif2FA: false,
    tentativesEchouees: 0,
  },
  {
    id: 'u5',
    nom: 'Fouda',
    prenom: 'Martin',
    email: 'm.fouda@cabinet.cm',
    telephone: '+237 699 567 890',
    role: 'associe',
    actif: false,
    dateCreation: '2022-11-05',
    derniereConnexion: new Date(Date.now() - 30 * 86400000).toISOString(),
    authentif2FA: false,
    barreau: 'Barreau de Douala',
    tentativesEchouees: 3,
  },
];

// ─── Journal d'activité ───────────────────────────────────────────────────────

export const journalActivites: LogActivite[] = [
  {
    id: 'log_com_001',
    utilisateurId: 'u2',
    utilisateurNom: 'Nkodo Jean-Pierre',
    utilisateurRole: 'avocat',
    action: 'commentaire_utilisateur',
    module: 'Administration',
    description: '💬 Commentaire utilisateur : "Merci de vérifier les autorisations d\'accès aux pièces jointes du dossier AFF-2024-001."',
    horodatage: new Date(Date.now() - 30 * 60000).toISOString(),
    adresseIP: '192.168.1.14',
    nouvelleValeur: 'Merci de vérifier les autorisations d\'accès aux pièces jointes du dossier AFF-2024-001.',
    restaurable: false,
  },
  {
    id: 'log_com_002',
    utilisateurId: 'u3',
    utilisateurNom: 'Mbarga Hélène',
    utilisateurRole: 'avocat',
    action: 'commentaire_utilisateur',
    module: 'Administration',
    description: '💬 Commentaire utilisateur : "L\'exportation de la facturation fonctionne très bien. Merci."',
    horodatage: new Date(Date.now() - 3 * 3600000).toISOString(),
    adresseIP: '192.168.1.22',
    nouvelleValeur: 'L\'exportation de la facturation fonctionne très bien. Merci.',
    restaurable: false,
  },
  {
    id: 'log002',
    utilisateurId: 'u2',
    utilisateurNom: 'Nkodo Jean-Pierre',
    utilisateurRole: 'avocat',
    action: 'modification_dossier',
    module: 'Dossiers',
    description: 'Modification des notes internes du dossier AFF-2024-001',
    horodatage: new Date(Date.now() - 28 * 60000).toISOString(),
    adresseIP: '192.168.1.14',
    ressourceId: 'a1',
    ressourceType: 'Dossier',
    ancienneValeur: 'Client exige résolution rapide.',
    nouvelleValeur: 'Client exige résolution rapide. Pression pour arrangement amiable avant jugement.',
    restaurable: true,
  },
  {
    id: 'log003',
    utilisateurId: 'u3',
    utilisateurNom: 'Mbarga Hélène',
    utilisateurRole: 'avocat',
    action: 'ajout_document',
    module: 'Documents',
    description: 'Ajout du document "Conclusions en demande — dépôt 15 mars 2024.docx" au dossier AFF-2024-001',
    horodatage: new Date(Date.now() - 2 * 3600000).toISOString(),
    adresseIP: '192.168.1.22',
    ressourceId: 'd3',
    ressourceType: 'Document',
    restaurable: false,
  },
  {
    id: 'log004',
    utilisateurId: 'u2',
    utilisateurNom: 'Nkodo Jean-Pierre',
    utilisateurRole: 'avocat',
    action: 'creation_facture',
    module: 'Facturation',
    description: 'Création de la facture FACT-2024-002 — CAMTEL SA — 2 000 000 FCFA',
    horodatage: new Date(Date.now() - 3 * 3600000).toISOString(),
    adresseIP: '192.168.1.14',
    ressourceId: 'f2',
    ressourceType: 'Facture',
    restaurable: true,
  },
  {
    id: 'log005',
    utilisateurId: 'u5',
    utilisateurNom: 'Fouda Martin',
    utilisateurRole: 'associe',
    action: 'connexion_echec',
    module: 'Authentification',
    description: 'Échec de connexion — mot de passe incorrect (tentative 3/5)',
    horodatage: new Date(Date.now() - 5 * 3600000).toISOString(),
    adresseIP: '41.202.207.14',
    restaurable: false,
  },
  {
    id: 'log006',
    utilisateurId: 'u1',
    utilisateurNom: 'Tchio Paul',
    utilisateurRole: 'administrateur',
    action: 'modification_permissions',
    module: 'Administration',
    description: 'Modification des permissions du rôle Avocat — ajout de la permission "Voir toutes les factures"',
    horodatage: new Date(Date.now() - 6 * 3600000).toISOString(),
    adresseIP: '192.168.1.10',
    ressourceId: 'r3',
    ressourceType: 'Rôle',
    ancienneValeur: 'Permissions: p01,p02,p03,p04,p07,p08,p09,p10,p11,p13,p14,p15,p17,p18,p19,p21',
    nouvelleValeur: 'Permissions: p01,p02,p03,p04,p07,p08,p09,p10,p11,p13,p14,p15,p17,p18,p19,p21',
    restaurable: true,
  },
  {
    id: 'log007',
    utilisateurId: 'u4',
    utilisateurNom: 'Elong Sophie',
    utilisateurRole: 'assistant',
    action: 'ajout_document',
    module: 'Documents',
    description: 'Ajout du document "Lettre de licenciement — 12 février 2024.pdf" au dossier AFF-2024-003',
    horodatage: new Date(Date.now() - 24 * 3600000).toISOString(),
    adresseIP: '192.168.1.30',
    ressourceId: 'd7',
    ressourceType: 'Document',
    restaurable: false,
  },
  {
    id: 'log008',
    utilisateurId: 'u1',
    utilisateurNom: 'Tchio Paul',
    utilisateurRole: 'administrateur',
    action: 'creation_utilisateur',
    module: 'Administration',
    description: 'Création du compte utilisateur Elong Sophie (rôle : Assistant)',
    horodatage: new Date(Date.now() - 30 * 86400000).toISOString(),
    adresseIP: '192.168.1.10',
    ressourceId: 'u4',
    ressourceType: 'Utilisateur',
    restaurable: false,
  },
  {
    id: 'log009',
    utilisateurId: 'u2',
    utilisateurNom: 'Nkodo Jean-Pierre',
    utilisateurRole: 'avocat',
    action: 'planification_audience',
    module: 'Audiences',
    description: 'Planification audience au fond — CAMTEL c/ Tech Innovations le 15/07/2025',
    horodatage: new Date(Date.now() - 2 * 86400000).toISOString(),
    adresseIP: '192.168.1.14',
    ressourceId: 'aud1',
    ressourceType: 'Audience',
    restaurable: true,
  },
  {
    id: 'log010',
    utilisateurId: 'u3',
    utilisateurNom: 'Mbarga Hélène',
    utilisateurRole: 'avocat',
    action: 'paiement_enregistre',
    module: 'Facturation',
    description: 'Enregistrement paiement 2 200 000 FCFA — Succession Kamga — FACT-2024-003',
    horodatage: new Date(Date.now() - 3 * 86400000).toISOString(),
    adresseIP: '192.168.1.22',
    ressourceId: 'f3',
    ressourceType: 'Facture',
    ancienneValeur: 'Statut: envoyee | Payé: 0 FCFA',
    nouvelleValeur: 'Statut: payee | Payé: 2 200 000 FCFA',
    restaurable: true,
  },
  {
    id: 'log011',
    utilisateurId: 'u5',
    utilisateurNom: 'Fouda Martin',
    utilisateurRole: 'associe',
    action: 'tentative_acces_refuse',
    module: 'Administration',
    description: 'Tentative d\'accès refusée — module Administration (permissions insuffisantes)',
    horodatage: new Date(Date.now() - 4 * 86400000).toISOString(),
    adresseIP: '41.202.207.14',
    restaurable: false,
  },
  {
    id: 'log012',
    utilisateurId: 'u2',
    utilisateurNom: 'Nkodo Jean-Pierre',
    utilisateurRole: 'avocat',
    action: 'creation_dossier',
    module: 'Dossiers',
    description: 'Ouverture du dossier AFF-2024-005 — Atangana Robert — Divorce et garde',
    horodatage: new Date(Date.now() - 7 * 86400000).toISOString(),
    adresseIP: '192.168.1.14',
    ressourceId: 'a6',
    ressourceType: 'Dossier',
    restaurable: true,
  },
];

export function ajouterLogCommentaire(nom: string, role: string, message: string): LogActivite {
  const newLog: LogActivite = {
    id: `log_com_${Date.now()}`,
    utilisateurId: 'u_user',
    utilisateurNom: nom || 'Utilisateur App',
    utilisateurRole: (role?.toLowerCase() as RoleKey) || 'avocat',
    action: 'commentaire_utilisateur',
    module: 'Administration',
    description: `💬 Commentaire utilisateur : "${message}"`,
    horodatage: new Date().toISOString(),
    adresseIP: '127.0.0.1',
    nouvelleValeur: message,
    restaurable: false,
  };
  journalActivites.unshift(newLog);
  return newLog;
}
