import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class BankRowDto {
  @IsString() @IsNotEmpty() reference!: string;
  @IsInt() @Min(1) amountKobo!: number;
  @IsString() narration!: string;
  @IsOptional() @IsString() date?: string;
}
export class ProposeMatchesDto {
  @IsString() @IsNotEmpty() termId!: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => BankRowDto) rows!: BankRowDto[];
}
export class ConfirmationDto {
  @IsString() @IsNotEmpty() reference!: string;
  @IsInt() @Min(1) amountKobo!: number;
  @IsString() @IsNotEmpty() invoiceId!: string;
}
export class ConfirmMatchesDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ConfirmationDto) confirmations!: ConfirmationDto[];
}
