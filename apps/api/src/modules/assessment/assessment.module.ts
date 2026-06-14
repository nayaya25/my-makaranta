import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { AssessmentTypesService } from "./assessment-types.service";
import { AssessmentTypesController } from "./assessment-types.controller";
import { GradeBoundariesService } from "./grade-boundaries.service";
import { GradeBoundariesController } from "./grade-boundaries.controller";
import { SubjectAssignmentsService } from "./subject-assignments.service";
import { SubjectAssignmentsController } from "./subject-assignments.controller";
import { ScoresService } from "./scores.service";
import { ScoresController } from "./scores.controller";

@Module({
  imports: [AuthModule],
  controllers: [AssessmentTypesController, GradeBoundariesController, SubjectAssignmentsController, ScoresController],
  providers: [
    AssessmentTypesService,
    GradeBoundariesService,
    SubjectAssignmentsService,
    ScoresService,
  ],
})
export class AssessmentModule {}
