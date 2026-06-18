import { IsArray, IsString } from "class-validator";

export class SetStaffPermissionsDto {
  @IsArray() @IsString({ each: true }) keys!: string[];
}
