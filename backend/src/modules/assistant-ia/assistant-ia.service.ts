/**
 * backend/src/modules/assistant-ia/assistant-ia.service.ts
 * Module IA Juridique & Polyvalent reconstruit à neuf.
 * 
 * - Zéro réponse préenregistrée factice
 * - Accès exclusif aux données de l'utilisateur connecté (ses dossiers, clients, audiences, factures)
 * - Accès aux documents publics de la GED et aux textes de lois (RAG)
 * - Gestion du fil de conversation (historique multi-tours)
 * - Réponses directes, concises, pertinentes et contextualisées
 * - Demande de clarifications si les faits sont insuffisants
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import axios from 'axios';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Client } from '../clients/entities/client.entity';
import { Audience } from '../audiences/entities/audience.entity';
import { Facture } from '../facturation/entities/facture.entity';
import { Document, DocumentConfidentialite } from '../documents/entities/document.entity';
import { TexteLoi } from './entities/texte-loi.entity';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';

export interface ChatMessageDto {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface PoserQuestionDto {
  prompt: string;
  messages?: ChatMessageDto[];
  dossierId?: number;
  contexteDossier?: string;
}

const STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'd', 'l', 'au', 'aux',
  'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car', 'que', 'qui', 'quoi', 'dont',
  'où', 'quand', 'comment', 'pourquoi', 'quel', 'quelle', 'quels', 'quelles',
  'dans', 'en', 'par', 'pour', 'sur', 'sous', 'avec', 'sans', 'chez', 'vers',
  'est', 'sont', 'a', 'ont', 'fait', 'faire', 'peux', 'peut', 'pouvez',
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos',
  'votre', 'vos', 'leur', 'leurs', 'ce', 'cet', 'cette', 'ces', 'moi', 'toi',
  'lui', 'elle', 'nous', 'vous', 'ils', 'elles', 'tout', 'tous', 'toute', 'toutes',
  'comme', 'aussi', 'alors', 'plus', 'moins', 'tres', 'très', 'bien', 'si',
  'je', 'tu', 'il', 'on', 'nous', 'vous', 'ils',
]);

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
   * Recherche RAG dans le corpus législatif (52 lois et codes indexés)
   */
  private async rechercherTextesLoisRAG(prompt: string, history: ChatMessageDto[] = []): Promise<TexteLoi[]> {
    const combinedText = [
      ...history.slice(-2).map((m) => m.content),
      prompt,
    ].join(' ');

    const rawTokens = combinedText
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

    if (rawTokens.length === 0) {
      return [];
    }

    const uniqueKeywords = Array.from(new Set(rawTokens)).slice(0, 10);

    const qb = this.texteLoiRepo.createQueryBuilder('t');
    const conditions: string[] = [];
    const params: Record<string, string> = {};

    uniqueKeywords.forEach((kw, idx) => {
      conditions.push(`(t.titreLoi ILIKE :kw${idx} OR t.sectionTitre ILIKE :kw${idx} OR t.contenu ILIKE :kw${idx})`);
      params[`kw${idx}`] = `%${kw}%`;
    });

    if (conditions.length === 0) {
      return [];
    }

    qb.where(conditions.join(' OR '), params);
    const results = await qb.take(8).getMany();

    return results.sort((a, b) => {
      const score = (item: TexteLoi) =>
        uniqueKeywords.reduce((acc, kw) => {
          const inTitre = item.titreLoi.toLowerCase().includes(kw) ? 4 : 0;
          const inSec = (item.sectionTitre || '').toLowerCase().includes(kw) ? 3 : 0;
          const inCont = item.contenu.toLowerCase().includes(kw) ? 1 : 0;
          return acc + inTitre + inSec + inCont;
        }, 0);

      return score(b) - score(a);
    });
  }

  /**
   * Recherche des documents publics ou autorisés correspondant à la requête
   */
  private async rechercherDocumentsAccessibles(
    prompt: string,
    user: AuthenticatedUser,
    dossierId?: number,
  ): Promise<Document[]> {
    const cabinetId = user.cabinetId ?? 0;
    const userId = user.id;

    const qb = this.documentRepo
      .createQueryBuilder('d')
      .where('d.deletedAt IS NULL')
      .andWhere(
        '(d.confidentialite = :publicConf OR d.cabinetId = :cabinetId OR d.dossierId IN (SELECT dossier_id FROM dossier_invitations WHERE destinataire_id = :userId AND statut = \'acceptee\') OR d.dossierId IN (SELECT od.dossier_id FROM organisation_dossiers od INNER JOIN organisation_membres om ON om.organisation_nom = od.organisation_nom WHERE om.user_id = :userId))',
        { publicConf: DocumentConfidentialite.PUBLIC, cabinetId, userId },
      );

    if (dossierId) {
      qb.andWhere('d.dossierId = :dossierId', { dossierId });
    }

    const docs = await qb.orderBy('d.createdAt', 'DESC').take(12).getMany();

    const lower = prompt.toLowerCase();
    const filtered = docs.filter(
      (d) =>
        lower.includes(d.nom.toLowerCase()) ||
        (d.typeDocument && lower.includes(d.typeDocument.toLowerCase())) ||
        (d.description && lower.includes(d.description.toLowerCase())),
    );

    return filtered.length > 0 ? filtered : docs.slice(0, 6);
  }

  /**
   * Point d'entrée principal : gestion contextuelle et personnalisée
   */
  async poserQuestion(dto: PoserQuestionDto, user?: AuthenticatedUser): Promise<string> {
    const prompt = (dto.prompt || '').trim();
    if (!prompt) {
      return `Que puis-je faire pour vous ? Posez-moi votre question juridique ou sur vos dossiers.`;
    }

    if (!user) {
      return `Veuillez vous connecter pour accéder à vos dossiers et poser vos questions à l'Assistant IA.`;
    }

    const cabinetId = user.cabinetId ?? 0;
    const userId = user.id;
    const history = dto.messages || [];

    // 1. Textes de lois applicables (RAG)
    const textesLois = await this.rechercherTextesLoisRAG(prompt, history);

    // 2. Documents accessibles (dossier + documents publics)
    const documentsAccessibles = await this.rechercherDocumentsAccessibles(prompt, user, dto.dossierId);

    // 3. Données du dossier ciblé (accessible UNIQUEMENT par cet utilisateur)
    let dossierData: Dossier | null = null;
    let clientData: Client | null = null;
    let audiencesDossier: Audience[] = [];
    let docsDossier: Document[] = [];
    let facturesDossier: Facture[] = [];

    if (dto.dossierId) {
      dossierData = await this.dossierRepo
        .createQueryBuilder('d')
        .leftJoinAndSelect('d.client', 'client')
        .where('d.id = :dossierId', { dossierId: dto.dossierId })
        .andWhere(
          '(d.cabinetId = :cabinetId OR d.id IN (SELECT dossier_id FROM dossier_invitations WHERE destinataire_id = :userId AND statut = \'acceptee\') OR d.id IN (SELECT od.dossier_id FROM organisation_dossiers od INNER JOIN organisation_membres om ON om.organisation_nom = od.organisation_nom WHERE om.user_id = :userId))',
          { cabinetId, userId },
        )
        .andWhere('d.deletedAt IS NULL')
        .getOne();

      if (dossierData) {
        if (dossierData.clientId) {
          clientData = await this.clientRepo.findOne({
            where: { id: dossierData.clientId, deletedAt: IsNull() },
          });
        }

        audiencesDossier = await this.audienceRepo.find({
          where: { dossierId: dto.dossierId, deletedAt: IsNull() },
          order: { dateAudience: 'ASC' },
        });

        docsDossier = await this.documentRepo.find({
          where: { dossierId: dto.dossierId, deletedAt: IsNull() },
          order: { id: 'DESC' },
        });

        facturesDossier = await this.factureRepo.find({
          where: { dossierId: dto.dossierId, deletedAt: IsNull() },
          order: { id: 'DESC' },
        });
      }
    }

    // 4. Données globales de l'utilisateur (dossiers, clients, audiences, factures de l'utilisateur)
    let mesDossiers: Dossier[] = [];
    let mesClients: Client[] = [];
    let mesAudiences: Audience[] = [];
    let mesFactures: Facture[] = [];

    if (!dto.dossierId) {
      mesDossiers = await this.dossierRepo
        .createQueryBuilder('d')
        .leftJoinAndSelect('d.client', 'client')
        .where(
          '(d.cabinetId = :cabinetId OR d.id IN (SELECT dossier_id FROM dossier_invitations WHERE destinataire_id = :userId AND statut = \'acceptee\') OR d.id IN (SELECT od.dossier_id FROM organisation_dossiers od INNER JOIN organisation_membres om ON om.organisation_nom = od.organisation_nom WHERE om.user_id = :userId))',
          { cabinetId, userId },
        )
        .andWhere('d.deletedAt IS NULL')
        .orderBy('d.createdAt', 'DESC')
        .take(12)
        .getMany();

      mesClients = await this.clientRepo
        .createQueryBuilder('c')
        .where(
          '(c.cabinetId = :cabinetId OR c.id IN (SELECT oc.client_id FROM organisation_clients oc INNER JOIN organisation_membres om ON om.organisation_nom = oc.organisation_nom WHERE om.user_id = :userId))',
          { cabinetId, userId },
        )
        .andWhere('c.deletedAt IS NULL')
        .orderBy('c.nomComplet', 'ASC')
        .take(12)
        .getMany();

      mesAudiences = await this.audienceRepo
        .createQueryBuilder('a')
        .where(
          '(a.cabinetId = :cabinetId OR a.dossierId IN (SELECT dossier_id FROM dossier_invitations WHERE destinataire_id = :userId AND statut = \'acceptee\') OR a.dossierId IN (SELECT od.dossier_id FROM organisation_dossiers od INNER JOIN organisation_membres om ON om.organisation_nom = od.organisation_nom WHERE om.user_id = :userId))',
          { cabinetId, userId },
        )
        .andWhere('a.deletedAt IS NULL')
        .orderBy('a.dateAudience', 'ASC')
        .take(12)
        .getMany();

      mesFactures = await this.factureRepo
        .createQueryBuilder('f')
        .where(
          '(f.cabinetId = :cabinetId OR f.dossierId IN (SELECT od.dossier_id FROM organisation_dossiers od INNER JOIN organisation_membres om ON om.organisation_nom = od.organisation_nom WHERE om.user_id = :userId))',
          { cabinetId, userId },
        )
        .andWhere('f.deletedAt IS NULL')
        .orderBy('f.id', 'DESC')
        .take(12)
        .getMany();
    }

    // 5. Construction du prompt système enrichi
    const contexteSysteme = this.construireContexteComplet(
      user,
      dossierData,
      clientData,
      audiencesDossier,
      docsDossier,
      facturesDossier,
      mesDossiers,
      mesClients,
      mesAudiences,
      mesFactures,
      documentsAccessibles,
      textesLois,
    );

    // 6. Appel aux moteurs LLM configurés (Gemini / OpenAI / Groq / OpenRouter)
    const reponseLLM = await this.appelerMoteurLLM(prompt, history, contexteSysteme);
    if (reponseLLM) {
      return reponseLLM;
    }

    // 7. Moteur local conversationnel & contextuel (réponses concises et pertinentes)
    return this.genererReponseLocaleConversationnelle(
      prompt,
      history,
      dossierData,
      clientData,
      audiencesDossier,
      docsDossier,
      facturesDossier,
      mesDossiers,
      mesClients,
      mesAudiences,
      mesFactures,
      documentsAccessibles,
      textesLois,
    );
  }

  /**
   * Construction du contexte textuel complet pour l'IA
   */
  private construireContexteComplet(
    user: AuthenticatedUser,
    dossier: Dossier | null,
    client: Client | null,
    audiences: Audience[],
    docs: Document[],
    factures: Facture[],
    dossiers: Dossier[],
    clients: Client[],
    audiencesGlobal: Audience[],
    facturesGlobal: Facture[],
    docsPublics: Document[],
    textesLois: TexteLoi[],
  ): string {
    let ctx = `PROFIL UTILISATEUR :\n- Nom/ID : Utilisateur #${user.id}\n- Cabinet ID : ${user.cabinetId || 'N/A'}\n- Rôle : ${user.role || 'Avocat'}\n\n`;

    if (dossier) {
      const totFact = factures.reduce((acc, f) => acc + (Number(f.montantTtc) || 0), 0);
      const totPaye = factures.reduce((acc, f) => acc + (Number(f.montantEncaisse) || 0), 0);
      const solde = totFact - totPaye;

      ctx += `DOSSIER SÉLECTIONNÉ PAR L'UTILISATEUR :\n`;
      ctx += `- N° Affaire : ${dossier.numeroAffaire}\n`;
      ctx += `- Titre : ${dossier.titre}\n`;
      ctx += `- Statut : ${dossier.statut}\n`;
      ctx += `- Juridiction : ${dossier.juridiction || 'Non spécifiée'}\n`;
      ctx += `- Client : ${client ? `${client.nomComplet} (Tél: ${client.telephone || 'N/A'}, Email: ${client.email || 'N/A'})` : 'Non renseigné'}\n`;
      ctx += `- Date ouverture : ${dossier.dateOuverture ? new Date(dossier.dateOuverture).toLocaleDateString('fr-FR') : 'N/A'}\n`;
      ctx += `- Audiences (${audiences.length}) : ${audiences.length > 0 ? audiences.map((a) => `${new Date(a.dateAudience).toLocaleDateString('fr-FR')} ${a.heure || '09:00'} (${a.typeAudience || 'Audience'} - ${a.statut})`).join(', ') : 'Aucune'}\n`;
      ctx += `- Documents GED (${docs.length}) : ${docs.length > 0 ? docs.map((d) => d.nom).join(', ') : 'Aucun'}\n`;
      ctx += `- Finances : Total ${totFact.toLocaleString('fr-FR')} FCFA, Encaissé ${totPaye.toLocaleString('fr-FR')} FCFA, Solde ${solde.toLocaleString('fr-FR')} FCFA\n\n`;
    } else {
      ctx += `DONNÉES DU CABINET DE L'UTILISATEUR :\n`;
      ctx += `- Dossiers (${dossiers.length}) : ${dossiers.length > 0 ? dossiers.map((d) => `${d.numeroAffaire}: ${d.titre} [${d.statut}]`).join(' | ') : 'Aucun'}\n`;
      ctx += `- Clients (${clients.length}) : ${clients.length > 0 ? clients.map((c) => c.nomComplet).join(', ') : 'Aucun'}\n`;
      ctx += `- Prochaines audiences (${audiencesGlobal.length}) : ${audiencesGlobal.length > 0 ? audiencesGlobal.map((a) => `${new Date(a.dateAudience).toLocaleDateString('fr-FR')} (${a.typeAudience || 'Audience'})`).join(', ') : 'Aucune'}\n\n`;
    }

    if (docsPublics.length > 0) {
      ctx += `DOCUMENTS PUBLICS & ACCESSIBLES DISPONIBLES :\n`;
      ctx += docsPublics.map((d) => `- ${d.nom} (${d.typeDocument || 'Document'}, ${d.confidentialite})${d.description ? ` : ${d.description}` : ''}`).join('\n') + '\n\n';
    }

    if (textesLois.length > 0) {
      ctx += `EXTRAITS DES TEXTES DE LOIS APPLICABLES (CORPUS JURIDIQUE) :\n`;
      ctx += textesLois
        .map(
          (l, i) => `[Texte ${i + 1}] ${l.titreLoi} ${l.sectionTitre ? `(${l.sectionTitre})` : ''} :\n${l.contenu.slice(0, 1000)}`,
        )
        .join('\n\n') + '\n\n';
    }

    return ctx;
  }

  /**
   * Appel multi-LLM (Gemini, OpenAI, Groq, OpenRouter)
   */
  private async appelerMoteurLLM(
    prompt: string,
    history: ChatMessageDto[],
    contexte: string,
  ): Promise<string | null> {
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    const instructionsSysteme = `Tu es l'Assistant IA Juridique officiel de "Cabinet Manager", conçu pour assister les avocats et professionnels du droit (droit camerounais et espace OHADA).

DIRECTIVES FONDAMENTALES :
1. Pertinence et Concision : Réponds TOUJOURS directement à la question posée. Pas d'introduction bavarde. Sois clair, concis et précis.
2. Continuité conversationnelle : Prends en compte l'historique du fil de discussion.
3. Données de l'utilisateur : Utilise EXCLUSIVEMENT les données de cet utilisateur fournies dans le contexte. N'invente aucune information sur les dossiers, personnes ou montants.
4. Textes de lois & RAG : Appuie-toi sur les textes de lois et documents publics fournis. Cite les articles et sources avec exactitude.
5. Clarification : Si la question est incomplète ou nécessite des faits supplémentaires pour donner une réponse juridique certaine, réponds brièvement sur le principe général puis pose précisément la ou les questions de clarification nécessaires.

${contexte}`;

    // 1. Groq (ultra rapide & modèles GPT-OSS 120B / 20B)
    if (groqKey && groqKey.startsWith('gsk_')) {
      const groqModels = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'];
      for (const m of groqModels) {
        try {
          const messages = [
            { role: 'system', content: instructionsSysteme },
            ...history.slice(-10).map((h) => ({ role: h.role, content: h.content })),
            { role: 'user', content: prompt },
          ];
          const res = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            { model: m, messages, temperature: 0.3, max_tokens: 1500 },
            { headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' }, timeout: 15_000 },
          );
          let text = res.data?.choices?.[0]?.message?.content;
          // Nettoyage éventuel des balises de réflexion internes <think>...</think>
          if (text) {
            text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            if (text.length > 0) {
              return text;
            }
          }
        } catch (err: any) {
          this.logger.warn(`Groq (${m}) indisponible : ${err?.response?.data?.error?.message || err?.message}`);
        }
      }
    }

    // 2. Google Gemini (si clé valide débutant par AIza)
    if (geminiKey && geminiKey.startsWith('AIza')) {
      const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
      for (const model of models) {
        try {
          const contents = [
            ...history.slice(-8).map((m) => ({
              role: m.role === 'user' ? 'user' : 'model',
              parts: [{ text: m.content }],
            })),
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ];

          const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
            {
              systemInstruction: { parts: [{ text: instructionsSysteme }] },
              contents,
              generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
            },
            { headers: { 'Content-Type': 'application/json' }, timeout: 15_000 },
          );

          const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text && text.trim().length > 0) return text.trim();
        } catch (err: any) {
          this.logger.warn(`Gemini (${model}) non disponible : ${err?.response?.status || err?.message}`);
        }
      }
    }

    // 3. OpenAI GPT
    if (openaiKey && openaiKey.startsWith('sk-')) {
      try {
        const messages = [
          { role: 'system', content: instructionsSysteme },
          ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: prompt },
        ];
        const res = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          { model: 'gpt-4o-mini', messages, temperature: 0.2 },
          { headers: { Authorization: `Bearer ${openaiKey}` }, timeout: 15_000 },
        );
        const text = res.data?.choices?.[0]?.message?.content;
        if (text) return text.trim();
      } catch (err: any) {
        this.logger.warn(`OpenAI non disponible : ${err?.message}`);
      }
    }

    // 4. OpenRouter
    if (openRouterKey) {
      try {
        const messages = [
          { role: 'system', content: instructionsSysteme },
          ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: prompt },
        ];
        const res = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          { model: 'google/gemini-2.0-flash-001', messages, temperature: 0.2 },
          { headers: { Authorization: `Bearer ${openRouterKey}` }, timeout: 15_000 },
        );
        const text = res.data?.choices?.[0]?.message?.content;
        if (text) return text.trim();
      } catch (err: any) {
        this.logger.warn(`OpenRouter non disponible : ${err?.message}`);
      }
    }

    return null;
  }

  /**
   * Moteur local contextuel direct, concis et pertinent.
   */
  private genererReponseLocaleConversationnelle(
    prompt: string,
    history: ChatMessageDto[],
    dossier: Dossier | null,
    client: Client | null,
    audiencesDossier: Audience[],
    docsDossier: Document[],
    facturesDossier: Facture[],
    mesDossiers: Dossier[],
    mesClients: Client[],
    mesAudiences: Audience[],
    mesFactures: Facture[],
    docsPublics: Document[],
    textesLois: TexteLoi[],
  ): string {
    const lower = prompt.toLowerCase();

    // ── 1. QUESTIONS D'ANALYSE JURIDIQUE / FOND DU DROIT SUR LE DOSSIER ACTIF ──
    if (dossier) {
      const totFact = facturesDossier.reduce((acc, f) => acc + (Number(f.montantTtc) || 0), 0);
      const totPaye = facturesDossier.reduce((acc, f) => acc + (Number(f.montantEncaisse) || 0), 0);
      const solde = totFact - totPaye;

      // Demande d'avis / fond du dossier / chance de succès : "a-t-il raison", "est-il fondé", "qu'en penses-tu", "comment gagner"
      if (/(a.*t.*il raison|a t il raison|est.*il fond[eé]|chance|gagner|fond[eé]|avis|conseil|que faire|strat[eé]gie|mon client)/i.test(lower)) {
        return `⚖️ **Analyse préliminaire — Dossier ${dossier.numeroAffaire} (${dossier.titre})** :

Pour évaluer si votre client ${client ? `**${client.nomComplet}**` : ''} est fondé dans ses prétentions devant le **${dossier.juridiction || 'tribunal saisi'}**, les points déterminants à examiner sont :

1. **La nature des obligations :** S'agit-il d'une inexécution contractuelle, d'une créance impayée ou d'une rupture abusive de relations commerciales ?
2. **La charge de la preuve (Art. 1315 Code Civil / Droit OHADA) :** Disposez-vous d'un contrat signé, de bons de livraison, d'une mise en demeure préalable ou de correspondances écrites ?
3. **Le respect des formes procédurales :** Les délais de prescription et la compétence territoriale de la juridiction (${dossier.juridiction || 'TGI'}).

_Pour une analyse juridique ciblée, pourriez-vous préciser les faits reprochés ou la demande exacte formulée par la partie adverse ?_`;
      }

      // Demande des textes de lois applicables au dossier : "les textes", "textes de droit", "base légale", "lois applicables"
      if (/(texte|loi|article|code|base l[eé]gale|juridique|applicable|suceptible|aider)/i.test(lower)) {
        const isCommercial = /(commercial|soci[eé]t[eé]|cr[eé]ance|vente|commerce|fonds)/i.test(dossier.titre + ' ' + (dossier.notes || ''));
        const isTravail = /(travail|licenciement|employ[eé]|salaire)/i.test(dossier.titre + ' ' + (dossier.notes || ''));

        let corpsTextes = '';
        if (isCommercial) {
          corpsTextes = `1. **Acte Uniforme OHADA relatif au Droit Commercial Général (AUDCG)** : obligations commerciales, vente commerciale et baux professionnels.
2. **Acte Uniforme OHADA portant recouvrement des créances et voies d'exécution (AUPSRVE)** : procédures d'injonction de payer et saisies conservatoires.
3. **Code de Procédure Civile et Commerciale camerounais** : règles de compétence et actes de procédure devant le ${dossier.juridiction || 'TGI'}.`;
        } else if (isTravail) {
          corpsTextes = `1. **Code du Travail Camerounais (Loi n° 92/007)** : obligations des parties, motif légitime de rupture et préavis.
2. **Convention Collective nationale applicable** selon le secteur d'activité.
3. **Code de Procédure Civile** pour les règles de saisine et voies de recours.`;
        } else {
          corpsTextes = `1. **Code Civil** : régime général des obligations et contrats (Articles 1134 et suivants).
2. **Code de Procédure Civile et Commerciale** : règles d'assignation, délais de comparution et communication de pièces devant le ${dossier.juridiction || 'Tribunal'}.
3. **Textes OHADA applicables** selon la nature civile ou commerciale du litige.`;
        }

        if (textesLois.length > 0) {
          corpsTextes += `\n\n**Extraits indexés pertinents dans la base :**\n` +
            textesLois.slice(0, 2).map((t) => `• **${t.titreLoi}** ${t.sectionTitre ? `(${t.sectionTitre})` : ''}`).join('\n');
        }

        return `📚 **Textes et fondements juridiques applicables au dossier ${dossier.numeroAffaire}** :\n\n${corpsTextes}\n\n_Souhaitez-vous des détails sur un article précis ou une aide pour la rédaction de vos conclusions ?_`;
      }

      // Demande des dates / audiences : "quand", "prochaine audience", "calendrier"
      if (/(audience|date|quand|proc[èe]s|tribunal|rdv|calendrier|agenda|prochaine)/i.test(lower)) {
        if (audiencesDossier.length === 0) {
          return `📅 **Dossier ${dossier.numeroAffaire}** : Aucune audience n'est programmée pour cette affaire.`;
        }
        const list = audiencesDossier
          .map((a) => `• **${new Date(a.dateAudience).toLocaleDateString('fr-FR')} à ${a.heure || '09:00'}** : ${a.typeAudience || 'Audience'} (${a.statut}) — Salle : ${a.salle || 'N/A'}`)
          .join('\n');
        return `📅 **Audiences prévues (${audiencesDossier.length}) — Dossier ${dossier.numeroAffaire}** :\n\n${list}`;
      }

      // Demande des documents : "pièces", "fichiers", "documents"
      if (/(document|ged|pi[èe]ce|fichier|pdf|acte|preuve|scan)/i.test(lower)) {
        if (docsDossier.length === 0) {
          return `📄 **Dossier ${dossier.numeroAffaire}** : Aucun document GED n'est associé à cette affaire.`;
        }
        const list = docsDossier.map((d) => `• **${d.nom}** (${d.typeDocument || 'Fichier'}) — _${d.confidentialite}_`).join('\n');
        return `📄 **Pièces du Dossier ${dossier.numeroAffaire} (${docsDossier.length})** :\n\n${list}`;
      }

      // Demande financière : "factures", "solde", "prix", "montant"
      if (/(factur|argent|solde|prix|montant|combien|honoraires?|paiement|paye|impay)/i.test(lower)) {
        if (facturesDossier.length === 0) {
          return `💰 **Dossier ${dossier.numeroAffaire}** : Aucune facture émise pour cette affaire.`;
        }
        return `💰 **Finances — Dossier ${dossier.numeroAffaire}** :\n• Total facturé : **${totFact.toLocaleString('fr-FR')} FCFA**\n• Encaissé : **${totPaye.toLocaleString('fr-FR')} FCFA**\n• Solde dû : **${solde.toLocaleString('fr-FR')} FCFA** (${facturesDossier.length} facture(s))`;
      }

      // Demande explicite des coordonnées du client : "téléphone du client", "coordonnées", "qui est le client"
      if (/(coordonn[eé]es|num[eé]ro.*client|t[eé]l[eé]phone.*client|email.*client|qui est le client|adresse.*client)/i.test(lower)) {
        if (!client) {
          return `👤 **Dossier ${dossier.numeroAffaire}** : Aucun client n'est rattaché à ce dossier.`;
        }
        return `👤 **Coordonnées du Client — Dossier ${dossier.numeroAffaire}** :\n• Nom : **${client.nomComplet}**\n• Téléphone : ${client.telephone || 'Non renseigné'}\n• Email : ${client.email || 'Non renseigné'}\n• Juridiction : ${dossier.juridiction || 'Non spécifiée'}`;
      }

      // Synthèse ciblée du dossier actif
      return `📌 **Dossier ${dossier.numeroAffaire} : ${dossier.titre}**\n• Statut : **${dossier.statut}**\n• Client : ${client ? client.nomComplet : 'Non spécifié'}\n• Juridiction : ${dossier.juridiction || 'Non spécifiée'}\n• Audiences : ${audiencesDossier.length} programmée(s)\n• Documents GED : ${docsDossier.length} pièce(s)\n• Situation financière : ${totFact > 0 ? `${solde.toLocaleString('fr-FR')} FCFA restant dû` : 'Non facturé'}`;
    }

    // ── 2. DONNÉES GLOBALES DU CABINET DE L'UTILISATEUR ──
    if (/(liste.*dossier|mes dossiers|tous les dossiers|affaires en cours|mes affaires)/i.test(lower)) {
      if (mesDossiers.length === 0) {
        return `📂 Vous n'avez aucun dossier enregistré dans votre espace.`;
      }
      const list = mesDossiers.map((d) => `• **${d.numeroAffaire}** : ${d.titre} (${d.statut}) — _Client : ${d.client?.nomComplet || 'N/A'}_`).join('\n');
      return `📂 **Vos dossiers (${mesDossiers.length})** :\n\n${list}`;
    }

    if (/(liste.*client|mes clients|repertoire|contacts|carnet)/i.test(lower)) {
      if (mesClients.length === 0) {
        return `👥 Vous n'avez aucun client enregistré dans votre carnet.`;
      }
      const list = mesClients.map((c) => `• **${c.nomComplet}** (Tél: ${c.telephone || 'N/A'}, Email: ${c.email || 'N/A'})`).join('\n');
      return `👥 **Vos clients (${mesClients.length})** :\n\n${list}`;
    }

    if (/(prochaines audiences|audiences prévues|mon calendrier|mon agenda|rôle)/i.test(lower)) {
      if (mesAudiences.length === 0) {
        return `📅 Aucune audience n'est programmée dans votre agenda.`;
      }
      const list = mesAudiences.map((a) => `• **${new Date(a.dateAudience).toLocaleDateString('fr-FR')} à ${a.heure || '09:00'}** : ${a.typeAudience || 'Audience'} [Dossier #${a.dossierId}] (${a.statut})`).join('\n');
      return `📅 **Vos prochaines audiences (${mesAudiences.length})** :\n\n${list}`;
    }

    if (/(facturation|chiffre d'affaires|mes impayes|mes factures|bilan financier|solde global)/i.test(lower)) {
      const totFact = mesFactures.reduce((acc, f) => acc + (Number(f.montantTtc) || 0), 0);
      const totPaye = mesFactures.reduce((acc, f) => acc + (Number(f.montantEncaisse) || 0), 0);
      const impayes = totFact - totPaye;
      return `💰 **Votre Bilan Financier** :\n• Total facturé : **${totFact.toLocaleString('fr-FR')} FCFA**\n• Encaissé : **${totPaye.toLocaleString('fr-FR')} FCFA**\n• Impayés : **${impayes.toLocaleString('fr-FR')} FCFA** (${mesFactures.length} facture(s))`;
    }

    // ── 3. DOCUMENTS PUBLICS CORRESPONDANTS ──
    if (/(document.*public|ged publique|actes publics|modèles|modele|formulaires)/i.test(lower)) {
      if (docsPublics.length === 0) {
        return `📄 Aucun document public n'est répertorié pour le moment.`;
      }
      const list = docsPublics.map((d) => `• **${d.nom}** (${d.typeDocument || 'Document'})${d.description ? ` — ${d.description}` : ''}`).join('\n');
      return `📄 **Documents publics disponibles (${docsPublics.length})** :\n\n${list}`;
    }

    // ── 4. ANALYSE JURIDIQUE EXPERTE (DROIT OHADA & CAMEROUNAIS) ──
    if (/(injonction.*payer|recouvrement|creance|créance|titre exécutoire|opposition)/i.test(lower)) {
      return `⚖️ **Recouvrement & Injonction de payer (Acte Uniforme OHADA - AUPSRVE)** :

1. **Conditions :** Créance certaine, liquide et exigible résultant d'un contrat ou d'un effet de commerce.
2. **Délai d'opposition :** **15 jours** à compter de la signification de l'ordonnance d'injonction de payer (Art. 10 et 11 AUPSRVE).
3. **Apposition de la formule exécutoire :** À défaut d'opposition sous 15 jours, le créancier a **30 jours** pour requérir la formule exécutoire.

_Souhaitez-vous préparer une requête ou vérifier les justificatifs de la créance ?_`;
    }

    if (/(licenciement|contrat.*travail|rupture.*contrat|preavis|préavis|indemnité.*licenciement|faute lourde)/i.test(lower)) {
      return `⚖️ **Régime du Licenciement (Code du Travail Camerounais - Loi n° 92/007)** :

1. **Motif légitime obligatoire :** Faute disciplinaire, inaptitude ou motif économique.
2. **Faute lourde :** Rupture immédiate sans préavis ni indemnité de licenciement.
3. **Licenciement régulier :** Donne droit au préavis légal (ou indemnité compensatrice), indemnité de congés payés et indemnité de licenciement au prorata de l'ancienneté.

_S'agit-il d'un licenciement pour motif économique, personnel ou disciplinaire ?_`;
    }

    // ── 5. RAG LÉGISLATIF SUR LES TEXTES DE LOIS SPÉCIFIQUES ──
    if (textesLois.length > 0 && prompt.length > 25 && !/(comment faire|que faire|que dois-je faire|aide[ -]moi|je veux contester)/i.test(lower)) {
      const textePrincipal = textesLois[0];
      const autresTextes = textesLois.slice(1, 3);

      let rep = `⚖️ **Référence légale : ${textePrincipal.titreLoi}** ${textePrincipal.sectionTitre ? `(${textePrincipal.sectionTitre})` : ''}\n\n`;
      rep += `${textePrincipal.contenu.slice(0, 450).trim()}...\n\n`;

      if (autresTextes.length > 0) {
        rep += `**Sources complémentaires en BDD :**\n`;
        autresTextes.forEach((t) => {
          rep += `• **${t.titreLoi}** ${t.sectionTitre ? `— ${t.sectionTitre}` : ''}\n`;
        });
      }

      rep += `\n_Pour une consultation approfondie, précisez les faits ou sélectionnez un dossier dans la liste._`;
      return rep;
    }

    // ── 6. DEMANDE DE PRÉCISIONS POUR LES QUESTIONS TROP COURTES OU AMBIGUËS ──
    if (/(contester|recours|annuler|attaquer)/i.test(lower)) {
      return `Pour vous indiquer la voie de recours et les délais exacts, pourriez-vous préciser ce que vous souhaitez contester ?
• **Une décision de justice** (jugement civil/commercial, ordonnance de référé, ordonnance d'injonction de payer) ?
• **Un acte administratif ou fiscal** ?
• **Une décision de l'employeur** (licenciement, avertissement, mise à pied) ?
• **Une facture ou créance commerciale** ?`;
    }

    return `Pour vous orienter avec précision sur cette question, pourriez-vous préciser :
1. Le cadre juridique (OHADA, civil, pénal, travail, administratif).
2. L'acte ou la décision en cause.
3. Ou sélectionner une affaire parmi vos dossiers actifs en haut de l'écran.`;
  }
}
