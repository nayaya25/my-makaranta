import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";

export class PutLessonPlanDto {
  @IsString()
  @IsNotEmpty()
  subjectAssignmentId!: string;

  @IsString()
  @IsNotEmpty()
  termId!: string;

  @IsInt()
  @Min(1)
  weekNumber!: number;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsString()
  objectives?: string;

  @IsOptional()
  @IsString()
  activities?: string;

  @IsOptional()
  @IsString()
  resources?: string;

  @IsOptional()
  @IsString()
  assessment?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReviewLessonPlanDto {
  @IsIn(["APPROVED", "RETURNED"])
  decision!: "APPROVED" | "RETURNED";

  @IsOptional()
  @IsString()
  note?: string;
}
