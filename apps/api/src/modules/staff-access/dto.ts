import { IsArray, IsNotEmpty, IsString } from "class-validator";

export class SetStaffPermissionsDto {
  @IsArray() @IsString({ each: true }) @IsNotEmpty({ each: true }) keys!: string[];
}
