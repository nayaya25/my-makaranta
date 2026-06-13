import {
  IsString,
  IsNotEmpty,
  IsISO8601,
  IsArray,
  IsOptional,
  IsIn,
  ValidateNested,
  ArrayMaxSize,
} from "class-validator";
import { Type } from "class-transformer";

export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;
export type AttendanceStatusValue = (typeof ATTENDANCE_STATUSES)[number];

export class AttendanceRecordItemDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsIn(ATTENDANCE_STATUSES)
  status!: AttendanceStatusValue;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class MarkAttendanceDto {
  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsISO8601()
  date!: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordItemDto)
  records!: AttendanceRecordItemDto[];
}
