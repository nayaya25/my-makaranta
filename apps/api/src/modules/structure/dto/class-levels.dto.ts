import { Type } from "class-transformer";
import { IsArray, IsInt, IsString, ValidateNested } from "class-validator";

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
