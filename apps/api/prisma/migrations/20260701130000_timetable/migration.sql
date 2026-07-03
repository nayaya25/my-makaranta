CREATE TABLE "Period" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "isBreak" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Period_schoolId_order_key" ON "Period"("schoolId","order");

CREATE TABLE "TimetableEntry" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "periodId" TEXT NOT NULL,
  "subjectAssignmentId" TEXT NOT NULL,
  CONSTRAINT "TimetableEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TimetableEntry_classId_academicYearId_dayOfWeek_periodId_key" ON "TimetableEntry"("classId","academicYearId","dayOfWeek","periodId");
CREATE INDEX "TimetableEntry_schoolId_academicYearId_idx" ON "TimetableEntry"("schoolId","academicYearId");
CREATE INDEX "TimetableEntry_subjectAssignmentId_idx" ON "TimetableEntry"("subjectAssignmentId");

ALTER TABLE "Period" ADD CONSTRAINT "Period_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_subjectAssignmentId_fkey" FOREIGN KEY ("subjectAssignmentId") REFERENCES "SubjectAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
