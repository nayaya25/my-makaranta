import { LessonPlanStatus } from "@prisma/client";

export const ALLOWED_TRANSITIONS: Record<LessonPlanStatus, LessonPlanStatus[]> = {
  DRAFT: ["SUBMITTED"],
  RETURNED: ["SUBMITTED"],
  SUBMITTED: ["APPROVED", "RETURNED"],
  APPROVED: [],
};
