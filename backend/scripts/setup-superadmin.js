/**
 * scripts/setup-superadmin.js
 * 1. Ajoute les colonnes prenom, telephone, date_naissance à la table `utilisateurs`
 * 2. Supprime tous les anciens comptes Assistants
 * 3. Configure le compte SuperAdmin : stephanemomosm@gmail.com / Trustsarl12
 */

const { Client } = require('pg');
const argon2 = require('argon2');

async function run() {
  const client = new Client({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'cabinet_manager',
    user:     process.env.DB_USER     || 'cm_admin',
    password: process.env.DB_PASSWORD || 'devpassword123',
  });

  await client.connect();
  console.log('🔗 Connecté à PostgreSQL pour la mise à jour des rôles et comptes.');

  // 1. Ajouter les nouvelles colonnes si elles n'existent pas encore
  await client.query(`
    ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS prenom VARCHAR(150);
    ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS telephone VARCHAR(50);
    ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS date_naissance VARCHAR(50);
  `);
  console.log('✅ Colonnes prenom, telephone, date_naissance vérifiées.');

  // 2. Supprimer les comptes Assistants
  const delRes = await client.query(`DELETE FROM utilisateurs WHERE LOWER(role::text) = 'assistant'`);
  console.log(`🗑️ ${delRes.rowCount} compte(s) Assistant supprimé(s).`);

  // 3. Créer ou Mettre à jour le compte SuperAdmin
  const superEmail = 'stephanemomosm@gmail.com';
  const superPass = 'Trustsarl12';
  const hash = await argon2.hash(superPass);

  // Vérifier si stephanemomosm@gmail.com existe déjà
  const existing = await client.query(`SELECT id FROM utilisateurs WHERE LOWER(email) = LOWER($1)`, [superEmail]);

  if (existing.rows.length > 0) {
    await client.query(`
      UPDATE utilisateurs
      SET nom = 'Stéphane Momo',
          prenom = 'SuperAdmin',
          mot_de_passe_hash = $1,
          role = 'Administrateur',
          actif = true
      WHERE LOWER(email) = LOWER($2)
    `, [hash, superEmail]);
    console.log(`👑 Compte SuperAdmin (${superEmail}) mis à jour avec le mot de passe Trustsarl12.`);
  } else {
    // Insérer le nouveau compte SuperAdmin
    await client.query(`
      INSERT INTO utilisateurs (cabinet_id, role_acces_id, nom, prenom, email, mot_de_passe_hash, role, actif)
      VALUES (1, 1, 'Stéphane Momo', 'SuperAdmin', $1, $2, 'Administrateur', true)
    `, [superEmail, hash]);
    console.log(`👑 Compte SuperAdmin (${superEmail}) créé avec le mot de passe Trustsarl12 !`);
  }

  // 4. Mettre à jour le compte admin@cabinetmanager.cm avec le même accès admin si besoin
  await client.query(`
    UPDATE utilisateurs
    SET mot_de_passe_hash = $1, actif = true
    WHERE LOWER(email) = 'admin@cabinetmanager.cm'
  `, [hash]);

  await client.end();
  console.log('🎉 Configuration SuperAdmin terminée avec succès !');
}

run().catch(console.error);
