CREATE TYPE "DiscountMethod" AS ENUM ('PERCENT','FIXED');

CREATE TABLE "DiscountScheme" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "method" "DiscountMethod" NOT NULL,
  "value" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscountScheme_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DiscountScheme_schoolId_name_key" ON "DiscountScheme"("schoolId","name");

CREATE TABLE "StudentDiscount" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "discountSchemeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentDiscount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StudentDiscount_studentId_discountSchemeId_key" ON "StudentDiscount"("studentId","discountSchemeId");
CREATE INDEX "StudentDiscount_schoolId_studentId_idx" ON "StudentDiscount"("schoolId","studentId");

CREATE TABLE "InvoiceDiscount" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "schemeId" TEXT,
  "name" TEXT NOT NULL,
  "amountKobo" INTEGER NOT NULL,
  CONSTRAINT "InvoiceDiscount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InvoiceDiscount_schoolId_invoiceId_idx" ON "InvoiceDiscount"("schoolId","invoiceId");

ALTER TABLE "Invoice" ADD COLUMN "grossKobo" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "discountKobo" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "DiscountScheme" ADD CONSTRAINT "DiscountScheme_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentDiscount" ADD CONSTRAINT "StudentDiscount_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentDiscount" ADD CONSTRAINT "StudentDiscount_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentDiscount" ADD CONSTRAINT "StudentDiscount_discountSchemeId_fkey" FOREIGN KEY ("discountSchemeId") REFERENCES "DiscountScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceDiscount" ADD CONSTRAINT "InvoiceDiscount_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceDiscount" ADD CONSTRAINT "InvoiceDiscount_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceDiscount" ADD CONSTRAINT "InvoiceDiscount_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "DiscountScheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
