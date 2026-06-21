import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { PALETTE_KEYS } from "../../../core/tenant/palette-keys";

const COUNTRY_CODES = ["NG", "GH", "KE"] as const;

export class TechnicalContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

export class UpdateBrandingDto {
  @IsOptional()
  @IsIn(PALETTE_KEYS, { message: `themeKey must be one of: ${PALETTE_KEYS.join(", ")}` })
  themeKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  motto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TechnicalContactDto)
  technicalContact?: TechnicalContactDto;
}

export class UpdateSchoolDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsIn(COUNTRY_CODES, { message: "country must be one of NG, GH, KE" })
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;
}

export class CreateSchoolDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: "slug may only contain lowercase letters, numbers, and hyphens" })
  @MaxLength(100)
  slug?: string;

  // Enum-validated so a bad value is a clean 400, not a Prisma 500.
  @IsOptional()
  @IsIn(COUNTRY_CODES, { message: "country must be one of NG, GH, KE" })
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;
}
