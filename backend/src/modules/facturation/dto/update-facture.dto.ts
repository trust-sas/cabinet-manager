import {
  IsDateString, IsInt, IsNumber,
  IsOptional, IsPositive, IsString, Min,
} from 'class-validator';

export class UpdateFactureDto {
  @IsOptional() @IsNumber() @IsPositive()
  montantHt?: number;

  @IsOptional() @IsNumber() @Min(0)
  tauxTva?: number;

  @IsOptional() @IsDateString()
  dateEcheance?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  statut?: string;

  @IsOptional() @IsNumber() @Min(0)
  montantEncaisse?: number;

  @IsOptional() @IsInt()
  versionConnue?: number;
}
