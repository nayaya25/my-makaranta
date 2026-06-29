import { Type } from "class-transformer";
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class CreateSkillDomainDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
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
