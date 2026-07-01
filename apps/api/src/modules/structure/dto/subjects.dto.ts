import { IsOptional, IsString, MaxLength } from "class-validator";

export class CreateSubjectDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(20)
  code!: string;

  @IsOptional()
  @IsString()
  categoryId?: string;
}

export class UpdateSubjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;
}
