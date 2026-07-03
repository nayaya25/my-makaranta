import type { Prisma } from "@prisma/client";

type Client = Prisma.TransactionClient;

const pad = (n: number) => String(n).padStart(4, "0");

export async function nextApplicationNo(
  tx: Client,
  schoolId: string,
  year: number,
): Promise<string> {
  const count = await tx.applicant.count({ where: { schoolId } });
  return `APP-${year}-${pad(count + 1)}`;
}

export async function nextAdmissionNo(
  tx: Client,
  schoolId: string,
  year: number,
): Promise<string> {
  const count = await tx.student.count({ where: { schoolId } });
  return `ADM-${year}-${pad(count + 1)}`;
}
