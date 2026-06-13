import { IsString, Matches, Length } from "class-validator";

export class RequestOtpDto {
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, { message: "phone must be 10-15 digits, optionally with +" })
  phone!: string;
}

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/)
  phone!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}
