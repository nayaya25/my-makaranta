import { IsString, MaxLength } from "class-validator";

export class CreateSubjectDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(20)
  code!: string;
}
