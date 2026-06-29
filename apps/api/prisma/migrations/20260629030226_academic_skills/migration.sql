-- AlterTable
ALTER TABLE "School" ADD COLUMN     "skillScaleMax" INTEGER NOT NULL DEFAULT 5;

-- CreateTable
CREATE TABLE "SkillDomain" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SkillDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillItem" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SkillItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillScalePoint" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SkillScalePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillRating" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "skillItemId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermRemark" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "formTeacherRemark" TEXT,
    "principalRemark" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TermRemark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportCardConfig" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "layout" TEXT NOT NULL DEFAULT 'classic',
    "showSkills" BOOLEAN NOT NULL DEFAULT true,
    "showAttendance" BOOLEAN NOT NULL DEFAULT true,
    "showRemarks" BOOLEAN NOT NULL DEFAULT true,
    "showGradingKey" BOOLEAN NOT NULL DEFAULT true,
    "showPosition" BOOLEAN NOT NULL DEFAULT true,
    "nextTermBegins" TIMESTAMP(3),

    CONSTRAINT "ReportCardConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SkillDomain_schoolId_name_key" ON "SkillDomain"("schoolId", "name");

-- CreateIndex
CREATE INDEX "SkillItem_schoolId_idx" ON "SkillItem"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillItem_domainId_name_key" ON "SkillItem"("domainId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SkillScalePoint_schoolId_value_key" ON "SkillScalePoint"("schoolId", "value");

-- CreateIndex
CREATE INDEX "SkillRating_schoolId_termId_idx" ON "SkillRating"("schoolId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillRating_studentId_termId_skillItemId_key" ON "SkillRating"("studentId", "termId", "skillItemId");

-- CreateIndex
CREATE INDEX "TermRemark_schoolId_termId_idx" ON "TermRemark"("schoolId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "TermRemark_studentId_termId_key" ON "TermRemark"("studentId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportCardConfig_schoolId_key" ON "ReportCardConfig"("schoolId");

-- AddForeignKey
ALTER TABLE "SkillDomain" ADD CONSTRAINT "SkillDomain_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillItem" ADD CONSTRAINT "SkillItem_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillItem" ADD CONSTRAINT "SkillItem_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "SkillDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillScalePoint" ADD CONSTRAINT "SkillScalePoint_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillRating" ADD CONSTRAINT "SkillRating_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillRating" ADD CONSTRAINT "SkillRating_skillItemId_fkey" FOREIGN KEY ("skillItemId") REFERENCES "SkillItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermRemark" ADD CONSTRAINT "TermRemark_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportCardConfig" ADD CONSTRAINT "ReportCardConfig_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
