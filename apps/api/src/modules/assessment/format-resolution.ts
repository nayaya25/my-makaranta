import type { PrismaClient } from "@prisma/client";

export async function resolveAssessmentTypes(
  prisma: PrismaClient,
  schoolId: string,
  classLevelId: string,
) {
  const overrides = await prisma.assessmentType.findMany({
    where: { schoolId, classLevelId },
    orderBy: { order: "asc" },
  });
  if (overrides.length) return overrides;
  return prisma.assessmentType.findMany({
    where: { schoolId, classLevelId: null },
    orderBy: { order: "asc" },
  });
}

export async function resolveGradeBoundaries(
  prisma: PrismaClient,
  schoolId: string,
  classLevelId: string,
) {
  const overrides = await prisma.gradeBoundary.findMany({
    where: { schoolId, classLevelId },
    orderBy: { order: "asc" },
  });
  if (overrides.length) return overrides;
  return prisma.gradeBoundary.findMany({
    where: { schoolId, classLevelId: null },
    orderBy: { order: "asc" },
  });
}
