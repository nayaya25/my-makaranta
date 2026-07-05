CREATE TYPE "LessonPlanStatus" AS ENUM ('DRAFT','SUBMITTED','APPROVED','RETURNED');

CREATE TABLE "LessonPlan" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "subjectAssignmentId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "weekNumber" INTEGER NOT NULL,
  "topic" TEXT,
  "objectives" TEXT,
  "activities" TEXT,
  "resources" TEXT,
  "assessment" TEXT,
  "notes" TEXT,
  "status" "LessonPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "reviewNote" TEXT,
  "reviewedByStaffId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LessonPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LessonPlan_subjectAssignmentId_termId_weekNumber_key" ON "LessonPlan"("subjectAssignmentId","termId","weekNumber");
CREATE INDEX "LessonPlan_schoolId_termId_idx" ON "LessonPlan"("schoolId","termId");

ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_subjectAssignmentId_fkey" FOREIGN KEY ("subjectAssignmentId") REFERENCES "SubjectAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
