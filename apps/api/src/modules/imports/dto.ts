import { IsArray, ArrayMaxSize } from "class-validator";
import type { StudentImportRow } from "./students-import";

export class ImportStudentsDto {
  @IsArray()
  @ArrayMaxSize(5000, { message: "Import at most 5000 rows per batch" })
  rows!: StudentImportRow[];
}
