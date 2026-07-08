CREATE TABLE "MessageTemplate" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessageTemplate_schoolId_key_key" ON "MessageTemplate"("schoolId","key");
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
