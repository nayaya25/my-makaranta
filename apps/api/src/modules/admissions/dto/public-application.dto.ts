import { IsString, IsNotEmpty } from "class-validator";
import { CreateApplicantDto } from "./admissions.dto";

export class PublicApplicationDto extends CreateApplicantDto {
  @IsString()
  @IsNotEmpty()
  schoolSlug!: string;
}
