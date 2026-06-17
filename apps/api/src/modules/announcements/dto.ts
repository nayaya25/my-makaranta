import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class CreateAnnouncementDto {
  @IsString() @MinLength(1) title!: string;
  @IsString() @MinLength(1) body!: string;
  @IsIn(["ALL", "LEVEL", "CLASS"]) audienceType!: "ALL" | "LEVEL" | "CLASS";
  @IsOptional() @IsArray() @IsString({ each: true }) audienceIds?: string[];
  @IsOptional() @IsArray() @IsIn(["SMS", "EMAIL"], { each: true }) channels?: ("SMS" | "EMAIL")[];
  @IsOptional() @IsArray() @ArrayNotEmpty() @IsIn(["PARENT", "STAFF"], { each: true }) roles?: ("PARENT" | "STAFF")[];
}
