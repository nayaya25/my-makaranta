import { ApplicationStatus } from "@prisma/client";

/** Allowed generic transitions. ACCEPTED→ENROLLED is intentionally excluded here —
 *  it is the dedicated enroll() action (needs class/term) in AdmissionsService. */
export const ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  APPLIED: ["UNDER_REVIEW", "REJECTED", "WAITLISTED"],
  UNDER_REVIEW: ["OFFERED", "REJECTED", "WAITLISTED"],
  WAITLISTED: ["UNDER_REVIEW", "OFFERED", "REJECTED"],
  OFFERED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: [], // → ENROLLED only via enroll()
  ENROLLED: [],
  REJECTED: [],
};
