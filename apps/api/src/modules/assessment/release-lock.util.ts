import { ForbiddenException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

export async function assertNotReleased(
  prisma: PrismaClient,
  classId: string,
  termId: string,
): Promise<void> {
  const existing = await prisma.release.findUnique({
    where: { classId_termId: { classId, termId } },
  });
  if (existing) {
    throw new ForbiddenException("Results released — locked.");
  }
}
