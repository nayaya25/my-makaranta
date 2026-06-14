-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "releasedBy" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultSheet" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "average" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ResultSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultSheetEntry" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "resultSheetId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "grade" TEXT NOT NULL,

    CONSTRAINT "ResultSheetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Release_classId_termId_key" ON "Release"("classId", "termId");

-- CreateIndex
CREATE INDEX "ResultSheet_schoolId_classId_termId_idx" ON "ResultSheet"("schoolId", "classId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "ResultSheet_studentId_termId_key" ON "ResultSheet"("studentId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "ResultSheetEntry_resultSheetId_subjectId_key" ON "ResultSheetEntry"("resultSheetId", "subjectId");

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSheet" ADD CONSTRAINT "ResultSheet_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSheet" ADD CONSTRAINT "ResultSheet_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSheet" ADD CONSTRAINT "ResultSheet_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSheet" ADD CONSTRAINT "ResultSheet_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSheet" ADD CONSTRAINT "ResultSheet_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSheetEntry" ADD CONSTRAINT "ResultSheetEntry_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSheetEntry" ADD CONSTRAINT "ResultSheetEntry_resultSheetId_fkey" FOREIGN KEY ("resultSheetId") REFERENCES "ResultSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultSheetEntry" ADD CONSTRAINT "ResultSheetEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
