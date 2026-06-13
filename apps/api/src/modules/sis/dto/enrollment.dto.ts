import { IsString, IsNotEmpty } from "class-validator";

export class CreateEnrollmentDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsString()
  @IsNotEmpty()
  termId!: string;
}
