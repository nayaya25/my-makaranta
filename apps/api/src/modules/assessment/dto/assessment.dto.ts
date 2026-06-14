import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class AssessmentTypeItemDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  maxScore!: number;

  @IsInt()
  @Min(0)
  order!: number;
}

export class ReplaceAssessmentTypesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AssessmentTypeItemDto)
  types!: AssessmentTypeItemDto[];
}

export class GradeBoundaryItemDto {
  @IsString()
  @IsNotEmpty()
  grade!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  minScore!: number;

  @IsString()
  @IsNotEmpty()
  remark!: string;

  @IsInt()
  @Min(0)
  order!: number;
}

export class ReplaceGradeBoundariesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GradeBoundaryItemDto)
  boundaries!: GradeBoundaryItemDto[];
}

export class ApplyTemplateDto {
  @IsIn(["WAEC", "NECO"])
  template!: "WAEC" | "NECO";
}

export class CreateSubjectAssignmentDto {
  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsString()
  @IsNotEmpty()
  staffId!: string;

  @IsString()
  @IsNotEmpty()
  academicYearId!: string;
}

export class UpdateSubjectAssignmentDto {
  @IsString()
  @IsNotEmpty()
  staffId!: string;
}
