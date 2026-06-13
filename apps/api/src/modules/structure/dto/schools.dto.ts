import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class CreateSchoolDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: "slug may only contain lowercase letters, numbers, and hyphens" })
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}
