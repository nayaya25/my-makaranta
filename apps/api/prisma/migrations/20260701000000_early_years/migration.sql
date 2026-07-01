-- AlterTable: add isEarlyYears to ClassLevel
ALTER TABLE "ClassLevel" ADD COLUMN "isEarlyYears" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: add kind to SkillDomain
ALTER TABLE "SkillDomain" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'conduct';

-- AlterTable: add kind to SkillScalePoint
ALTER TABLE "SkillScalePoint" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'conduct';

-- DropIndex: old SkillDomain unique (schoolId, name)
DROP INDEX "SkillDomain_schoolId_name_key";

-- CreateIndex: new SkillDomain unique (schoolId, kind, name)
CREATE UNIQUE INDEX "SkillDomain_schoolId_kind_name_key" ON "SkillDomain"("schoolId", "kind", "name");

-- DropIndex: old SkillScalePoint unique (schoolId, value)
DROP INDEX "SkillScalePoint_schoolId_value_key";

-- CreateIndex: new SkillScalePoint unique (schoolId, kind, value)
CREATE UNIQUE INDEX "SkillScalePoint_schoolId_kind_value_key" ON "SkillScalePoint"("schoolId", "kind", "value");
