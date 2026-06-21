import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

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

  @IsString()
  @Length(2)
  country: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsUrl()
  website?: string;

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
