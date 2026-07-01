-- DropIndex
DROP INDEX "AssessmentType_schoolId_name_key";

-- DropIndex
DROP INDEX "GradeBoundary_schoolId_grade_key";

-- AlterTable
ALTER TABLE "AssessmentType" ADD COLUMN     "classLevelId" TEXT;

-- AlterTable
ALTER TABLE "GradeBoundary" ADD COLUMN     "classLevelId" TEXT;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "categoryId" TEXT;

-- CreateTable
CREATE TABLE "SubjectCategory" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SubjectCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubjectCategory_schoolId_name_key" ON "SubjectCategory"("schoolId", "name");

-- CreateIndex
CREATE INDEX "AssessmentType_schoolId_classLevelId_idx" ON "AssessmentType"("schoolId", "classLevelId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentType_schoolId_classLevelId_name_key" ON "AssessmentType"("schoolId", "classLevelId", "name");

-- CreateIndex
CREATE INDEX "GradeBoundary_schoolId_classLevelId_idx" ON "GradeBoundary"("schoolId", "classLevelId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeBoundary_schoolId_classLevelId_grade_key" ON "GradeBoundary"("schoolId", "classLevelId", "grade");

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SubjectCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentType" ADD CONSTRAINT "AssessmentType_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeBoundary" ADD CONSTRAINT "GradeBoundary_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique indexes: default rows (classLevelId IS NULL) have their own uniqueness constraint,
-- separate from the per-level @@unique([schoolId, classLevelId, name/grade]) above.
CREATE UNIQUE INDEX "AssessmentType_school_name_default_key" ON "AssessmentType" ("schoolId", "name") WHERE "classLevelId" IS NULL;
CREATE UNIQUE INDEX "GradeBoundary_school_grade_default_key" ON "GradeBoundary" ("schoolId", "grade") WHERE "classLevelId" IS NULL;
