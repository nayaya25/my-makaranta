import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, ValidateNested } from "class-validator";

export class ClassLevelItemDto {
  @IsString()
  name!: string;

  @IsInt()
  order!: number;
}

export class CreateClassLevelsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassLevelItemDto)
  items!: ClassLevelItemDto[];
}

export class UpdateClassLevelDto {
  @IsOptional()
  @IsBoolean()
  isEarlyYears?: boolean;
}
