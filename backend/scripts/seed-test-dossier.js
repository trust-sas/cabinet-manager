/**
 * scripts/seed-test-dossier.js
 * Crée le dossier de test pour TOUS les utilisateurs actifs du cabinet principal.
 * Chaque dossier a un numéro d'affaire unique par utilisateur (ex: DOS-2026-7279-U1, DOS-2026-7279-U6).
 *
 * Usage : node scripts/seed-test-dossier.js
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
  console.log('🔗 Connecté à la base de données PostgreSQL.');

  try {
    // 1. Récupérer le cabinet principal
    const cabRes = await client.query('SELECT id FROM cabinets ORDER BY id LIMIT 1');
    if (cabRes.rows.length === 0) {
      throw new Error('Aucun cabinet trouvé.');
    }
    const cabinetId = cabRes.rows[0].id;

    // Récupérer TOUS les utilisateurs actifs du cabinet
    const usersRes = await client.query('SELECT id, nom, email FROM utilisateurs WHERE cabinet_id = $1 AND deleted_at IS NULL', [cabinetId]);
    const users = usersRes.rows;

    if (users.length === 0) {
      throw new Error('Aucun utilisateur dans le cabinet.');
    }

    console.log(`📌 Enregistrement des dossiers de test pour ${users.length} utilisateur(s) du cabinet #${cabinetId}...`);

    // 2. Créer ou récupérer le client test
    let clientId;
    const clientCheck = await client.query('SELECT id FROM clients WHERE cabinet_id = $1 AND nom_complet LIKE $2 LIMIT 1', [cabinetId, '%AFRIQUE-NEGOCE%']);
    if (clientCheck.rows.length > 0) {
      clientId = clientCheck.rows[0].id;
    } else {
      const clientIns = await client.query(
        `INSERT INTO clients (cabinet_id, nom_complet, telephone, email, version)
         VALUES ($1, 'Société Commerciale AFRIQUE-NEGOCE S.A.', '+237 699 12 34 56', 'litiges@afrique-negoce.cm', 1)
         RETURNING id`,
        [cabinetId]
      );
      clientId = clientIns.rows[0].id;
    }
    console.log(`✅ Client "Société Commerciale AFRIQUE-NEGOCE S.A." (ID #${clientId})`);

    // 3. Pour CHAQUE utilisateur du cabinet, s'assurer qu'il possède le dossier de test
    for (const u of users) {
      const numAff = u.id === '1' ? 'DOS-2026-7279' : `DOS-2026-7279-U${u.id}`;

      const dossierCheck = await client.query(
        'SELECT id FROM dossiers WHERE cabinet_id = $1 AND avocat_responsable_id = $2 AND deleted_at IS NULL LIMIT 1',
        [cabinetId, u.id]
      );

      let dossierId;
      if (dossierCheck.rows.length > 0) {
        dossierId = dossierCheck.rows[0].id;
        console.log(`✓ Dossier déjà présent pour ${u.nom} (${u.email}) -> ID #${dossierId}`);
      } else {
        const dosIns = await client.query(
          `INSERT INTO dossiers (
             cabinet_id, client_id, avocat_responsable_id, numero_affaire, titre,
             statut, date_ouverture, juridiction, notes, version
           )
           VALUES ($1, $2, $3, $4, $5, 'Ouvert', CURRENT_DATE, $6, $7, 1)
           RETURNING id`,
          [
            cabinetId,
            clientId,
            u.id,
            numAff,
            'Contentieux Commercial & Recouvrement (35.000.000 FCFA)',
            'Tribunal de Grande Instance de Douala-Bonanjo',
            'Litige relatif au non-paiement de 3 livraisons de marchandises sous contrat de distribution exclusive (Acte Uniforme OHADA).',
          ]
        );
        dossierId = dosIns.rows[0].id;
        console.log(`✅ Dossier créé pour ${u.nom} (${u.email}) -> Numéro: ${numAff} (ID #${dossierId})`);
      }

      // S'assurer que les audiences existent pour ce dossier
      const audCheck = await client.query('SELECT COUNT(*) FROM audiences WHERE dossier_id = $1', [dossierId]);
      if (parseInt(audCheck.rows[0].count, 10) === 0) {
        await client.query(
          `INSERT INTO audiences (cabinet_id, dossier_id, date_audience, heure, juridiction, salle, type_audience, statut, notes, version)
           VALUES 
           ($1, $2, NOW() + INTERVAL '12 days', '09:00', 'TGI Douala-Bonanjo', 'Salle 3B', 'Mise en état', 'prevue', 'Vérification du dépôt du bordereau des 6 pièces justificatives.', 1),
           ($1, $2, NOW() + INTERVAL '30 days', '10:30', 'TGI Douala-Bonanjo', 'Grande Salle', 'Plaidoiries', 'prevue', 'Plaidoiries sur les conclusions en demande et 5.000.000 FCFA de dommages-intérêts.', 1)`,
          [cabinetId, dossierId]
        );
      }

      // S'assurer que les documents GED existent pour ce dossier
      const docCheck = await client.query('SELECT COUNT(*) FROM documents WHERE dossier_id = $1', [dossierId]);
      if (parseInt(docCheck.rows[0].count, 10) === 0) {
        await client.query(
          `INSERT INTO documents (cabinet_id, dossier_id, nom, type_document, chemin_fichier, taille_ko, confidentialite, description, cree_par_id, version)
           VALUES 
           ($1, $2, 'Contrat_Cadre_Distribution_OHADA.pdf', 'Contrat', '/docs/contrat_01.pdf', 1250, 'public', 'Contrat initial de distribution exclusive fixant les conditions de règlement à 30 jours.', $3, 1),
           ($1, $2, 'Bordereau_Pieces_Justificatives_01_a_06.pdf', 'Bordereau', '/docs/bordereau.pdf', 840, 'public', 'Lot des 3 factures impayées, bon de livraison signé et accusés de réception.', $3, 1),
           ($1, $2, 'Sommation_de_Payer_Huissier_Signee.pdf', 'Acte d Huissier', '/docs/sommation.pdf', 520, 'confidentiel', 'Exploit d huissier de justice signifié au débiteur avec commandement de payer.', $3, 1),
           ($1, $2, 'Conclusions_En_Demande_Finales.pdf', 'Conclusions', '/docs/conclusions.pdf', 960, 'public', 'Conclusions sollicitant la condamnation solidaire au principal et 5.000.000 FCFA de dommages.', $3, 1)`,
          [cabinetId, dossierId, u.id]
        );
      }

      // S'assurer que les factures existent pour ce dossier
      const factCheck = await client.query('SELECT COUNT(*) FROM factures WHERE dossier_id = $1', [dossierId]);
      if (parseInt(factCheck.rows[0].count, 10) === 0) {
        const numFact = `FACT-2026-${u.id}-${Math.floor(100 + Math.random() * 900)}`;
        await client.query(
          `INSERT INTO factures (cabinet_id, dossier_id, client_id, numero_facture, date_emission, date_echeance, montant_ht, taux_tva, montant_ttc, montant_encaisse, statut, description, version)
           VALUES ($1, $2, $3, $4, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 2500000.00, 19.25, 2981250.00, 1500000.00, 'partielle', 'Honoraires de procédure contentieuse et rédaction des conclusions', 1)`,
          [cabinetId, dossierId, clientId, numFact]
        );
      }
    }

    console.log('\n🎉 SCRIPT TERMINÉ AVEC SUCCÈS !');
    console.log('👉 Les dossiers de test sont désormais enregistrés pour TOUS les comptes du cabinet.');

  } catch (err) {
    console.error('❌ Erreur :', err.message);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
