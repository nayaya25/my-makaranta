-- Enforce one staff per phone within a school (mirrors Parent's unique).
CREATE UNIQUE INDEX "Staff_schoolId_phone_key" ON "Staff"("schoolId", "phone");
