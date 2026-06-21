import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { PublicTenantController, SchoolsController } from "./schools.controller";
import { SchoolsService } from "./schools.service";
import { AcademicYearsController } from "./academic-years.controller";
import { AcademicYearsService } from "./academic-years.service";
import { ClassLevelsController } from "./class-levels.controller";
import { ClassLevelsService } from "./class-levels.service";
import { ClassesController } from "./classes.controller";
import { ClassesService } from "./classes.service";
import { SubjectsController } from "./subjects.controller";
import { SubjectsService } from "./subjects.service";

@Module({
  imports: [AuthModule],
  controllers: [
    PublicTenantController,
    SchoolsController,
    AcademicYearsController,
    ClassLevelsController,
    ClassesController,
    SubjectsController,
  ],
  providers: [
    SchoolsService,
    AcademicYearsService,
    ClassLevelsService,
    ClassesService,
    SubjectsService,
  ],
})
export class StructureModule {}
