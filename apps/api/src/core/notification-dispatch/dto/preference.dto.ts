import { IsArray, IsOptional, IsString } from "class-validator";

export class SetPreferenceDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mutedChannels?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mutedCategories?: string[];
}
