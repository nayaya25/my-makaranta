import { Type } from "class-transformer";
import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";

export type SkillKind = "conduct" | "early_years";
export const SKILL_KINDS: SkillKind[] = ["conduct", "early_years"];

export class CreateSkillDomainDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsIn(SKILL_KINDS)
  kind?: SkillKind;
}

export class UpdateSkillDomainDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreateSkillItemDto {
  @IsString()
  @IsNotEmpty()
  domainId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateSkillItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class ScalePointDto {
  @IsInt()
  @Min(1)
  value!: number;

  @IsString()
  @IsNotEmpty()
  label!: string;
}

export class SetSkillScaleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScalePointDto)
  points!: ScalePointDto[];
}

export class RatingEntryDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  skillItemId!: string;

  @IsInt()
  @Min(1)
  @Max(100) // upper bound enforced per school.skillScaleMax in service; this guards against absurd values
  value!: number;
}

export class SaveSkillRatingsDto {
  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsString()
  @IsNotEmpty()
  termId!: string;

  @IsOptional()
  @IsIn(SKILL_KINDS)
  kind?: SkillKind;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RatingEntryDto)
  ratings!: RatingEntryDto[];
}
