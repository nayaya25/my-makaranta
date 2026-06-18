import { IsString, Matches, Length, IsOptional, IsEmail } from "class-validator";

export class RequestOtpDto {
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, { message: "phone must be 10-15 digits, optionally with +" })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: "email must be a valid address" })
  email?: string;
}

export class VerifyOtpDto {
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}
