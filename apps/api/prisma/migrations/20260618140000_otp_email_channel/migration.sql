-- OtpRequest: support email OTP alongside phone.
ALTER TABLE "OtpRequest" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "OtpRequest" ADD COLUMN "email" TEXT;
CREATE INDEX "OtpRequest_email_createdAt_idx" ON "OtpRequest"("email", "createdAt");
