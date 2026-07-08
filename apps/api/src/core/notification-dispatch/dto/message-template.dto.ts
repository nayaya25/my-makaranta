import { IsNotEmpty, IsString } from "class-validator";

export class SetMessageTemplateDto {
  @IsString()
  @IsNotEmpty()
  body!: string;
}
