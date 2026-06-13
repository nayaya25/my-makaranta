import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsBoolean,
  IsNotEmpty,
} from "class-validator";

export enum LangCode {
  EN = "EN",
  HA = "HA",
  YO = "YO",
  IG = "IG",
}

export enum GuardianRelation {
  MOTHER = "MOTHER",
  FATHER = "FATHER",
  GUARDIAN = "GUARDIAN",
  GRANDPARENT = "GRANDPARENT",
  AUNT = "AUNT",
  UNCLE = "UNCLE",
  OTHER = "OTHER",
}

export class CreateParentDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(LangCode)
  preferredLang?: LangCode;
}

export class CreateGuardianDto {
  @IsString()
  @IsNotEmpty()
  parentId!: string;

  @IsEnum(GuardianRelation)
  relationship!: GuardianRelation;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
