/**
 * Migration : ajout des colonnes téléphone dans la table dossier_invitations
 * et rendre inviteur_email / destinataire_email nullable (compatibilité)
 * 
 * Exécuter : node backend/scripts/migrate_invitations_phone.js
 */
const { Client } = require('pg');

const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'cabinet_manager',
});

async function migrate() {
  await client.connect();
  console.log('✅ Connecté à PostgreSQL');

  try {
    // 1. Ajouter colonne inviteur_telephone
    await client.query(`
      ALTER TABLE dossier_invitations
      ADD COLUMN IF NOT EXISTS inviteur_telephone VARCHAR(50) NULL;
    `);
    console.log('✅ Colonne inviteur_telephone ajoutée');

    // 2. Ajouter colonne destinataire_telephone
    await client.query(`
      ALTER TABLE dossier_invitations
      ADD COLUMN IF NOT EXISTS destinataire_telephone VARCHAR(50) NULL;
    `);
    console.log('✅ Colonne destinataire_telephone ajoutée');

    // 3. Rendre inviteur_email nullable (si pas déjà)
    await client.query(`
      ALTER TABLE dossier_invitations
      ALTER COLUMN inviteur_email DROP NOT NULL;
    `).catch(() => console.log('ℹ️  inviteur_email déjà nullable'));

    // 4. Rendre destinataire_email nullable (si pas déjà)
    await client.query(`
      ALTER TABLE dossier_invitations
      ALTER COLUMN destinataire_email DROP NOT NULL;
    `).catch(() => console.log('ℹ️  destinataire_email déjà nullable'));

    // 5. Index sur destinataire_telephone pour les recherches rapides
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inv_dest_tel ON dossier_invitations (destinataire_telephone);
    `);
    console.log('✅ Index idx_inv_dest_tel créé');

    // 6. Index sur inviteur_telephone
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inv_inv_tel ON dossier_invitations (inviteur_telephone);
    `);
    console.log('✅ Index idx_inv_inv_tel créé');

    // 7. Remplir les téléphones depuis la table utilisateurs (données existantes)
    await client.query(`
      UPDATE dossier_invitations di
      SET inviteur_telephone = u.telephone
      FROM utilisateurs u
      WHERE di.inviteur_id = u.id
        AND di.inviteur_telephone IS NULL
        AND u.telephone IS NOT NULL;
    `);
    console.log('✅ Téléphones inviteurs remplis depuis utilisateurs');

    await client.query(`
      UPDATE dossier_invitations di
      SET destinataire_telephone = u.telephone
      FROM utilisateurs u
      WHERE di.destinataire_id = u.id
        AND di.destinataire_telephone IS NULL
        AND u.telephone IS NOT NULL;
    `);
    console.log('✅ Téléphones destinataires remplis depuis utilisateurs');

    console.log('\n🎉 Migration terminée avec succès !');
  } catch (err) {
    console.error('❌ Erreur de migration :', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
