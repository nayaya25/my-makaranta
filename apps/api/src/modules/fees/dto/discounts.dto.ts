import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateSchemeDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsIn(["PERCENT", "FIXED"]) method!: "PERCENT" | "FIXED";
  @IsInt() value!: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateSchemeDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsIn(["PERCENT", "FIXED"]) method?: "PERCENT" | "FIXED";
  @IsOptional() @IsInt() value?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class AssignDiscountDto {
  @IsString() @IsNotEmpty() schemeId!: string;
}
