-- Generalize AnnouncementRecipient to a polymorphic recipient (PARENT/STAFF),
-- preserving slice-1 PARENT rows.
ALTER TABLE "AnnouncementRecipient" ADD COLUMN "recipientType" TEXT;
ALTER TABLE "AnnouncementRecipient" ADD COLUMN "recipientId" TEXT;

UPDATE "AnnouncementRecipient" SET "recipientType" = 'PARENT', "recipientId" = "parentId";

ALTER TABLE "AnnouncementRecipient" ALTER COLUMN "recipientType" SET NOT NULL;
ALTER TABLE "AnnouncementRecipient" ALTER COLUMN "recipientId" SET NOT NULL;

ALTER TABLE "AnnouncementRecipient" DROP CONSTRAINT "AnnouncementRecipient_parentId_fkey";
DROP INDEX "AnnouncementRecipient_announcementId_parentId_key";
DROP INDEX "AnnouncementRecipient_schoolId_parentId_idx";
ALTER TABLE "AnnouncementRecipient" DROP COLUMN "parentId";

CREATE UNIQUE INDEX "AnnouncementRecipient_ann_type_id_key" ON "AnnouncementRecipient"("announcementId", "recipientType", "recipientId");
CREATE INDEX "AnnouncementRecipient_school_type_id_idx" ON "AnnouncementRecipient"("schoolId", "recipientType", "recipientId");
