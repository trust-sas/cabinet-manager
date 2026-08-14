import {
    BadRequestException, ConflictException,
    Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { JournalService } from '../journal/journal.service';
import { CreateEncaissementDto } from './dto/create-encaissement.dto';
import { CreateFactureDto } from './dto/create-facture.dto';
import { QueryFacturesDto } from './dto/query-factures.dto';
import { UpdateFactureDto } from './dto/update-facture.dto';
import { Encaissement } from './entities/encaissement.entity';
import { Facture, FactureStatut } from './entities/facture.entity';

export interface ResultatPagine<T> {
  page: number; pageSize: number; total: number; data: T[];
}

@Injectable()
export class FacturationService {
  constructor(
    @InjectRepository(Facture)
    private readonly factureRepo: Repository<Facture>,
    @InjectRepository(Encaissement)
    private readonly encaissRepo: Repository<Encaissement>,
    private readonly journalService: JournalService,
  ) {}

  // ── Factures ────────────────────────────────────────────────────────────

  async createFacture(dto: CreateFactureDto, user: AuthenticatedUser): Promise<Facture> {
    const numeroFacture = await this.genererNumero(user.cabinetId);
    const taux = dto.tauxTva ?? 19.25;
    const ttc  = Number((dto.montantHt * (1 + taux / 100)).toFixed(2));

    const facture = this.factureRepo.create({
      cabinetId: user.cabinetId,
      dossierId: dto.dossierId,
      clientId: dto.clientId,
      numeroFacture,
      dateEmission: new Date(),
      dateEcheance: dto.dateEcheance ? new Date(dto.dateEcheance) : null,
      montantHt: dto.montantHt,
      tauxTva: taux,
      montantTtc: ttc,
      montantEncaisse: 0,
      statut: FactureStatut.BROUILLON,
      description: dto.description ?? null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const saved = await this.factureRepo.save(facture);
    await this.journalService.enregistrer({
      cabinetId: user.cabinetId, utilisateurId: user.id,
      action: 'facture.create', entiteType: 'facture',
      entiteId: saved.id, donneesApres: { ...saved },
    });
    return saved;
  }

  async findAllFactures(query: QueryFacturesDto, user: AuthenticatedUser): Promise<ResultatPagine<Facture>> {
    const userEmailClean = user.email ? user.email.trim().toLowerCase() : '';
    const qb = this.factureRepo.createQueryBuilder('f')
      .where('(f.cabinetId = :cabinetId OR f.dossierId IN (SELECT dossier_id FROM dossier_invitations WHERE LOWER(destinataire_email) = :userEmail AND statut = \'acceptee\'))', { cabinetId: user.cabinetId, userEmail: userEmailClean })
      .andWhere('f.deletedAt IS NULL');

    if (query.dossierId) qb.andWhere('f.dossierId = :dossierId', { dossierId: query.dossierId });
    if (query.clientId)  qb.andWhere('f.clientId = :clientId', { clientId: query.clientId });
    if (query.statut)    qb.andWhere('f.statut = :statut', { statut: query.statut });

    qb.orderBy('f.dateEmission', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [data, total] = await qb.getManyAndCount();
    return { page: query.page, pageSize: query.pageSize, total, data };
  }

  async findOneFacture(id: number, user: AuthenticatedUser): Promise<Facture> {
    const f = await this.factureRepo.findOne({
      where: { id, cabinetId: user.cabinetId, deletedAt: null as any },
    });
    if (!f) throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Facture introuvable.', status: 404 } });
    return f;
  }

  async updateFacture(id: number, dto: UpdateFactureDto, user: AuthenticatedUser): Promise<Facture> {
    const facture = await this.findOneFacture(id, user);

    if (facture.statut !== FactureStatut.BROUILLON) {
      throw new BadRequestException({ error: { code: 'BUSINESS_RULE', message: 'Seules les factures en brouillon peuvent être modifiées.', status: 422 } });
    }
    if (dto.versionConnue !== undefined && dto.versionConnue !== facture.version) {
      throw new ConflictException({ error: { code: 'CONFLICT', message: `Version conflit (serveur: ${facture.version}).`, status: 409 } });
    }

    const avant = { ...facture };
    if (dto.montantHt    !== undefined) facture.montantHt    = dto.montantHt;
    if (dto.tauxTva      !== undefined) facture.tauxTva      = dto.tauxTva;
    if (dto.dateEcheance !== undefined) facture.dateEcheance = new Date(dto.dateEcheance);
    if (dto.description  !== undefined) facture.description  = dto.description;

    // Recalcul TTC
    facture.montantTtc = Number((facture.montantHt * (1 + facture.tauxTva / 100)).toFixed(2));

    const saved = await this.factureRepo.save(facture);
    await this.journalService.enregistrer({
      cabinetId: user.cabinetId, utilisateurId: user.id,
      action: 'facture.update', entiteType: 'facture',
      entiteId: id, donneesAvant: avant, donneesApres: { ...saved },
    });
    return saved;
  }

  async envoyerFacture(id: number, user: AuthenticatedUser): Promise<Facture> {
    const facture = await this.findOneFacture(id, user);
    if (facture.statut !== FactureStatut.BROUILLON) {
      throw new BadRequestException({ error: { code: 'BUSINESS_RULE', message: 'Seules les factures en brouillon peuvent être envoyées.', status: 422 } });
    }
    const avant = { ...facture };
    facture.statut = FactureStatut.ENVOYEE;
    const saved = await this.factureRepo.save(facture);
    await this.journalService.enregistrer({
      cabinetId: user.cabinetId, utilisateurId: user.id,
      action: 'facture.envoyer', entiteType: 'facture',
      entiteId: id, donneesAvant: avant, donneesApres: { ...saved },
    });
    return saved;
  }

  // ── Encaissements ────────────────────────────────────────────────────────

  async addEncaissement(
    factureId: number,
    dto: CreateEncaissementDto,
    user: AuthenticatedUser,
  ): Promise<Facture> {
    const facture = await this.findOneFacture(factureId, user);

    if ([FactureStatut.BROUILLON, FactureStatut.PAYEE].includes(facture.statut)) {
      throw new BadRequestException({ error: { code: 'BUSINESS_RULE', message: 'Impossible d\'encaisser sur une facture brouillon ou déjà payée.', status: 422 } });
    }

    // INSERT direct pour éviter le conflit relation/colonne TypeORM avec ManyToOne
    await this.encaissRepo.query(
      `INSERT INTO encaissements (cabinet_id, facture_id, montant, date_paiement, mode_paiement, reference, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        user.cabinetId,
        factureId,
        dto.montant,
        dto.datePaiement ? new Date(dto.datePaiement) : new Date(),
        dto.modePaiement ?? null,
        dto.reference ?? null,
        dto.notes ?? null,
      ],
    );
    // Mise à jour montant_encaisse + recalcul statut
    facture.montantEncaisse = Number((Number(facture.montantEncaisse) + dto.montant).toFixed(2));
    facture.statut = this.calculerStatut(facture);
    const saved = await this.factureRepo.save(facture);

    await this.journalService.enregistrer({
      cabinetId: user.cabinetId, utilisateurId: user.id,
      action: 'facture.encaissement', entiteType: 'facture',
      entiteId: factureId, donneesApres: { montant: dto.montant, nouveauStatut: saved.statut },
    });
    return saved;
  }

  async getEncaissements(factureId: number, user: AuthenticatedUser): Promise<Encaissement[]> {
    await this.findOneFacture(factureId, user); // vérif accès
    return this.encaissRepo.find({
      where: { factureId, cabinetId: user.cabinetId },
      order: { datePaiement: 'DESC' },
    });
  }

  async genererPdfFacture(id: number, user: AuthenticatedUser): Promise<Buffer> {
    const f = await this.findOneFacture(id, user);
    const encaissements = await this.getEncaissements(id, user);

    const ht = Number(f.montantHt);
    const tva = Number(f.montantHt * (f.tauxTva / 100));
    const ttc = Number(f.montantTtc);
    const encaisse = Number(f.montantEncaisse);
    const reste = Math.max(0, ttc - encaisse);

    const pdfContent = `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kinds [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /Resources <</Font <</F1 4 0 R>>>> /Contents 5 0 R>> endobj
4 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold>> endobj
5 0 obj <</Length 600>> stream
BT
/F1 16 Tf
50 750 TD
(FACTURE D'HONORAIRES DE CABINET D'AVOCATS) Tj
/F1 11 Tf
0 -30 TD
(Numero de Facture : ${f.numeroFacture}) Tj
0 -18 TD
(Date d'Emission  : ${new Date(f.dateEmission).toLocaleDateString('fr-FR')}) Tj
0 -18 TD
(Statut          : ${f.statut.toUpperCase()}) Tj
0 -30 TD
(----------------------------------------------------------------------) Tj
0 -20 TD
(Description : ${f.description || 'Prestations juridiques et honoraires d\'avocat'}) Tj
0 -30 TD
(Montant HT        : ${ht.toLocaleString('fr-FR')} FCFA) Tj
0 -18 TD
(TVA (${f.tauxTva}%)      : ${tva.toLocaleString('fr-FR')} FCFA) Tj
0 -18 TD
(TOTAL TTC         : ${ttc.toLocaleString('fr-FR')} FCFA) Tj
0 -18 TD
(Montant Encaissé  : ${encaisse.toLocaleString('fr-FR')} FCFA) Tj
0 -22 TD
(SOLDE RESTANT DÙ  : ${reste.toLocaleString('fr-FR')} FCFA) Tj
0 -40 TD
(Mentions Legales : Facture payable sous 30 jours. Merci de votre confiance.) Tj
ET
endstream endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000216 00000 n 
0000000295 00000 n 
trailer <</Size 6 /Root 1 0 R>>
startxref
940
%%EOF`;

    return Buffer.from(pdfContent, 'utf-8');
  }

  async deleteFacture(id: number, user: AuthenticatedUser): Promise<void> {
    const f = await this.findOneFacture(id, user);
    f.deletedAt = new Date();
    await this.factureRepo.save(f);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private calculerStatut(f: Facture): FactureStatut {
    const encaisse = Number(f.montantEncaisse);
    const ttc      = Number(f.montantTtc);
    if (encaisse <= 0)       return f.statut; // pas de changement si rien n'a changé
    if (encaisse >= ttc)     return FactureStatut.PAYEE;
    if (encaisse > 0)        return FactureStatut.PARTIELLE;
    return f.statut;
  }

  private async genererNumero(cabinetId: number): Promise<string> {
    const annee = new Date().getFullYear();
    const count = await this.factureRepo.count({ where: { cabinetId } });
    return `FAC-${annee}-${String(count + 1).padStart(4, '0')}`;
  }
}
