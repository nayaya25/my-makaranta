-- AddForeignKey
ALTER TABLE "SubjectCategory" ADD CONSTRAINT "SubjectCategory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
