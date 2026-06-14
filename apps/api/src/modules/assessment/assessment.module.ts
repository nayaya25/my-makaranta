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
import { ReviewService } from "./review.service";
import { ReviewController } from "./review.controller";
import { ReleaseService } from "./release.service";
import { ReleaseController } from "./release.controller";

@Module({
  imports: [AuthModule],
  controllers: [AssessmentTypesController, GradeBoundariesController, SubjectAssignmentsController, ScoresController, ReviewController, ReleaseController],
  providers: [
    AssessmentTypesService,
    GradeBoundariesService,
    SubjectAssignmentsService,
    ScoresService,
    ReviewService,
    ReleaseService,
  ],
})
export class AssessmentModule {}
