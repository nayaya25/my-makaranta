import { IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";

const COUNTRY_CODES = ["NG", "GH", "KE"] as const;

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
