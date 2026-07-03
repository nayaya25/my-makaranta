import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_PATTERN = "^([01]\\d|2[0-3]):[0-5]\\d$";

export class CreatePeriodDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @Matches(TIME_REGEX, { message: `startTime must be in HH:mm 24h format (${TIME_PATTERN})` })
  startTime!: string;

  @Matches(TIME_REGEX, { message: `endTime must be in HH:mm 24h format (${TIME_PATTERN})` })
  endTime!: string;

  @IsInt()
  @Min(0)
  order!: number;

  @IsOptional()
  @IsBoolean()
  isBreak?: boolean;
}

export class UpdatePeriodDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  label?: string;

  @IsOptional()
  @Matches(TIME_REGEX, { message: `startTime must be in HH:mm 24h format (${TIME_PATTERN})` })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_REGEX, { message: `endTime must be in HH:mm 24h format (${TIME_PATTERN})` })
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsBoolean()
  isBreak?: boolean;
}

export class PutEntryDto {
  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsString()
  @IsNotEmpty()
  academicYearId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  dayOfWeek!: number;

  @IsString()
  @IsNotEmpty()
  periodId!: string;

  @IsString()
  @IsNotEmpty()
  subjectAssignmentId!: string;
}
