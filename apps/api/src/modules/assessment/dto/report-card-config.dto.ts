import { IsBoolean, IsDateString, IsOptional, IsString } from "class-validator";
import { Type } from "class-transformer";

export class UpdateReportCardConfigDto {
  @IsOptional()
  @IsString()
  layout?: string;

  @IsOptional()
  @IsBoolean()
  showSkills?: boolean;

  @IsOptional()
  @IsBoolean()
  showAttendance?: boolean;

  @IsOptional()
  @IsBoolean()
  showRemarks?: boolean;

  @IsOptional()
  @IsBoolean()
  showGradingKey?: boolean;

  @IsOptional()
  @IsBoolean()
  showPosition?: boolean;

  @IsOptional()
  @Type(() => Date)
  nextTermBegins?: Date;
}
