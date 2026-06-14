import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { AssessmentTypesService } from "./assessment-types.service";
import { AssessmentTypesController } from "./assessment-types.controller";
import { GradeBoundariesService } from "./grade-boundaries.service";
import { SubjectAssignmentsService } from "./subject-assignments.service";

@Module({
  imports: [AuthModule],
  controllers: [AssessmentTypesController],
  providers: [
    AssessmentTypesService,
    GradeBoundariesService,
    SubjectAssignmentsService,
  ],
})
export class AssessmentModule {}
