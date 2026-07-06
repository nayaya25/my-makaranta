CREATE TABLE "ScheduleInstallment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "classLevelId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "label" TEXT,
  "percentBps" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduleInstallment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ScheduleInstallment_classLevelId_termId_order_key" ON "ScheduleInstallment"("classLevelId","termId","order");
CREATE INDEX "ScheduleInstallment_schoolId_classLevelId_termId_idx" ON "ScheduleInstallment"("schoolId","classLevelId","termId");

CREATE TABLE "Installment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "label" TEXT,
  "amountKobo" INTEGER NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Installment_invoiceId_order_key" ON "Installment"("invoiceId","order");
CREATE INDEX "Installment_schoolId_invoiceId_idx" ON "Installment"("schoolId","invoiceId");

ALTER TABLE "ScheduleInstallment" ADD CONSTRAINT "ScheduleInstallment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleInstallment" ADD CONSTRAINT "ScheduleInstallment_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleInstallment" ADD CONSTRAINT "ScheduleInstallment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
