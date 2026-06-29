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
import { CorrectionService } from "./correction.service";
import { CorrectionController } from "./correction.controller";
import { ReportCardService } from "./report-card.service";
import { ReportCardController } from "./report-card.controller";
import { SkillsService } from "./skills.service";
import { SkillsController } from "./skills.controller";
import { RemarksService } from "./remarks.service";
import { RemarksController } from "./remarks.controller";
import { ReportCardConfigService } from "./report-card-config.service";
import { ReportCardConfigController } from "./report-card-config.controller";
import { ReportCardPdfController } from "./report-card-pdf.controller";

@Module({
  imports: [AuthModule],
  controllers: [AssessmentTypesController, GradeBoundariesController, SubjectAssignmentsController, ScoresController, ReviewController, ReleaseController, CorrectionController, ReportCardController, SkillsController, RemarksController, ReportCardConfigController, ReportCardPdfController],
  providers: [
    AssessmentTypesService,
    GradeBoundariesService,
    SubjectAssignmentsService,
    ScoresService,
    ReviewService,
    ReleaseService,
    CorrectionService,
    ReportCardService,
    SkillsService,
    RemarksService,
    ReportCardConfigService,
  ],
})
export class AssessmentModule {}
