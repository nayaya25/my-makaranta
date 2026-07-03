import {
  IsString,
  IsOptional,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
} from "class-validator";
import { ApplicationStatus, Gender, GuardianRelation } from "@prisma/client";

export class CreateApplicantDto {
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

  @IsString()
  @IsNotEmpty()
  desiredClassLevelId!: string;

  @IsString()
  @IsNotEmpty()
  academicYearId!: string;

  @IsString()
  @IsNotEmpty()
  guardianName!: string;

  @IsString()
  @IsNotEmpty()
  guardianPhone!: string;

  @IsOptional()
  @IsString()
  guardianEmail?: string;

  @IsEnum(GuardianRelation)
  guardianRelation!: GuardianRelation;

  @IsOptional()
  @IsString()
  previousSchool?: string;
}

export class UpdateApplicantDto {
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
  @IsString()
  desiredClassLevelId?: string;

  @IsOptional()
  @IsString()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  guardianName?: string;

  @IsOptional()
  @IsString()
  guardianPhone?: string;

  @IsOptional()
  @IsString()
  guardianEmail?: string;

  @IsOptional()
  @IsEnum(GuardianRelation)
  guardianRelation?: GuardianRelation;

  @IsOptional()
  @IsString()
  previousSchool?: string;

  @IsOptional()
  @IsString()
  reviewNote?: string;
}

export class TransitionDto {
  @IsEnum(ApplicationStatus)
  to!: ApplicationStatus;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class EnrollApplicantDto {
  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsString()
  @IsNotEmpty()
  termId!: string;

  @IsOptional()
  @IsString()
  admissionNo?: string;
}

export class ListApplicantsQuery {
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @IsOptional()
  @IsString()
  level?: string;

  @IsOptional()
  @IsString()
  year?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
