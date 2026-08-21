const { Client } = require('pg');
const argon2 = require('argon2');

async function reset() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'cabinet_manager',
    user: 'cm_admin',
    password: 'devpassword123',
  });
  await client.connect();
  const hash = await argon2.hash('Password123!');
  await client.query('UPDATE utilisateurs SET mot_de_passe_hash = $1 WHERE email = $2', [hash, 'avocat.test@cabinet.cm']);
  console.log('SUCCESSFULLY RESET PASSWORD FOR avocat.test@cabinet.cm!');
  await client.end();
}

reset();
