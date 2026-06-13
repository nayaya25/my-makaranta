import {
  IsString,
  IsOptional,
  IsEmail,
  IsISO8601,
  IsUrl,
  IsNotEmpty,
} from "class-validator";

export class CreateStaffDto {
  @IsString()
  @IsNotEmpty()
  staffNo!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsOptional()
  @IsUrl()
  photoUrl?: string;

  @IsOptional()
  @IsISO8601()
  hiredAt?: string;
}

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  staffNo?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsUrl()
  photoUrl?: string;

  @IsOptional()
  @IsISO8601()
  hiredAt?: string;
}
