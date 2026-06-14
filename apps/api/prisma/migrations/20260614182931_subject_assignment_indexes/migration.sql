-- CreateIndex
CREATE INDEX "SubjectAssignment_schoolId_academicYearId_idx" ON "SubjectAssignment"("schoolId", "academicYearId");

-- CreateIndex
CREATE INDEX "SubjectAssignment_classId_academicYearId_idx" ON "SubjectAssignment"("classId", "academicYearId");
