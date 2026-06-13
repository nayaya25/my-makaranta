import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { StudentsController } from "./students.controller";
import { StudentsService } from "./students.service";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";
import { ParentsController } from "./parents.controller";
import { ParentsService } from "./parents.service";
import { EnrollmentController } from "./enrollment.controller";
import { EnrollmentService } from "./enrollment.service";

@Module({
  imports: [AuthModule],
  controllers: [
    StudentsController,
    StaffController,
    ParentsController,
    EnrollmentController,
  ],
  providers: [
    StudentsService,
    StaffService,
    ParentsService,
    EnrollmentService,
  ],
})
export class SisModule {}
