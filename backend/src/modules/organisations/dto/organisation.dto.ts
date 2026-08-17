import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

export class CreateOrganisationDto {
  @IsString()
  @IsNotEmpty({ message: "Le nom de l'organisation est obligatoire." })
  nom: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateOrganisationDto {
  @IsOptional()
  @IsString()
  @MaxLength(150, { message: "Le nom ne peut pas dépasser 150 caractères." })
  nom?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class AjouterMembreDto {
  @IsNotEmpty()
  userId: number;
}

export class TraiterDemandeDto {
  @IsString()
  @IsNotEmpty()
  action: 'accepted' | 'rejected';
}

export class PartagerDossierDto {
  @IsNotEmpty()
  dossierId: number;
}

export class PartagerClientDto {
  @IsNotEmpty()
  clientId: number;
}
