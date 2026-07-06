import { Type } from "class-transformer";
import { IsArray, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";

export class SetInstallmentDto {
  @IsInt() order!: number;

  @IsOptional() @IsString() label?: string;

  @IsInt() @Min(1) @Max(10000) percentBps!: number;

  @IsDateString() dueDate!: string;
}

export class SetScheduleDto {
  @IsString() @IsNotEmpty() classLevelId!: string;
  @IsString() @IsNotEmpty() termId!: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => SetInstallmentDto) installments!: SetInstallmentDto[];
}
