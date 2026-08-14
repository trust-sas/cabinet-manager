import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateInvitationDto {
  @IsNumber()
  dossierId: number;

  /** Numéro de téléphone du destinataire (identifiant principal) */
  @IsString()
  @IsNotEmpty()
  destinataireTelephone: string;

  /** @deprecated Compatibilité : utiliser destinataireTelephone */
  @IsOptional()
  @IsString()
  destinataireEmail?: string;

  @IsString()
  @IsNotEmpty()
  motDePasse: string;
}
