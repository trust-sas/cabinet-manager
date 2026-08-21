/**
 * scripts/apply-migration-007.js
 * Applique la migration 007 : table textes_lois pour le RAG juridique.
 * Usage : node scripts/apply-migration-007.js
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  const client = new Client({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'cabinet_manager',
    user:     process.env.DB_USER     || 'cm_admin',
    password: process.env.DB_PASSWORD || 'devpassword123',
  });

  await client.connect();
  console.log('🔗 Connecté à PostgreSQL.');

  const sqlPath = path.join(__dirname, '..', 'migrations', 'migration_007_textes_lois.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  try {
    await client.query(sql);
    console.log('✅ Migration 007 appliquée avec succès (table `textes_lois`).');
  } catch (err) {
    console.error('❌ Erreur lors de la migration :', err.message);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
