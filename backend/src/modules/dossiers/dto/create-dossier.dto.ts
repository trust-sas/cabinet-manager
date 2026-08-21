/**
 * modules/dossiers/dto/create-dossier.dto.ts
 * ---------------------------------------------------------------------------
 * Le champ optionnel `clientUuid` permet la création hors-ligne depuis
 * l'application mobile (voir politique de synchronisation) : l'appareil
 * génère un UUID au moment de la création locale, et ce même UUID est
 * renvoyé ici lors de la synchronisation, ce qui permet au serveur de
 * détecter un doublon si la requête est rejouée (idempotence).
 * ---------------------------------------------------------------------------
 */
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateDossierDto {
  @IsString()
  @IsNotEmpty({ message: 'Le titre du dossier est obligatoire.' })
  @MaxLength(255)
  titre: string;

  @IsInt()
  clientId: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  juridiction?: string;

  /**
   * Optionnel : si absent, l'avocat responsable est l'utilisateur courant
   * (cas normal : un avocat ouvre son propre dossier). Un Associé ou un
   * Administrateur peut explicitement assigner le dossier à un autre avocat.
   */
  @IsOptional()
  @IsInt()
  avocatResponsableId?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID('4', { message: 'clientUuid doit être un UUID v4 valide.' })
  clientUuid?: string;

  @IsOptional()
  estPublic?: boolean;
}
