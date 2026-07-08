import { IsArray, IsBoolean, IsIn, IsInt, IsOptional } from "class-validator";

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  feeRemindersEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  reminderOffsetDays?: number[];

  @IsOptional()
  @IsBoolean()
  resultsReadyEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn(["SMS", "EMAIL", "WHATSAPP"], { each: true })
  channels?: string[];
}
