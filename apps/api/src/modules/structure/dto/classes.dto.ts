import { IsOptional, IsString } from "class-validator";

export class CreateClassDto {
  @IsString()
  classLevelId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  formTeacherId?: string;
}
