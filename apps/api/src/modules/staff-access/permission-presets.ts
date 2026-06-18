export const ROLE_PRESETS: Record<string, string[]> = {
  PRINCIPAL: ["students.view", "students.create", "students.update", "staff.view", "classes.view", "classes.manage", "attendance.mark", "attendance.view", "attendance.audit", "results.record", "results.review", "results.release", "results.correct", "assessment.configure", "fees.view", "announcements.create", "announcements.view", "reports.view"],
  FORM_TEACHER: ["students.view", "classes.view", "attendance.mark", "attendance.view", "results.record", "results.review", "announcements.view", "reports.view"],
  SUBJECT_TEACHER: ["students.view", "classes.view", "attendance.mark", "attendance.view", "results.record", "announcements.view"],
  BURSAR: ["students.view", "fees.view", "fees.manage", "reports.view", "announcements.view"],
  EXAM_OFFICER: ["students.view", "classes.view", "results.review", "results.release", "assessment.configure", "announcements.view"],
};
