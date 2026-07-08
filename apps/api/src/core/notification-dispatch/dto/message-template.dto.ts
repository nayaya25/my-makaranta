import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class SetMessageTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  body!: string;
}
