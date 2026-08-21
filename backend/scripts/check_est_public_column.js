const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'cabinet_manager',
    user: 'cm_admin',
    password: 'devpassword123',
  });

  try {
    await client.connect();
    console.log('Connecté à la BDD PostgreSQL...');

    await client.query(`
      ALTER TABLE dossiers
      ADD COLUMN IF NOT EXISTS est_public BOOLEAN DEFAULT TRUE;
    `);
    console.log('✓ Colonne est_public vérifiée / ajoutée à la table dossiers.');

    await client.query(`
      UPDATE dossiers SET est_public = TRUE WHERE est_public IS NULL;
    `);
    console.log('✓ Dossiers existants mis à jour avec est_public = TRUE.');

  } catch (err) {
    console.error('Erreur SQL:', err);
  } finally {
    await client.end();
  }
}

main();
