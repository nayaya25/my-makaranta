import { Type } from "class-transformer";
import { IsArray, IsInt, IsNotEmpty, IsString, Min, ValidateNested } from "class-validator";

export class FeeItemInput {
  @IsString() @IsNotEmpty() name!: string;
  @IsInt() @Min(0) amountKobo!: number;
  @IsInt() @Min(0) order!: number;
}

export class SetFeeItemsDto {
  @IsString() @IsNotEmpty() classLevelId!: string;
  @IsString() @IsNotEmpty() termId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => FeeItemInput) items!: FeeItemInput[];
}

export class GenerateInvoicesDto {
  @IsString() @IsNotEmpty() termId!: string;
}
