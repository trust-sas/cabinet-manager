/**
 * backend/scripts/migrate_to_remote.js
 * Script de migration complète du schéma et des données vers la base PostgreSQL distante.
 */
const { Client } = require('../node_modules/pg');

const LOCAL_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'cabinet_manager',
  user: process.env.DB_USER || 'cm_admin',
  password: process.env.DB_PASSWORD || 'devpassword123',
};

const REMOTE_URL = process.env.DATABASE_URL || 'postgresql://cabinetmanager-bd-users:kBNutg9GCKNpbsaJYTbY@72.60.89.36:7056/cabinetmanager-bd';

// Ordre d'insertion pour respecter les clés étrangères
const TABLES_ORDER = [
  'cabinets',
  'utilisateurs',
  'roles_acces',
  'clients',
  'dossiers',
  'audiences',
  'documents',
  'document_permissions',
  'factures',
  'encaissements',
  'journal_activite',
  'mots_de_passe_historique',
  'notifications',
  'dossier_invitations',
  'organisations',
  'organisation_membres',
  'organisation_join_requests',
  'organisation_dossiers',
  'organisation_clients',
  'refresh_tokens',
  'sync_log',
  'tentatives_connexion',
  'textes_lois',
];

async function runMigration() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🚀 DÉMARRAGE DE LA MIGRATION VERS LA BASE DE DONNÉES DISTANTE');
  console.log('═══════════════════════════════════════════════════════════════════');

  const localClient = new Client(LOCAL_CONFIG);
  const remoteClient = new Client({
    connectionString: REMOTE_URL,
    connectionTimeoutMillis: 15000,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('\n[1/5] Connexion à la base de données locale...');
    await localClient.connect();
    console.log('✅ Connecté à la base locale.');

    console.log('\n[2/5] Connexion à la base de données distante...');
    console.log('URL distante :', REMOTE_URL.replace(/:[^:@]+@/, ':****@'));
    await remoteClient.connect();
    console.log('✅ Connecté à la base distante.');

    console.log('\n[3/5] Extraction et création du schéma (DDL)...');

    // 0. Extensions
    await remoteClient.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`).catch(() => {});
    await remoteClient.query(`CREATE EXTENSION IF NOT EXISTS "unaccent";`).catch(() => {});

    // 1. Extraire et créer tous les types ENUM personnalisés
    console.log('  ⚙️ Création des types ENUM personnalisés...');
    const enumsRes = await localClient.query(`
      SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname;
    `);

    for (const enumRow of enumsRes.rows) {
      const rawVals = Array.isArray(enumRow.enum_values)
        ? enumRow.enum_values
        : String(enumRow.enum_values || '').replace(/^\{|\}$/g, '').split(',');
      const vals = rawVals.map(v => `'${v.trim().replace(/'/g, "''")}'`).join(', ');
      await remoteClient.query(`
        DO $$ BEGIN
          CREATE TYPE ${enumRow.typname} AS ENUM (${vals});
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
    }

    // Récupérer la liste de toutes les tables existantes locales
    const tablesRes = await localClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const allTables = tablesRes.rows.map(r => r.table_name);

    // Désactiver les triggers/clés étrangères temporairement sur la base distante
    await remoteClient.query(`SET session_replication_role = 'replica';`);

    // Pour chaque table, créer la table distante si elle n'existe pas
    for (const table of allTables) {
      // Récupérer les colonnes locales
      const colRes = await localClient.query(`
        SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);

      if (colRes.rows.length === 0) continue;

      // Créer la table si non existante
      const colDefs = colRes.rows.map(col => {
        let type = col.data_type;
        if (col.data_type === 'USER-DEFINED') {
          type = col.udt_name;
        } else if (col.data_type === 'character varying') {
          type = col.character_maximum_length ? `VARCHAR(${col.character_maximum_length})` : 'VARCHAR(255)';
        } else if (col.data_type === 'ARRAY') {
          type = `${col.udt_name.replace(/^_/, '')}[]`;
        }

        let def = `"${col.column_name}" ${type}`;
        if (col.column_default && !col.column_default.includes('nextval')) {
          def += ` DEFAULT ${col.column_default}`;
        }
        return def;
      });

      const createTableSql = `CREATE TABLE IF NOT EXISTS "${table}" (\n  ${colDefs.join(',\n  ')}\n);`;
      await remoteClient.query(createTableSql);
    }

    console.log('\n[4/5] Transfert des données table par table...');
    const tablesToMigrate = TABLES_ORDER.filter(t => allTables.includes(t))
      .concat(allTables.filter(t => !TABLES_ORDER.includes(t)));

    for (const table of tablesToMigrate) {
      process.stdout.write(`  ⏳ Migration de "${table}"... `);

      const countLocal = await localClient.query(`SELECT COUNT(*) as count FROM "${table}";`);
      const total = parseInt(countLocal.rows[0].count, 10);

      if (total === 0) {
        console.log('0 enregistrement (ignoré)');
        continue;
      }

      await remoteClient.query(`TRUNCATE TABLE "${table}" CASCADE;`);

      const BATCH_SIZE = 500;
      let offset = 0;

      while (offset < total) {
        const rowsRes = await localClient.query(`SELECT * FROM "${table}" LIMIT ${BATCH_SIZE} OFFSET ${offset};`);
        const rows = rowsRes.rows;
        if (rows.length === 0) break;

        const cols = Object.keys(rows[0]);
        const colsList = cols.map(c => `"${c}"`).join(', ');

        for (const row of rows) {
          const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
          const values = cols.map(c => row[c]);
          await remoteClient.query(
            `INSERT INTO "${table}" (${colsList}) VALUES (${placeholders});`,
            values
          );
        }

        offset += rows.length;
      }

      const countRemote = await remoteClient.query(`SELECT COUNT(*) as count FROM "${table}";`);
      console.log(`✅ ${countRemote.rows[0].count}/${total} enregistrements transférés.`);
    }

    await remoteClient.query(`SET session_replication_role = 'origin';`);

    console.log('\n[5/5] Réalignement des séquences d\'identifiants...');
    const seqRes = await remoteClient.query(`
      SELECT sequence_name, table_name, column_name
      FROM information_schema.sequences
      LEFT JOIN information_schema.columns 
        ON columns.column_default LIKE '%' || sequences.sequence_name || '%'
      WHERE sequences.sequence_schema = 'public';
    `);

    for (const seq of seqRes.rows) {
      if (seq.table_name && seq.column_name) {
        try {
          await remoteClient.query(`
            SELECT setval('"${seq.sequence_name}"', COALESCE((SELECT MAX("${seq.column_name}") FROM "${seq.table_name}"), 1) + 1, false);
          `);
        } catch (e) {
          // Ignore
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('🎉 MIGRATION VERS LA BASE DISTANTE TERMINÉE AVEC SUCCÈS !');
    console.log('═══════════════════════════════════════════════════════════════════');

  } catch (err) {
    console.error('\n❌ ERREUR LORS DE LA MIGRATION :', err.message);
    throw err;
  } finally {
    await localClient.end().catch(() => {});
    await remoteClient.end().catch(() => {});
  }
}

if (require.main === module) {
  runMigration().catch(() => process.exit(1));
}

module.exports = { runMigration };
