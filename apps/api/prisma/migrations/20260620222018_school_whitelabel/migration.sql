-- AlterTable
ALTER TABLE "School" ADD COLUMN     "motto" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "technicalContactEmail" TEXT,
ADD COLUMN     "technicalContactName" TEXT,
ADD COLUMN     "technicalContactPhone" TEXT,
ADD COLUMN     "themeKey" TEXT NOT NULL DEFAULT 'teal',
ADD COLUMN     "type" TEXT;
