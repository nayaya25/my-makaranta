import {
  IsString,
  IsOptional,
  IsEnum,
  IsISO8601,
  IsUrl,
  IsNotEmpty,
} from "class-validator";

export enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
}

export class CreateStudentDto {
  @IsString()
  @IsNotEmpty()
  admissionNo!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsEnum(Gender)
  gender!: Gender;

  @IsISO8601()
  dateOfBirth!: string;

  @IsOptional()
  @IsString()
  stateOfOrigin?: string;

  @IsOptional()
  @IsUrl()
  photoUrl?: string;
}

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  admissionNo?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsISO8601()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  stateOfOrigin?: string;

  @IsOptional()
  @IsUrl()
  photoUrl?: string;
}
