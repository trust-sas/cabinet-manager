/**
 * scripts/index-lois.js
 * Lit et indexe automatiquement TOUS les fichiers PDF du dossier `loi/`
 * dans la table PostgreSQL `textes_lois` (système RAG de l'Assistant IA).
 *
 * Usage : node scripts/index-lois.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

async function run() {
  const loiDir = path.join(__dirname, '..', '..', 'loi');
  if (!fs.existsSync(loiDir)) {
    console.error('❌ Repertoire loi/ introuvable à :', loiDir);
    return;
  }

  // Filtrer uniquement les fichiers .pdf (ignorer les .crdownload incomplets)
  const files = fs.readdirSync(loiDir).filter(f => f.endsWith('.pdf') && !f.endsWith('.crdownload'));
  console.log(`📚 ${files.length} fichiers PDF trouvés dans ${loiDir}`);

  const client = new Client({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'cabinet_manager',
    user:     process.env.DB_USER     || 'cm_admin',
    password: process.env.DB_PASSWORD || 'devpassword123',
  });

  await client.connect();
  console.log('🔗 Connecté à PostgreSQL pour l\'indexation RAG.');

  let totalChunks = 0;
  let newFilesCount = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filePath = path.join(loiDir, filename);

    try {
      // Supprimer les anciens extraits de ce fichier pour éviter les doublons lors de ré-indexation
      await client.query('DELETE FROM textes_lois WHERE nom_fichier = $1', [filename]);

      console.log(`[${i + 1}/${files.length}] Indexation de "${filename}"...`);
      const dataBuffer = fs.readFileSync(filePath);

      let rawText = '';
      try {
        const parser = new PDFParse({ data: dataBuffer });
        const parsedData = await parser.getText();
        rawText = parsedData?.text || '';
      } catch (parseErr) {
        console.warn(`  ⚠️ Erreur d'analyse PDF pour ${filename}: ${parseErr.message}`);
        continue;
      }

      if (!rawText.trim()) {
        console.warn(`  ⚠️ Fichier vide ou non lisible (scan/image ?) : ${filename}`);
        continue;
      }

      // Titre propre basé sur le nom du fichier
      const titleClean = filename
        .replace(/\.pdf$/i, '')
        .replace(/[^a-zA-Z0-9àâéèêëîïôùûçÀÂÉÈÊËÎÏÔÙÛÇ_\-]/g, ' ')
        .replace(/_/g, ' ')
        .trim();

      // Découper le texte en sections d'environ 1200 caractères
      const maxChunkLength = 1200;
      const paragraphs = rawText.split(/\n\s*\n/);
      let currentChunk = '';
      let chunkIndex = 1;

      for (const para of paragraphs) {
        const cleanedPara = para.replace(/\s+/g, ' ').trim();
        if (!cleanedPara) continue;

        if ((currentChunk.length + cleanedPara.length) > maxChunkLength && currentChunk.length > 150) {
          await client.query(
            `INSERT INTO textes_lois (titre_loi, nom_fichier, section_titre, contenu)
             VALUES ($1, $2, $3, $4)`,
            [titleClean, filename, `Section ${chunkIndex}`, currentChunk.trim()]
          );
          totalChunks++;
          chunkIndex++;
          currentChunk = cleanedPara;
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + cleanedPara;
        }
      }

      if (currentChunk.trim().length > 80) {
        await client.query(
          `INSERT INTO textes_lois (titre_loi, nom_fichier, section_titre, contenu)
           VALUES ($1, $2, $3, $4)`,
          [titleClean, filename, `Section ${chunkIndex}`, currentChunk.trim()]
        );
        totalChunks++;
      }

      newFilesCount++;
      console.log(`  ✓ INDEXÉ : ${chunkIndex} section(s) extraite(s)`);

    } catch (err) {
      console.error(`  ❌ Erreur lors de l'indexation de ${filename}:`, err.message);
    }
  }

  const countRes = await client.query('SELECT COUNT(*) FROM textes_lois');
  const totalInDb = countRes.rows[0].count;

  console.log(`\n🎉 INDEXATION RAG DU RÉPERTOIRE LOI TERMINÉE AVEC SUCCÈS !`);
  console.log(`📊 ${newFilesCount} fichiers PDF traités.`);
  console.log(`📚 Total des extraits de lois enregistrés en BDD : ${totalInDb}`);

  await client.end();
}

run().catch(console.error);
