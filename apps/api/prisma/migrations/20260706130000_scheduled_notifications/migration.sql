CREATE TABLE "NotificationSettings" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "feeRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
  "reminderOffsetDays" INTEGER[] NOT NULL DEFAULT ARRAY[-3, 0, 3],
  "resultsReadyEnabled" BOOLEAN NOT NULL DEFAULT true,
  "channels" TEXT[] NOT NULL DEFAULT ARRAY['SMS','EMAIL'],
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationSettings_schoolId_key" ON "NotificationSettings"("schoolId");

CREATE TABLE "NotificationLog" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "channels" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationLog_schoolId_dedupeKey_key" ON "NotificationLog"("schoolId","dedupeKey");
CREATE INDEX "NotificationLog_schoolId_kind_createdAt_idx" ON "NotificationLog"("schoolId","kind","createdAt");

ALTER TABLE "Announcement" ADD COLUMN "scheduledFor" TIMESTAMP(3);
ALTER TABLE "Announcement" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SENT';

ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
