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

    // Ajouter la colonne telephone à la table utilisateurs si nécessaire
    await client.query(`
      ALTER TABLE utilisateurs
      ADD COLUMN IF NOT EXISTS telephone VARCHAR(50);
    `);
    console.log('✓ Colonne telephone vérifiée/ajoutée à utilisateurs.');

    // Rendre la colonne email NULLABLE
    await client.query(`
      ALTER TABLE utilisateurs
      ALTER COLUMN email DROP NOT NULL;
    `);
    console.log('✓ Colonne email rendue optionnelle (NULLABLE).');

  } catch (err) {
    console.error('Erreur SQL:', err);
  } finally {
    await client.end();
  }
}

main();
