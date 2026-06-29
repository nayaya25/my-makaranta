import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpsertRemarkDto {
  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  termId!: string;

  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsOptional()
  @IsString()
  formTeacherRemark?: string;

  @IsOptional()
  @IsString()
  principalRemark?: string;
}

export interface RemarkCapabilities {
  canForm: boolean;
  canPrincipal: boolean;
}
