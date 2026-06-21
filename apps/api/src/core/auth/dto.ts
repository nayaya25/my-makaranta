import { IsString, Matches, Length, IsOptional, IsEmail, MinLength } from "class-validator";

export class RequestOtpDto {
  @IsOptional()
  @IsString()
  @Matches(/^\+?[\d\s().-]{10,20}$/, { message: "phone must be 10-15 digits, optionally with +" })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: "email must be a valid address" })
  email?: string;
}

export class VerifyOtpDto {
  @IsOptional()
  @IsString()
  @Matches(/^\+?[\d\s().-]{10,20}$/)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}

export class PasswordLoginDto {
  @IsString() schoolId!: string;
  @IsString() identifier!: string;
  @IsString() @MinLength(1) password!: string;
}

export class SwitchContextDto {
  @IsString() membershipId!: string;
}
