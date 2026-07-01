import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateSubjectCategoryDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;
}

export class UpdateSubjectCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;
}
