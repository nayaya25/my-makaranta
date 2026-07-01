CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED','UNDER_REVIEW','OFFERED','ACCEPTED','ENROLLED','REJECTED','WAITLISTED');
CREATE TYPE "ApplicantSource" AS ENUM ('PUBLIC','STAFF');

CREATE TABLE "Applicant" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "applicationNo" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "middleName" TEXT,
  "lastName" TEXT NOT NULL,
  "gender" "Gender" NOT NULL,
  "dateOfBirth" TIMESTAMP(3) NOT NULL,
  "stateOfOrigin" TEXT,
  "desiredClassLevelId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "guardianName" TEXT NOT NULL,
  "guardianPhone" TEXT NOT NULL,
  "guardianEmail" TEXT,
  "guardianRelation" "GuardianRelation" NOT NULL,
  "previousSchool" TEXT,
  "source" "ApplicantSource" NOT NULL,
  "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
  "reviewNote" TEXT,
  "rejectionReason" TEXT,
  "decidedAt" TIMESTAMP(3),
  "convertedStudentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Applicant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Applicant_convertedStudentId_key" ON "Applicant"("convertedStudentId");
CREATE UNIQUE INDEX "Applicant_schoolId_applicationNo_key" ON "Applicant"("schoolId","applicationNo");
CREATE INDEX "Applicant_schoolId_status_idx" ON "Applicant"("schoolId","status");

ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_desiredClassLevelId_fkey" FOREIGN KEY ("desiredClassLevelId") REFERENCES "ClassLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Applicant" ADD CONSTRAINT "Applicant_convertedStudentId_fkey" FOREIGN KEY ("convertedStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
