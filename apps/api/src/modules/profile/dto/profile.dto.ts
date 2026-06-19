import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const LANG_CODES = ["EN", "HA", "YO", "IG"] as const;

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(LANG_CODES, { message: "preferredLang must be one of EN, HA, YO, IG" })
  preferredLang?: string;
}
