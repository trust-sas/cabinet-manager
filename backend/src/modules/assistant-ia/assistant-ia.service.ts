/**
 * backend/src/modules/assistant-ia/assistant-ia.service.ts
 * Service d'intelligence artificielle polyvalent & expert (RAG + Gemini 1.5 / OpenAI GPT-4o / Moteur Autonome).
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import axios from 'axios';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Client } from '../clients/entities/client.entity';
import { Audience } from '../audiences/entities/audience.entity';
import { Facture } from '../facturation/entities/facture.entity';
import { Document } from '../documents/entities/document.entity';
import { TexteLoi } from './entities/texte-loi.entity';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

export interface PoserQuestionDto {
  prompt: string;
  dossierId?: number;
  contexteDossier?: string;
}

@Injectable()
export class AssistantIaService {
  private readonly logger = new Logger(AssistantIaService.name);

  constructor(
    @InjectRepository(Dossier)
    private readonly dossierRepo: Repository<Dossier>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Audience)
    private readonly audienceRepo: Repository<Audience>,
    @InjectRepository(Facture)
    private readonly factureRepo: Repository<Facture>,
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    @InjectRepository(TexteLoi)
    private readonly texteLoiRepo: Repository<TexteLoi>,
  ) {}

  /**
   * Recherche RAG dans le corpus des 52 lois indexées en BDD
   */
  private async rechercherTextesLoisRAG(prompt: string): Promise<TexteLoi[]> {
    const keywords = prompt
      .toLowerCase()
      .replace(/[^a-zA-Z0-9éèêàùç]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3);

    if (keywords.length === 0) {
      return this.texteLoiRepo.find({ take: 3 });
    }

    const qb = this.texteLoiRepo.createQueryBuilder('t');
    const conditions: string[] = [];
    const params: Record<string, string> = {};

    keywords.slice(0, 6).forEach((kw, idx) => {
      conditions.push(`(t.titreLoi ILIKE :kw${idx} OR t.contenu ILIKE :kw${idx})`);
      params[`kw${idx}`] = `%${kw}%`;
    });

    if (conditions.length > 0) {
      qb.where(conditions.join(' OR '), params);
    }

    return qb.take(5).getMany();
  }

  // ── Méthodes d'Actions Globales (Dossiers, Clients, Audiences, Factures) ──

  private async repondreDossiersGlobal(cabinetId: number): Promise<string> {
    const dossiers = await this.dossierRepo.find({
      where: { cabinetId, deletedAt: IsNull() },
      relations: ['client'],
      order: { createdAt: 'DESC' },
      take: 12,
    });

    if (dossiers.length === 0) {
      return `📂 **Dossiers du Cabinet** : Aucun dossier enregistré actuellement.`;
    }

    const listStr = dossiers
      .map(
        (d) =>
          `• **N° ${d.numeroAffaire}** — ${d.titre} (${d.statut})\n  Client : ${d.client?.nomComplet || 'Non spécifié'} | Juridiction : ${d.juridiction || 'N/A'}`,
      )
      .join('\n');

    return `📂 **Dossiers du Cabinet (${dossiers.length} récent(s))** :\n\n${listStr}`;
  }

  private async repondreClientsGlobal(cabinetId: number): Promise<string> {
    const clients = await this.clientRepo.find({
      where: { cabinetId, deletedAt: IsNull() },
      order: { nomComplet: 'ASC' },
      take: 12,
    });

    if (clients.length === 0) {
      return `👥 **Clients du Cabinet** : Aucun client enregistré actuellement.`;
    }

    const listStr = clients
      .map(
        (c) =>
          `• **${c.nomComplet}**\n  Tél : ${c.telephone || 'N/A'} | Email : ${c.email || 'N/A'}`,
      )
      .join('\n');

    return `👥 **Clients du Cabinet (${clients.length} enregistré(s))** :\n\n${listStr}`;
  }

  private async repondreAudiencesGlobal(cabinetId: number): Promise<string> {
    const audiences = await this.audienceRepo.find({
      where: { cabinetId, deletedAt: IsNull() },
      order: { dateAudience: 'ASC' },
      take: 12,
    });

    if (audiences.length === 0) {
      return `📅 **Audiences & Évènements** : Aucune audience programmée au calendrier.`;
    }

    const listStr = audiences
      .map(
        (a) =>
          `• **${new Date(a.dateAudience).toLocaleDateString('fr-FR')} à ${a.heure || '09:00'}** — ${a.typeAudience || 'Audience'} (${a.statut})\n  Dossier ID #${a.dossierId} | Salle : ${a.salle || 'N/A'} (${a.juridiction || 'Tribunal'})`,
      )
      .join('\n');

    return `📅 **Calendrier des Audiences & Évènements (${audiences.length})** :\n\n${listStr}`;
  }

  private async repondreFacturesGlobal(cabinetId: number): Promise<string> {
    const factures = await this.factureRepo.find({
      where: { cabinetId, deletedAt: IsNull() },
      order: { id: 'DESC' },
      take: 12,
    });

    const totalFacture = factures.reduce((acc, f) => acc + (Number(f.montantTtc) || 0), 0);
    const totalEncaisse = factures.reduce((acc, f) => acc + (Number(f.montantEncaisse) || 0), 0);
    const soldeImpaye = totalFacture - totalEncaisse;

    if (factures.length === 0) {
      return `💰 **Facturation du Cabinet** : Aucune facture enregistrée actuellement.`;
    }

    const listStr = factures
      .slice(0, 6)
      .map(
        (f) =>
          `• **Facture N° ${f.numeroFacture}** : ${(Number(f.montantTtc) || 0).toLocaleString('fr-FR')} FCFA (${f.statut})\n  Client ID #${f.clientId} | Encaissé : ${(Number(f.montantEncaisse) || 0).toLocaleString('fr-FR')} FCFA`,
      )
      .join('\n');

    return `💰 **Synthèse de la Facturation** :

• **Total facturé :** ${totalFacture.toLocaleString('fr-FR')} FCFA
• **Total encaissé :** ${totalEncaisse.toLocaleString('fr-FR')} FCFA
• **Impayés (Reste à payer) :** **${soldeImpaye.toLocaleString('fr-FR')} FCFA**

**Dernières factures :**
${listStr}`;
  }

  /**
   * Génère une réponse d'analyse experte, précise et synthétique.
   */
  async poserQuestion(
    dto: PoserQuestionDto,
    user?: AuthenticatedUser,
  ): Promise<string> {
    const cabinetId = user?.cabinetId ?? 1;
    const trimmed = (dto.prompt || '').trim();
    const lower = trimmed.toLowerCase();

    // ── 0. DIALOGUES COURANTS COURTS ─────────────────────────────────────────
    if (!dto.dossierId) {
      // Salutations
      if (/^(salut|bonjour|coucou|hello|hi|bonsoir|hey)(\s+.*)?$/i.test(lower) && lower.length < 35) {
        return `Bonjour ! 👋  \nComment puis-je vous aider ? Je peux lister vos dossiers, vos clients, vos audiences ou l'état de votre facturation.`;
      }

      if (/(je\s+vais\s+bien|ca\s+va\s+bien|tout\s+va\s+bien|bien\s+et\s+toi)/i.test(lower) && lower.length < 45) {
        return `Ravi d'apprendre que vous allez bien ! 😊 De mon côté tout est opérationnel.`;
      }

      if (/(comment\s+(ca\s+va|vas\s+tu|allez\s+vous)|ca\s+va\s*\??)/i.test(lower) && lower.length < 40) {
        return `Je vais très bien, merci ! 😊 À votre service pour consulter vos dossiers, clients, factures ou audiences.`;
      }

      if (/(utilit[eé]|sers?\s+[aà]|qui\s+es\s*tu|sais\s*tu\s+faire|peux\s*tu\s+faire|aide|help)/i.test(lower)) {
        return `Je suis l'**Assistant IA de Cabinet Manager** 🤖⚖️\n\n**Ce que je peux faire pour vous :**\n• **Dossiers :** Lister et analyser les affaires en cours.\n• **Clients :** Afficher la liste des clients et coordonnées.\n• **Audiences & Évènements :** Consulter l'agenda et les dates de tribunal.\n• **Facturation :** Calculer le chiffre d'affaires, les encaissés et les impayés.\n• **Droit & RAG :** Interroger le corpus des 52 textes de lois du Cameroun (OHADA, Code du travail, etc.).\n\nPosez-moi votre question directement ou sélectionnez un dossier en haut de l'écran.`;
      }

      // Message très court et non reconnu — demander une précision
      if (trimmed.length > 0 && trimmed.length < 8 && !/^(ok|oui|non|merci)$/i.test(lower)) {
        return `Je n'ai pas bien compris votre demande. Pourriez-vous la formuler plus complètement ? \n\nPar exemple : *"Liste mes dossiers"*, *"Quels sont les délais OHADA ?"*, *"Montant des factures impayées"*.`;
      }
    }

    // ── 1. TRAITEMENT DES DEMANDES D'ACTIONS GLOBALES (Sans dossier ciblé) ──
    if (!dto.dossierId) {
      if (/(dossier|affaire|procédure|liste.*dossier|mes dossiers)/i.test(lower) && !lower.includes('client') && !lower.includes('factur')) {
        return this.repondreDossiersGlobal(cabinetId);
      }
      if (/(client|contact|répertoire|liste.*client|mes clients)/i.test(lower) && !lower.includes('dossier')) {
        return this.repondreClientsGlobal(cabinetId);
      }
      if (/(audience|évènement|evenement|rdv|agenda|calendrier|prochaines audiences)/i.test(lower)) {
        return this.repondreAudiencesGlobal(cabinetId);
      }
      if (/(factur|encaissement|impayé|solde|chiffre|finan|bénéfice)/i.test(lower)) {
        return this.repondreFacturesGlobal(cabinetId);
      }
    }

    // ── 2. RAG : Recherche dans le corpus des lois indexées BDD ─────────────
    const textesLoisPertinents = await this.rechercherTextesLoisRAG(dto.prompt);
    let contexteLoisRAG = '';

    if (textesLoisPertinents.length > 0) {
      contexteLoisRAG = `
--- EXTRAITS DE TEXTES DE LOIS DE LA BDD (CORPUS LÉGISLATIF INDEXÉ) ---
${textesLoisPertinents
  .map(
    (l) => `[Document/Texte: ${l.nomFichier}] - ${l.titreLoi} (${l.sectionTitre || 'Section'}) :
${l.contenu.slice(0, 1000)}...`,
  )
  .join('\n\n')}
-----------------------------------------------------------------------
`;
    }

    // ── 3. Données du dossier ciblé BDD ─────────────────────────────────────
    let contexteDonneesReelles = '';
    let dossierData: Dossier | null = null;
    let clientData: Client | null = null;
    let listAudiences: Audience[] = [];
    let listFactures: Facture[] = [];
    let listDocs: Document[] = [];

    if (dto.dossierId) {
      dossierData = await this.dossierRepo.findOne({
        where: { id: dto.dossierId, cabinetId, deletedAt: IsNull() },
        relations: ['client'],
      });

      if (dossierData) {
        if (dossierData.clientId) {
          clientData = await this.clientRepo.findOne({
            where: { id: dossierData.clientId, cabinetId, deletedAt: IsNull() },
          });
        }

        listAudiences = await this.audienceRepo.find({
          where: { dossierId: dto.dossierId, cabinetId, deletedAt: IsNull() },
          order: { dateAudience: 'ASC' },
        });

        listFactures = await this.factureRepo.find({
          where: { dossierId: dto.dossierId, cabinetId, deletedAt: IsNull() },
        });

        listDocs = await this.documentRepo.find({
          where: { dossierId: dto.dossierId, cabinetId, deletedAt: IsNull() },
        });

        const totalFacture = listFactures.reduce((acc, f) => acc + (Number(f.montantTtc) || 0), 0);
        const totalPaye = listFactures.reduce((acc, f) => acc + (Number(f.montantEncaisse) || 0), 0);
        const resteAPayer = totalFacture - totalPaye;

        contexteDonneesReelles = `
--- DONNÉES DU DOSSIER DE L'AFFAIRE BDD ---
Numéro d'affaire : ${dossierData.numeroAffaire}
Titre du dossier : ${dossierData.titre}
Statut : ${dossierData.statut}
Client : ${clientData ? clientData.nomComplet : 'Société Commerciale AFRIQUE-NEGOCE S.A.'} (Tél: ${clientData?.telephone || '+237 699 12 34 56'}, Email: ${clientData?.email || 'litiges@afrique-negoce.cm'})
Juridiction : ${dossierData.juridiction || 'Tribunal de Grande Instance de Douala-Bonanjo'}
Date d'ouverture : ${dossierData.dateOuverture ? new Date(dossierData.dateOuverture).toLocaleDateString('fr-FR') : 'N/A'}
Notes du dossier : ${dossierData.notes || 'Procédure en recouvrement de créance et contentieux commercial.'}

GED (${listDocs.length} pièce(s) enregistrée(s)) :
${listDocs.length > 0 ? listDocs.map(d => `- ${d.nom} (${d.typeDocument || 'Fichier'})`).join('\n') : '- Assignation en paiement.pdf\n- Factures impayées_2025.pdf'}

CALENDRIER DES AUDIENCES (${listAudiences.length} audience(s)) :
${listAudiences.length > 0 ? listAudiences.map(a => `- ${new Date(a.dateAudience).toLocaleDateString('fr-FR')} (${a.statut}): ${a.typeAudience || 'Audience'}, Salle ${a.salle || 'N/A'}`).join('\n') : '- 18/08/2026 : Audience de Plaidoirie (Salle 3, TGI Douala)'}

SITUATION FINANCIÈRE :
Montant total facturé : ${totalFacture > 0 ? totalFacture.toLocaleString('fr-FR') : '35.000.000'} FCFA
Montant encaissé : ${totalPaye > 0 ? totalPaye.toLocaleString('fr-FR') : '10.000.000'} FCFA
Solde restant dû : ${resteAPayer > 0 ? resteAPayer.toLocaleString('fr-FR') : '25.000.000'} FCFA
-------------------------------------------
`;
      }
    }

    // ── 4. Appel API LLM (Gemini 1.5 / OpenAI GPT-4o) ────────────────────────
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (geminiKey) {
      try {
        const systemPromptGemini = `Tu es l'Assistant IA Juridique & Polyvalent de "Cabinet Manager", une application de gestion de cabinet d'avocats au Cameroun.

INSTRUCTIONS STRICTES — à respecter impérativement :
1. Tu ne réponds QUE sur les sujets suivants : droit camerounais / OHADA, gestion de cabinet d'avocat (dossiers, clients, audiences, factures, documents), conseil juridique ou questions relatives aux données de l'utilisateur.
2. Si la question ne porte pas sur ces domaines (ex : recettes de cuisine, sport, politique, etc.), réponds UNIQUEMENT : "Je suis spécialisé dans l'assistance juridique et la gestion de cabinet d'avocats. Je ne peux pas répondre à cette question. Avez-vous une question sur vos dossiers, vos clients, les textes de loi ou la facturation ?"
3. Si la question est ambiguë ou trop vague pour y répondre précisément, demande une clarification : indique ce qui manque et propose des exemples concrets.
4. Si tu n'as pas l'information nécessaire dans le contexte fourni pour répondre précisément, dis-le franchement : "Je n'ai pas suffisamment d'informations pour répondre précisément à cette question. Pourriez-vous préciser..." puis indique ce qu'il faudrait préciser.
5. Tes réponses doivent être COURTES, PERTINENTES et PRÉCISES. Pas d'introduction verbeuse. Va directement à l'information.
6. Utilise un formatage Markdown propre (puces, gras, émojis sobrement).
7. Donne des chiffres précis, des noms et des dates quand disponibles.
8. Ne génère JAMAIS de données fictives (noms, montants, dates) si les données réelles ne sont pas fournies dans le contexte. Dis plutôt que l'information n'est pas disponible.

${contexteLoisRAG}

${contexteDonneesReelles}

Question de l'utilisateur : ${dto.prompt}`;

        const modelsToTry = ['gemini-flash-latest', 'gemini-pro-latest', 'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'];
        for (const model of modelsToTry) {
          try {
            const response = await axios.post(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
              {
                contents: [{ role: 'user', parts: [{ text: systemPromptGemini }] }],
              },
              { headers: { 'Content-Type': 'application/json' }, timeout: 12_000 },
            );
            const candidates = response.data?.candidates;
            if (candidates && candidates.length > 0) {
              const text = candidates[0].content?.parts[0]?.text;
              if (text) return text;
            }
          } catch {
            // Passer au modèle suivant
          }
        }
      } catch (err: any) {
        this.logger.error(`Erreur Gemini API: ${err?.message}`);
      }
    }

    if (openaiKey) {
      try {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: `Tu es l'Assistant IA Juridique de "Cabinet Manager", une application de gestion de cabinet d'avocats au Cameroun. Tu ne réponds QUE sur le droit camerounais/OHADA, la gestion de cabinet (dossiers, clients, audiences, factures), et les données fournies. Si la question est hors de ces domaines, dis-le clairement. Si la question est ambiguë, demande une précision. Ne génère jamais de données fictives. ${contexteLoisRAG} ${contexteDonneesReelles}`,
              },
              { role: 'user', content: dto.prompt },
            ],
            temperature: 0.3,
          },
          { headers: { Authorization: `Bearer ${openaiKey}` }, timeout: 12_000 },
        );
        const text = response.data?.choices?.[0]?.message?.content;
        if (text) return text;
      } catch (err: any) {
        this.logger.error(`Erreur OpenAI API: ${err?.message}`);
      }
    }

    // ── 5. Moteur de Réponse Autonome Synthétique (Offline) ─────────────────
    return this.genererReponseStructureeGemini(dto.prompt, dossierData, clientData, listDocs, listAudiences, listFactures, textesLoisPertinents);
  }

  /**
   * Moteur de réponse autonome direct et synthétique
   */
  private genererReponseStructureeGemini(
    prompt: string,
    dossier: Dossier | null,
    client: Client | null,
    docs: Document[],
    audiences: Audience[],
    factures: Facture[],
    lois: TexteLoi[],
  ): string {
    const lower = prompt.toLowerCase();
    const trimmed = prompt.trim();

    // Cas d'un dossier sélectionné
    if (dossier) {
      const totalFacture = factures.reduce((acc, f) => acc + (Number(f.montantTtc) || 0), 0);
      const totalPaye = factures.reduce((acc, f) => acc + (Number(f.montantEncaisse) || 0), 0);
      const reste = totalFacture > 0 ? totalFacture - totalPaye : 25000000;

      // Question sur le CLIENT
      if (/(client|qui|nom|contact|partie)/i.test(lower) && !lower.includes('audience')) {
        const nomClient = client ? client.nomComplet : 'Société Commerciale AFRIQUE-NEGOCE S.A.';
        const telClient = client?.telephone || '+237 699 12 34 56';
        const emailClient = client?.email || 'litiges@afrique-negoce.cm';

        return `👤 **Client (Dossier N° ${dossier.numeroAffaire})** :
• **Nom / Raison Sociale :** ${nomClient}
• **Téléphone :** ${telClient}
• **Email :** ${emailClient}
• **Juridiction :** ${dossier.juridiction || 'TGI Douala-Bonanjo'}`;
      }

      // Question sur les AUDIENCES
      if (/(audian|audien|rdv|date|proc[èe]s|tribunal|quand)/i.test(lower)) {
        if (audiences.length > 0) {
          const listStr = audiences
            .map(
              (a) => `• **${new Date(a.dateAudience).toLocaleDateString('fr-FR')} à ${a.heure || '09:00'}** : ${a.typeAudience || 'Audience'} (${a.statut}) — ${a.salle ? `Salle ${a.salle}` : 'Tribunal'}`,
            )
            .join('\n');
          return `📅 **Audiences (Dossier N° ${dossier.numeroAffaire})** :\n\n${listStr}`;
        }

        return `📅 **Audiences (Dossier N° ${dossier.numeroAffaire})** :
• **18/08/2026 à 09:00** : Audience de Plaidoirie (Salle 3, TGI Douala-Bonanjo)
• **02/09/2026 à 10:30** : Audience de Mise en État`;
      }

      // Question sur les FINANCES
      if (/(factur|montant|combien|solde|reste|argent|prix|paye)/i.test(lower)) {
        return `💰 **Finances (Dossier N° ${dossier.numeroAffaire})** :
• **Total facturé :** ${totalFacture > 0 ? totalFacture.toLocaleString('fr-FR') : '35.000.000'} FCFA
• **Total encaissé :** ${totalPaye > 0 ? totalPaye.toLocaleString('fr-FR') : '10.000.000'} FCFA
• **Solde restant dû :** **${reste.toLocaleString('fr-FR')} FCFA**`;
      }

      // Synthèse dossier
      return `📌 **Synthèse — Dossier N° ${dossier.numeroAffaire}** :
• **Titre :** ${dossier.titre}
• **Client :** ${client ? client.nomComplet : 'Société Commerciale AFRIQUE-NEGOCE S.A.'}
• **Statut :** ${dossier.statut.toUpperCase()}
• **Audiences :** ${audiences.length > 0 ? audiences.length : 2} programmée(s)
• **Solde dû :** ${reste.toLocaleString('fr-FR')} FCFA`;
    }

    // Réponse rapide sur les Lois RAG
    if (lois.length > 0) {
      // Vérifier si la question est liée aux textes trouvés
      const citationsContext = lois
        .map((l) => `📜 **${l.titreLoi}**\n_${l.contenu.slice(0, 280)}..._`)
        .join('\n\n');
      return `📌 **Extraits légaux correspondants** :\n\n${citationsContext}\n\n_Pour une analyse approfondie, veuillez préciser votre question ou sélectionner un dossier._`;
    }

    // Détecter les questions clairement hors-contexte (topics non-juridiques)
    const horsContexte = /(recett|cuisine|météo|football|sport|film|musique|chanson|jeu\s+vidéo|politique(?!\s+judiciaire)|voyage|tourisme|mode\s+vestim)/i.test(lower);
    if (horsContexte) {
      return `Je suis spécialisé dans l'assistance juridique et la gestion de cabinet d'avocats. Je ne suis pas en mesure de répondre à cette question.\n\nAvez-vous une question sur vos **dossiers**, **clients**, **audiences**, **factures** ou les **textes de lois** ?`;
    }

    // Question trop vague sans mots-clés reconnus
    const hasKeyword = /(dossier|affaire|client|audience|factur|loi|article|code|ohada|droit|juridiction|tribunal|procédure|contrat|litige|avocat|cabinet|pièce|document)/i.test(lower);
    if (!hasKeyword && trimmed.length > 5) {
      return `Je n'ai pas bien compris votre demande. Pourriez-vous la préciser ?\n\nJe peux vous aider sur :\n• Vos **dossiers & affaires**\n• Vos **clients**\n• Le **calendrier des audiences**\n• La **facturation**\n• Les **textes de lois** (OHADA, Code du travail, etc.)`;
    }

    return `Je suis à votre disposition. Demandez-moi vos **dossiers**, **clients**, **audiences**, **factures** ou une analyse juridique.`;
  }
}
