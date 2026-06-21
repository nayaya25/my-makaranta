import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class SignupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  schoolName: string;

  @IsString()
  @MinLength(3)
  @MaxLength(40)
  @Matches(/^[a-z0-9-]+$/)
  slug: string;

  // Matches the Prisma CountryCode enum supported at onboarding.
  @IsIn(["NG", "GH", "KE"])
  country: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsString()
  gender: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(7)
  phone: string;

  @IsString()
  @MinLength(8)
  password: string;
}
