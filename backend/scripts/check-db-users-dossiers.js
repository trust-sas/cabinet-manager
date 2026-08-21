/**
 * scripts/check-db-users-dossiers.js
 * Vérifie tous les cabinets, utilisateurs et dossiers en BDD
 */
const { Client } = require('pg');

async function run() {
  const client = new Client({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'cabinet_manager',
    user:     process.env.DB_USER     || 'cm_admin',
    password: process.env.DB_PASSWORD || 'devpassword123',
  });

  await client.connect();

  console.log('--- CABINETS ---');
  const cabs = await client.query('SELECT id, nom FROM cabinets');
  console.table(cabs.rows);

  console.log('--- UTILISATEURS ---');
  const users = await client.query('SELECT id, cabinet_id, email, nom, role FROM utilisateurs WHERE deleted_at IS NULL');
  console.table(users.rows);

  console.log('--- DOSSIERS ---');
  const dos = await client.query('SELECT id, cabinet_id, numero_affaire, titre, statut FROM dossiers WHERE deleted_at IS NULL');
  console.table(dos.rows);

  await client.end();
}

run().catch(console.error);
