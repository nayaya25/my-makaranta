import { IsString, IsNotEmpty, MinLength } from "class-validator";

export class CreateConversationDto {
  @IsString() @IsNotEmpty() counterpartId!: string;
}

export class PostMessageDto {
  @IsString() @MinLength(1) body!: string;
}
