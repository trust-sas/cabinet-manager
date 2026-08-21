/**
 * Script utilitaire : ajoute des numéros de téléphone aux utilisateurs existants
 * pour permettre la connexion par téléphone.
 * 
 * Exécuter : node backend/scripts/seed_phone_numbers.js
 */
const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'cm_admin',
  password: 'devpassword123',
  database: 'cabinet_manager',
});

const phoneMap = [
  { id: 1,  telephone: '+237600000001' }, // Administrateur Système
  { id: 6,  telephone: '+237600000006' }, // Momo
  { id: 7,  telephone: '+237600000007' }, // Avocat Test
  { id: 9,  telephone: '+237600000009' }, // Berenger
  { id: 10, telephone: '+237600000010' }, // Stéphane Momo
  { id: 12, telephone: '+237600000012' }, // Avocat Google
  { id: 13, telephone: '+237600000013' }, // Testeur Avocat
  { id: 14, telephone: '+237600000014' }, // Second Avocat
];

async function seed() {
  await client.connect();
  console.log('✅ Connecté à PostgreSQL');

  for (const u of phoneMap) {
    const result = await client.query(
      'UPDATE utilisateurs SET telephone = $1 WHERE id = $2 AND telephone IS NULL',
      [u.telephone, u.id],
    );
    if (result.rowCount > 0) {
      console.log(`✅ id=${u.id} → ${u.telephone}`);
    } else {
      console.log(`ℹ️  id=${u.id} → déjà un numéro ou introuvable`);
    }
  }

  const { rows } = await client.query(
    'SELECT id, nom, telephone, email, role FROM utilisateurs ORDER BY id',
  );
  console.log('\n📋 État final des utilisateurs :');
  rows.forEach(r => {
    console.log(`  [${r.id}] ${r.nom} | tel: ${r.telephone || 'null'} | email: ${r.email || 'null'} | rôle: ${r.role}`);
  });

  await client.end();
  console.log('\n🎉 Terminé !');
}

seed().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
