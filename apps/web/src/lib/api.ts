import { session } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

async function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = session.token();
  if (!token) {
    if (typeof window !== "undefined") {
      session.clear();
      window.location.replace("/login");
    }
    throw new ApiError(401, "Not authenticated");
  }
  // Attach the tenant header so the API's TenantGuard can validate it.
  const schoolId = session.user()?.schoolId;
  const tenantHeaders: Record<string, string> = schoolId
    ? { "x-tenant-school-id": schoolId }
    : {};
  try {
    return await request<T>(path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...tenantHeaders, ...(init?.headers ?? {}) },
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      session.clear();
      if (typeof window !== "undefined") window.location.replace("/login");
    }
    throw err;
  }
}

/** POST a single image file as multipart/form-data (field "file") to an authed endpoint. */
async function uploadFile<T>(path: string, file: File): Promise<T> {
  const token = session.token();
  if (!token) {
    if (typeof window !== "undefined") {
      session.clear();
      window.location.replace("/login");
    }
    throw new ApiError(401, "Not authenticated");
  }
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.message ?? `Upload failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export interface AuthUser {
  id: string;
  phone: string | null;
  email: string | null;
  schoolId: string | null;
  identityType: string;
}

export interface School {
  id: string;
  name: string;
  slug: string | null;
  country: string | null;
  currency: string | null;
  logoUrl?: string | null;
}

export interface MyProfile {
  identityType: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  staffNo: string | null;
  preferredLang: string | null;
  photoSupported: boolean;
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  terms: Term[];
}

export interface Term {
  id?: string;
  number: number;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

export interface ClassLevel {
  id: string;
  name: string;
  order: number;
  isEarlyYears?: boolean;
}

export interface Class {
  id: string;
  name: string;
  classLevelId: string;
  classLevel?: ClassLevel;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  categoryId?: string | null;
}

export interface SubjectCategory {
  id: string;
  name: string;
}

export interface Student {
  id: string;
  admissionNo: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  stateOfOrigin?: string | null;
  guardians?: Guardian[];
  enrollments?: Enrollment[];
}

export interface Guardian {
  id: string;
  relationship: string;
  isPrimary: boolean;
  parent: Parent;
}

export interface Enrollment {
  id: string;
  class: Class;
  term: Term;
}

export interface Staff {
  id: string;
  staffNo: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  photoUrl?: string | null;
}

export interface Parent {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
}

export interface ImportRow {
  admissionNo: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  stateOfOrigin?: string;
  parentPhone?: string;
  parentFirstName?: string;
  parentLastName?: string;
  guardianRelationship?: string;
}

export interface ImportJobStatus {
  id: string;
  state: "waiting" | "active" | "completed" | "failed" | "delayed" | "paused";
  progress?: number;
  failedReason?: string;
  result?: {
    total: number;
    imported: number;
    failed: number;
    errors: { row: number; admissionNo?: string; message: string }[];
  };
}

export interface AssessmentType {
  id: string;
  name: string;
  maxScore: number;
  order: number;
  isDefault?: boolean;
  classLevelId?: string | null;
}

export interface GradeBoundary {
  id: string;
  grade: string;
  minScore: number;
  remark: string;
  order: number;
  isDefault?: boolean;
  classLevelId?: string | null;
}

export interface SubjectAssignment {
  id: string;
  subjectId: string;
  classId: string;
  staffId: string;
  academicYearId: string;
  subject?: { id: string; name: string; code: string };
  class?: { id: string; name: string };
  staff?: { id: string; firstName: string; lastName: string };
}

export interface GradebookStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  scores: Record<string, number>;
  total: number;
  grade: string | null;
  remark: string | null;
  complete: boolean;
}

export interface Gradebook {
  assessmentTypes: AssessmentType[];
  gradeBoundaries: GradeBoundary[];
  students: GradebookStudent[];
}

export interface ClassMasterSheet {
  subjects: Array<{ id: string; name: string }>;
  students: Array<{
    studentId: string;
    name: string;
    perSubject: Record<string, { total: number; grade: string | null; complete: boolean; anomaly: boolean }>;
    average: number;
  }>;
}

export interface SubjectMasterSheet {
  subjectMean: number;
  subjectStdDev: number;
  classes: Array<{
    classId: string;
    name: string;
    mean: number;
    drift: number;
    students: Array<{ studentId: string; name: string; total: number; grade: string | null; z: number; anomaly: boolean }>;
  }>;
}

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export interface AttendanceRecord {
  studentId: string;
  firstName: string;
  lastName: string;
  photoUrl?: string | null;
  status: AttendanceStatus | null;
  reason?: string | null;
}

export interface AttendanceDay {
  date: string;
  students: AttendanceRecord[];
}

export interface MarkAttendanceRecord {
  studentId: string;
  status: AttendanceStatus;
  reason?: string;
  idempotencyKey?: string;
}

export interface MarkAttendancePayload {
  classId: string;
  date: string;
  records: MarkAttendanceRecord[];
}

export interface AttendanceClassSummary {
  classId: string;
  className: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  rate: number;
}

export interface AttendanceAnomaly {
  studentId: string;
  name: string;
  absences: number;
}

export interface AttendanceSummary {
  classes: AttendanceClassSummary[];
  anomalies: AttendanceAnomaly[];
}

export interface ReleaseStatusRow {
  classId: string;
  name: string;
  released: boolean;
  releasedAt: string | null;
}

export interface ReleasedSheet {
  releasedAt: string;
  students: Array<{
    studentId: string;
    name: string;
    average: number;
    position: number;
    entries: Array<{ subjectId: string; subjectName: string; total: number; grade: string }>;
  }>;
}

export interface CorrectableComponent {
  assessmentTypeId: string;
  name: string;
  maxScore: number;
  value: number | null;
}

export interface CorrectScorePayload {
  classId: string;
  termId: string;
  studentId: string;
  subjectId: string;
  assessmentTypeId: string;
  newValue: number;
  reason: string;
  otpCode?: string;
}

export interface StandardReportCard {
  mode: "standard";
  school: { name: string; logoUrl?: string | null; motto?: string | null; principalSignatureUrl?: string | null };
  student: { name: string; admissionNo: string };
  className: string;
  term: { label: string };
  entries: Array<{ subjectId: string; subjectName: string; total: number; grade: string }>;
  subjectGroups?: Array<{
    category: string | null;
    subjects: Array<{ subjectId: string; subjectName: string; total: number; grade: string }>;
  }>;
  average: number;
  position: number;
  classSize: number;
  releasedAt: string;
  gradeKey: Array<{ grade: string; minScore: number; remark: string }>;
  verificationCode: string;
  // AC-1 T7 extended fields
  skills?: Array<{ domain: string; items: Array<{ name: string; value: number | null }> }>;
  scaleKey?: Array<{ value: number; label: string }>;
  remarks?: { formTeacher: string | null; principal: string | null };
  attendance?: { present: number; absent: number; total: number };
  config?: ReportCardConfig;
}

export interface EarlyYearsReportCard {
  mode: "early_years";
  school: { name: string; logoUrl?: string | null; motto?: string | null; principalSignatureUrl?: string | null };
  student: { name: string; admissionNo: string };
  class: { name: string };
  term: { label: string };
  areas: Array<{ area: string; items: Array<{ name: string; rating: { value: number; label: string } | null }> }>;
  scaleKey: Array<{ value: number; label: string }>;
  narrative: { formTeacher: string | null; principal: string | null };
  attendance: { present: number; absent: number; total: number };
  config?: ReportCardConfig;
}

export type ReportCard = StandardReportCard | EarlyYearsReportCard;

export type VerifyResult =
  | { valid: false }
  | {
      valid: true;
      student: string;
      className: string;
      term: string;
      school: string;
      average: number;
      position: number;
      issuedAt: string;
    };

export interface FeeItemRow { id: string; name: string; amountKobo: number; order: number; }
export interface InvoiceRow { studentId: string; name: string; classLevelName: string; totalKobo: number; paidKobo: number; balanceKobo: number; }
export interface InvoiceDetail {
  id: string;
  student: { name: string; admissionNo: string };
  term: { label: string };
  classLevelName: string;
  lines: Array<{ name: string; amountKobo: number }>;
  totalKobo: number; paidKobo: number; balanceKobo: number;
}

export interface CollectionRow {
  invoiceId: string; studentId: string; name: string;
  totalKobo: number; paidKobo: number; balanceKobo: number;
  dueDate: string | null; status: "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE"; lastRemindedAt: string | null;
}

export interface FinanceSummary {
  expectedKobo: number; collectedKobo: number; outstandingKobo: number; overdueKobo: number; collectedThisWeekKobo: number;
  byClassLevel: Array<{ classLevelId: string; classLevelName: string; expectedKobo: number; collectedKobo: number; outstandingKobo: number; studentCount: number }>;
}

export interface ProprietorDashboard {
  term: { id: string; name: string; number: number } | null;
  fees: { expectedKobo: number; collectedKobo: number; outstandingKobo: number; overdueKobo: number; collectedThisWeekKobo: number };
  attendance: { rate: number; presentDays: number; totalDays: number; windowFrom: string; windowTo: string };
  results: { classesReleased: number; classesTotal: number; topClass: { classId: string; name: string; average: number } | null };
}

export interface PrincipalClassRow {
  classId: string;
  className: string;
  formTeacher: string | null;
  attendance: { rate: number; presentDays: number; totalDays: number };
  results: { subjectsScored: number; subjectsOffered: number; released: boolean };
  fees: { expectedKobo: number; collectedKobo: number; paidRate: number };
}
export interface PrincipalDashboard {
  term: { id: string; name: string; number: number } | null;
  classes: PrincipalClassRow[];
}

export interface DashboardAlert {
  type: "ATTENDANCE_DIP" | "LOW_COLLECTION" | "RESULTS_OVERDUE";
  severity: "high" | "medium";
  classId: string;
  className: string;
  message: string;
}
export interface DashboardAlertsResponse {
  term: { id: string; name: string; number: number } | null;
  alerts: DashboardAlert[];
}

export interface BankRow { reference: string; amountKobo: number; narration: string; date?: string }
export interface MatchCandidateView { invoiceId: string; studentName: string; admissionNo: string; balanceKobo: number; score: number; confidence: "high" | "low" | "none" }
export interface ProposedMatch { row: BankRow; candidates: MatchCandidateView[]; suggestedInvoiceId: string | null }

export interface ParentInvoice {
  studentId: string;
  studentName: string;
  invoiceId: string;
  termLabel: string;
  totalKobo: number;
  paidKobo: number;
  balanceKobo: number;
  status: "UNPAID" | "PARTIAL" | "PAID" | "OVERDUE";
  dueDate: string | null;
}

export interface PublicReceipt {
  receiptNo: string;
  school: string;
  student: string;
  term: string;
  amountKobo: number;
  channel: string;
  paidAt: string;
  balanceAfterKobo: number;
}

// ─── /v1/me context (P4) ──────────────────────────────────────────────────────

export interface MeMembership {
  id: string;
  schoolId: string;
  schoolName: string;
  roles: string[];
  isStaff: boolean;
  isParent: boolean;
  isStudent: boolean;
}

export interface MeContext {
  personId: string;
  activeMembershipId: string;
  schoolId: string;
  roles: string[];
  perms: string[];
  profile: { isStaff: boolean; isParent: boolean; isStudent: boolean };
  person: { firstName: string; lastName: string };
  memberships: MeMembership[];
}

export interface MeLegacy {
  legacy: true;
  identityType: string;
  schoolId: string | null;
}

export type MeResponse = MeContext | MeLegacy;

/** Public branding info returned by GET /v1/public/tenant/:slug (no auth). */
export interface PublicTenant {
  id: string;
  name: string;
  slug: string;
  themeKey: string;
  logoUrl: string | null;
  motto: string | null;
}

/**
 * Check whether a school slug is available (public, no auth).
 * Returns `{ available: true, reason: null }` when free,
 * or `{ available: false, reason: "<why>" }` when invalid/taken.
 */
export async function checkSlug(slug: string): Promise<{ available: boolean; reason: string | null }> {
  return request<{ available: boolean; reason: string | null }>(
    `/v1/public/signup/slug-available?slug=${encodeURIComponent(slug)}`,
  );
}

export interface SignupBody {
  schoolName: string;
  slug: string;
  country: string;
  type?: string;
  firstName: string;
  lastName: string;
  gender: string;
  email: string;
  phone: string;
  password: string;
}

/**
 * Create a new school + proprietor account (public, no auth).
 * Returns `{ slug, schoolId }` on success.
 */
export async function signup(body: SignupBody): Promise<{ slug: string; schoolId: string }> {
  return request<{ slug: string; schoolId: string }>("/v1/public/signup", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Fetch public tenant branding by slug (no auth required).
 * Returns null when the tenant is not found (404).
 */
export async function getPublicTenant(slug: string): Promise<PublicTenant | null> {
  try {
    return await request<PublicTenant>(`/v1/public/tenant/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export interface SentAnnouncement {
  id: string;
  title: string;
  body: string;
  audienceType: "ALL" | "LEVEL" | "CLASS";
  audienceIds: string[];
  channels: string[];
  sentAt: string;
  recipientCount: number;
  readCount: number;
}
export interface ParentAnnouncement {
  recipientId: string;
  announcementId: string;
  title: string;
  body: string;
  sentAt: string;
  readAt: string | null;
}
export interface AnnouncementReceipts {
  id: string;
  title: string;
  body: string;
  audienceType: string;
  channels: string[];
  sentAt: string;
  aggregates: { total: number; readCount: number; smsCount: number; emailCount: number };
  recipients: { recipientType: "PARENT" | "STAFF"; recipientId: string; name: string; smsSent: boolean; emailSent: boolean; readAt: string | null }[];
}

export interface PermissionCatalog { catalog: { key: string; description: string }[]; presets: Record<string, string[]>; }

export interface Messageable { staffId?: string; staffName?: string; childName?: string; className?: string; parentId?: string; parentName?: string; studentName?: string; }
export interface ConversationRow { id: string; counterpartName: string; lastMessageAt: string | null; unreadCount: number; }
export interface ChatMessage { id: string; senderType: "PARENT" | "STAFF"; body: string; sentAt: string; readAt: string | null; }

// ─── Admissions ──────────────────────────────────────────────────────────────

export type ApplicationStatus =
  | "APPLIED"
  | "UNDER_REVIEW"
  | "OFFERED"
  | "ACCEPTED"
  | "ENROLLED"
  | "REJECTED"
  | "WAITLISTED";

export type ApplicantSource = "PUBLIC" | "STAFF";

export interface Applicant {
  id: string;
  schoolId: string;
  applicationNo: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  stateOfOrigin?: string | null;
  desiredClassLevelId: string;
  academicYearId: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string | null;
  guardianRelation: string;
  previousSchool?: string | null;
  source: ApplicantSource;
  status: ApplicationStatus;
  reviewNote?: string | null;
  rejectionReason?: string | null;
  decidedAt?: string | null;
  convertedStudentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Partial record — statuses with 0 applicants are omitted by the API. */
export type ApplicantStats = Partial<Record<ApplicationStatus, number>>;

export interface SkillItem { id: string; name: string; order: number; }
export interface SkillDomain { id: string; name: string; order: number; items: SkillItem[]; }
export interface SkillScalePoint { value: number; label: string; order: number; }
export interface SkillConfig { domains: SkillDomain[]; scale: SkillScalePoint[]; }

export interface SkillGridDomain { id: string; name: string; items: Array<{ id: string; name: string }>; }
export interface SkillGridStudent { studentId: string; name: string; }
export interface SkillGridRating { studentId: string; skillItemId: string; value: number; }
export interface SkillsGrid {
  locked: boolean;
  scale: Array<{ value: number; label: string }>;
  domains: SkillGridDomain[];
  students: SkillGridStudent[];
  ratings: SkillGridRating[];
}
export interface TermRemark {
  studentId: string;
  termId: string;
  formTeacherRemark?: string | null;
  principalRemark?: string | null;
}
export interface ReportCardConfig {
  id: string;
  layout: "classic" | "modern" | "compact";
  showSkills: boolean;
  showAttendance: boolean;
  showRemarks: boolean;
  showGradingKey: boolean;
  showPosition: boolean;
  nextTermBegins: string | null;
}

// ─── Timetable (OP-2) ────────────────────────────────────────────────────────

export interface Period {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  order: number;
  isBreak: boolean;
}

export interface ClassTimetable {
  periods: Period[];
  entries: {
    id: string;
    dayOfWeek: number;
    periodId: string;
    subjectAssignmentId: string;
    subjectName: string;
    teacherName: string;
  }[];
}

export interface TeacherTimetable {
  periods: Period[];
  entries: {
    dayOfWeek: number;
    periodId: string;
    className: string;
    subjectName: string;
  }[];
}

// ─── Lesson plans (OP-3) ───────────────────────────────────────────────────

export type LessonPlanStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "RETURNED";

export interface LessonPlan {
  id: string;
  subjectAssignmentId: string;
  termId: string;
  weekNumber: number;
  topic: string | null;
  objectives: string | null;
  activities: string | null;
  resources: string | null;
  assessment: string | null;
  notes: string | null;
  status: LessonPlanStatus;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export interface LessonPlanQueueItem {
  id: string;
  weekNumber: number;
  submittedAt: string | null;
  subjectName: string;
  className: string;
  teacherName: string;
  termId: string;
}

export const api = {
  requestOtp: (target: { phone?: string; email?: string }) =>
    request<void>("/auth/otp/request", { method: "POST", body: JSON.stringify(target) }),
  verifyOtp: (target: { phone?: string; email?: string }, code: string) =>
    request<{ token: string; user: AuthUser }>("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ ...target, code }),
    }),

  createSchool: (data: { name: string; slug?: string; country?: string; currency?: string }) =>
    authedRequest<{ school: School; token: string }>("/v1/schools", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getMySchool: () => authedRequest<School>("/v1/schools/me"),
  updateSchool: (data: { name?: string; country?: string; currency?: string }) =>
    authedRequest<School>("/v1/schools/me", { method: "PATCH", body: JSON.stringify(data) }),
  uploadSchoolLogo: (file: File) => uploadFile<{ logoUrl: string }>("/v1/schools/me/logo", file),

  createAcademicYear: (data: {
    name: string;
    startDate: string;
    endDate: string;
    terms: { number: number; startDate: string; endDate: string; isCurrent?: boolean }[];
  }) =>
    authedRequest<AcademicYear>("/v1/academic-years", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  createClassLevels: (data: { name: string; order: number }[]) =>
    authedRequest<ClassLevel[]>("/v1/class-levels", {
      method: "POST",
      body: JSON.stringify({ items: data }),
    }),
  listClassLevels: () => authedRequest<ClassLevel[]>("/v1/class-levels"),

  listClasses: () => authedRequest<Class[]>("/v1/classes"),
  createClass: (data: { classLevelId: string; name: string }) =>
    authedRequest<Class>("/v1/classes", { method: "POST", body: JSON.stringify(data) }),

  createAnnouncement: (input: { title: string; body: string; audienceType: "ALL" | "LEVEL" | "CLASS"; audienceIds: string[]; channels: ("SMS" | "EMAIL")[]; roles: ("PARENT" | "STAFF")[] }) =>
    authedRequest<{ id: string; recipientCount: number }>("/v1/announcements", { method: "POST", body: JSON.stringify(input) }),
  listAnnouncements: () => authedRequest<SentAnnouncement[]>("/v1/announcements"),
  getAnnouncementReceipts: (id: string) => authedRequest<AnnouncementReceipts>(`/v1/announcements/${id}`),
  getParentAnnouncements: () => authedRequest<ParentAnnouncement[]>("/v1/parent/announcements"),
  markAnnouncementRead: (announcementId: string) =>
    authedRequest<{ ok: boolean }>(`/v1/parent/announcements/${announcementId}/read`, { method: "POST" }),
  getMyAnnouncements: () => authedRequest<ParentAnnouncement[]>("/v1/me/announcements"),
  markMyAnnouncementRead: (announcementId: string) =>
    authedRequest<{ ok: boolean }>(`/v1/me/announcements/${announcementId}/read`, { method: "POST" }),

  listSubjects: () => authedRequest<Subject[]>("/v1/subjects"),
  createSubject: (data: { name: string; code: string }) =>
    authedRequest<Subject>("/v1/subjects", { method: "POST", body: JSON.stringify(data) }),
  updateSubject: (id: string, data: { name?: string; code?: string; categoryId?: string | null }) =>
    authedRequest<Subject>(`/v1/subjects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  listSubjectCategories: () => authedRequest<SubjectCategory[]>("/v1/subject-categories"),
  createSubjectCategory: (data: { name: string }) =>
    authedRequest<SubjectCategory>("/v1/subject-categories", { method: "POST", body: JSON.stringify(data) }),
  updateSubjectCategory: (id: string, data: { name: string }) =>
    authedRequest<SubjectCategory>(`/v1/subject-categories/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteSubjectCategory: (id: string) =>
    authedRequest<{ deleted: boolean }>(`/v1/subject-categories/${id}`, { method: "DELETE" }),

  importStudents: (rows: ImportRow[]) =>
    authedRequest<{ jobId: string }>("/v1/imports/students", {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),
  getImportStatus: (jobId: string) =>
    authedRequest<ImportJobStatus>(`/v1/imports/${jobId}`),

  listStudents: () => authedRequest<Student[]>("/v1/students"),
  getStudent: (id: string) => authedRequest<Student>(`/v1/students/${id}`),
  createStudent: (data: {
    admissionNo: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    gender: string;
    dateOfBirth: string;
    stateOfOrigin?: string;
  }) =>
    authedRequest<Student>("/v1/students", { method: "POST", body: JSON.stringify(data) }),
  updateStudent: (id: string, data: Partial<Student>) =>
    authedRequest<Student>(`/v1/students/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  uploadStudentPhoto: async (id: string, file: File): Promise<{ photoUrl: string }> => {
    const token = session.token();
    if (!token) {
      if (typeof window !== "undefined") {
        session.clear();
        window.location.replace("/login");
      }
      throw new ApiError(401, "Not authenticated");
    }
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${API_BASE}/v1/students/${id}/photo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, data.message ?? `Upload failed (${res.status})`);
    }
    return res.json() as Promise<{ photoUrl: string }>;
  },

  listStaff: () => authedRequest<Staff[]>("/v1/staff"),
  createStaff: (data: {
    staffNo: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  }) =>
    authedRequest<Staff>("/v1/staff", { method: "POST", body: JSON.stringify(data) }),
  getStaff: (id: string) => authedRequest<Staff>(`/v1/staff/${id}`),
  updateStaff: (
    id: string,
    data: { staffNo?: string; firstName?: string; lastName?: string; email?: string; phone?: string },
  ) => authedRequest<Staff>(`/v1/staff/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  uploadStaffPhoto: (id: string, file: File) =>
    uploadFile<{ photoUrl: string }>(`/v1/staff/${id}/photo`, file),

  // Current-user profile (polymorphic by identity)
  getMyProfile: () => authedRequest<MyProfile>("/v1/profile/me"),
  updateMyProfile: (data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    preferredLang?: string;
  }) => authedRequest<MyProfile>("/v1/profile/me", { method: "PATCH", body: JSON.stringify(data) }),
  uploadMyPhoto: (file: File) => uploadFile<{ photoUrl: string }>("/v1/profile/me/photo", file),

  createParent: (data: { phone: string; firstName: string; lastName: string; email?: string }) =>
    authedRequest<Parent>("/v1/parents", { method: "POST", body: JSON.stringify(data) }),
  addGuardian: (
    studentId: string,
    data: { parentId: string; relationship: string; isPrimary?: boolean },
  ) =>
    authedRequest<Guardian>(`/v1/students/${studentId}/guardians`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  listAcademicYears: () => authedRequest<AcademicYear[]>("/v1/academic-years"),

  // Assessment config
  getAssessmentTypes: () => authedRequest<AssessmentType[]>("/v1/assessment/types"),
  putAssessmentTypes: (types: Array<{ name: string; maxScore: number; order: number }>) =>
    authedRequest<AssessmentType[]>("/v1/assessment/types", {
      method: "PUT",
      body: JSON.stringify({ types }),
    }),
  getGradeBoundaries: () => authedRequest<GradeBoundary[]>("/v1/assessment/grade-boundaries"),
  putGradeBoundaries: (
    boundaries: Array<{ grade: string; minScore: number; remark: string; order: number }>,
  ) =>
    authedRequest<GradeBoundary[]>("/v1/assessment/grade-boundaries", {
      method: "PUT",
      body: JSON.stringify({ boundaries }),
    }),
  applyGradeTemplate: (template: "WAEC" | "NECO") =>
    authedRequest<GradeBoundary[]>("/v1/assessment/grade-boundaries/apply-template", {
      method: "POST",
      body: JSON.stringify({ template }),
    }),

  // AC-2: per-level assessment format helpers
  listAssessmentTypes: (classLevelId?: string) =>
    authedRequest<AssessmentType[]>(
      classLevelId
        ? `/v1/assessment/types?classLevelId=${encodeURIComponent(classLevelId)}`
        : "/v1/assessment/types",
    ),
  createAssessmentType: (body: { name: string; maxScore: number; order: number; classLevelId?: string }) =>
    authedRequest<AssessmentType>("/v1/assessment/types", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  applyAssessmentFormat: (body: { sourceClassLevelId: string | null; targetClassLevelIds: string[] }) =>
    authedRequest<{ applied: number }>("/v1/assessment/types/apply", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // AC-2: per-level grade boundary helpers
  listGradeBoundaries: (classLevelId?: string) =>
    authedRequest<GradeBoundary[]>(
      classLevelId
        ? `/v1/assessment/grade-boundaries?classLevelId=${encodeURIComponent(classLevelId)}`
        : "/v1/assessment/grade-boundaries",
    ),
  createGradeBoundary: (body: { grade: string; minScore: number; remark: string; order: number; classLevelId?: string }) =>
    authedRequest<GradeBoundary>("/v1/assessment/grade-boundaries", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  applyGradeFormat: (body: { sourceClassLevelId: string | null; targetClassLevelIds: string[] }) =>
    authedRequest<{ applied: number }>("/v1/assessment/grade-boundaries/apply", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listSubjectAssignments: (classId: string, academicYearId: string) =>
    authedRequest<SubjectAssignment[]>(
      `/v1/assessment/subject-assignments?classId=${classId}&academicYearId=${academicYearId}`,
    ),
  createSubjectAssignment: (body: {
    subjectId: string;
    classId: string;
    staffId: string;
    academicYearId: string;
  }) =>
    authedRequest<SubjectAssignment>("/v1/assessment/subject-assignments", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateSubjectAssignment: (id: string, staffId: string) =>
    authedRequest<SubjectAssignment>(`/v1/assessment/subject-assignments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ staffId }),
    }),
  deleteSubjectAssignment: (id: string) =>
    authedRequest<{ deleted: boolean }>(`/v1/assessment/subject-assignments/${id}`, {
      method: "DELETE",
    }),
  getScores: (classId: string, subjectId: string, termId: string) =>
    authedRequest<Gradebook>(
      `/v1/assessment/scores?classId=${classId}&subjectId=${subjectId}&termId=${termId}`,
    ),
  saveScores: (body: {
    classId: string;
    subjectId: string;
    termId: string;
    scores: Array<{ studentId: string; assessmentTypeId: string; value: number }>;
  }) =>
    authedRequest<{ saved: number }>("/v1/assessment/scores", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getClassMaster: (classId: string, termId: string) =>
    authedRequest<ClassMasterSheet>(`/v1/assessment/review/class-master?classId=${classId}&termId=${termId}`),
  getSubjectMaster: (subjectId: string, termId: string) =>
    authedRequest<SubjectMasterSheet>(`/v1/assessment/review/subject-master?subjectId=${subjectId}&termId=${termId}`),

  // Attendance
  getClassAttendance: (classId: string, date: string) =>
    authedRequest<AttendanceDay>(`/v1/attendance/class/${classId}?date=${date}`),
  markAttendance: (payload: MarkAttendancePayload) =>
    authedRequest<{ saved: number }>("/v1/attendance/mark", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getAttendanceSummary: (from: string, to: string) =>
    authedRequest<AttendanceSummary>(`/v1/attendance/summary?from=${from}&to=${to}`),

  // Release
  getReleaseStatus: (termId: string) =>
    authedRequest<ReleaseStatusRow[]>(`/v1/assessment/release/status?termId=${termId}`),
  getReleasedSheet: (classId: string, termId: string) =>
    authedRequest<ReleasedSheet>(`/v1/assessment/release/sheet?classId=${classId}&termId=${termId}`),
  releaseClass: (classId: string, termId: string) =>
    authedRequest<{ released: number }>("/v1/assessment/release", {
      method: "POST",
      body: JSON.stringify({ classId, termId }),
    }),

  // Corrections
  getCorrectionConfig: () =>
    authedRequest<{ requireCorrectionOtp: boolean }>("/v1/assessment/correction/config"),
  setCorrectionConfig: (requireCorrectionOtp: boolean) =>
    authedRequest<{ requireCorrectionOtp: boolean }>("/v1/assessment/correction/config", {
      method: "PATCH",
      body: JSON.stringify({ requireCorrectionOtp }),
    }),
  getCorrectableScores: (classId: string, termId: string, studentId: string, subjectId: string) =>
    authedRequest<CorrectableComponent[]>(
      `/v1/assessment/correction/scores?classId=${classId}&termId=${termId}&studentId=${studentId}&subjectId=${subjectId}`,
    ),
  correctScore: (payload: CorrectScorePayload) =>
    authedRequest<{ corrected: boolean }>("/v1/assessment/correction", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  requestCorrectionOtp: (phone: string) =>
    request<void>("/auth/otp/request", { method: "POST", body: JSON.stringify({ phone }) }),

  // Report card + public verify
  getReportCard: (studentId: string, termId: string) =>
    authedRequest<ReportCard>(`/v1/assessment/report-card?studentId=${studentId}&termId=${termId}`),
  verifyResult: (code: string) =>
    request<VerifyResult>(`/v1/public/verify/${encodeURIComponent(code)}`),

  /** Stream the server-rendered PDF and trigger a browser download. */
  downloadReportCardPdf: async (studentId: string, termId: string): Promise<void> => {
    const token = session.token();
    if (!token) {
      if (typeof window !== "undefined") {
        session.clear();
        window.location.replace("/login");
      }
      throw new ApiError(401, "Not authenticated");
    }
    const schoolId = session.user()?.schoolId;
    const tenantHeaders: Record<string, string> = schoolId ? { "x-tenant-school-id": schoolId } : {};
    const res = await fetch(
      `${API_BASE}/v1/assessment/report-card.pdf?studentId=${encodeURIComponent(studentId)}&termId=${encodeURIComponent(termId)}`,
      { headers: { Authorization: `Bearer ${token}`, ...tenantHeaders } },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, (body as { message?: string }).message ?? `PDF download failed (${res.status})`);
    }
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = /filename="?([^";\n]+)"?/i.exec(disposition);
    const filename = match?.[1] ?? "report-card.pdf";
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },

  /** Build the PDF download URL (for use in &lt;a href&gt; or window.open). */
  reportCardPdfUrl: (studentId: string, termId: string): string =>
    `${API_BASE}/v1/assessment/report-card.pdf?studentId=${encodeURIComponent(studentId)}&termId=${encodeURIComponent(termId)}`,

  // Fees
  getFeeItems: (classLevelId: string, termId: string) =>
    authedRequest<FeeItemRow[]>(`/v1/fees/items?classLevelId=${classLevelId}&termId=${termId}`),
  setFeeItems: (classLevelId: string, termId: string, items: Array<{ name: string; amountKobo: number; order: number }>) =>
    authedRequest<FeeItemRow[]>("/v1/fees/items", { method: "POST", body: JSON.stringify({ classLevelId, termId, items }) }),
  generateInvoices: (termId: string) =>
    authedRequest<{ created: number; refreshed: number; skipped: number }>("/v1/fees/generate", { method: "POST", body: JSON.stringify({ termId }) }),
  getInvoices: (termId: string, classId?: string) =>
    authedRequest<InvoiceRow[]>(`/v1/fees/invoices?termId=${termId}${classId ? `&classId=${classId}` : ""}`),
  getInvoiceDetail: (studentId: string, termId: string) =>
    authedRequest<InvoiceDetail>(`/v1/fees/invoice?studentId=${studentId}&termId=${termId}`),
  getCollections: (termId: string) => authedRequest<CollectionRow[]>(`/v1/fees/collections?termId=${termId}`),
  getFinanceSummary: (termId: string) => authedRequest<FinanceSummary>(`/v1/fees/finance/summary?termId=${termId}`),
  getProprietorDashboard: (termId?: string) =>
    authedRequest<ProprietorDashboard>(`/v1/dashboard/proprietor${termId ? `?termId=${termId}` : ""}`),
  getPrincipalDashboard: (termId?: string) =>
    authedRequest<PrincipalDashboard>(`/v1/dashboard/principal${termId ? `?termId=${termId}` : ""}`),
  getDashboardAlerts: (termId?: string) =>
    authedRequest<DashboardAlertsResponse>(`/v1/dashboard/alerts${termId ? `?termId=${termId}` : ""}`),
  setDueDate: (termId: string, dueDate: string) =>
    authedRequest<{ updated: number }>("/v1/fees/collections/due-date", { method: "POST", body: JSON.stringify({ termId, dueDate }) }),
  remindInvoice: (invoiceId: string) =>
    authedRequest<{ recipientCount: number }>("/v1/fees/collections/remind", { method: "POST", body: JSON.stringify({ invoiceId }) }),
  remindAllOverdue: (termId: string) =>
    authedRequest<{ remindersSent: number; totalRecipients: number }>("/v1/fees/collections/remind-all", { method: "POST", body: JSON.stringify({ termId }) }),

  // Payments
  recordPayment: (invoiceId: string, amountKobo: number, channel: "CASH" | "BANK_TRANSFER", reference?: string) =>
    authedRequest<{ paymentId: string; receiptCode: string }>("/v1/payments/record", { method: "POST", body: JSON.stringify({ invoiceId, amountKobo, channel, reference }) }),
  initializeOnline: (invoiceId: string, amountKobo: number, email: string) =>
    authedRequest<{ reference: string; authorizationUrl: string }>("/v1/payments/initialize", { method: "POST", body: JSON.stringify({ invoiceId, amountKobo, email }) }),
  verifyPayment: (reference: string) =>
    authedRequest<{ applied: boolean; status: string; receiptCode?: string }>("/v1/payments/verify", { method: "POST", body: JSON.stringify({ reference }) }),
  getPublicReceipt: (code: string) =>
    request<PublicReceipt | null>(`/v1/public/receipt/${encodeURIComponent(code)}`),

  // Reconciliation
  proposeMatches: (termId: string, rows: BankRow[]) =>
    authedRequest<ProposedMatch[]>("/v1/fees/reconcile/propose", { method: "POST", body: JSON.stringify({ termId, rows }) }),
  confirmMatches: (confirmations: Array<{ reference: string; amountKobo: number; invoiceId: string }>) =>
    authedRequest<{ recorded: number; skipped: number; errors: Array<{ reference: string; message: string }> }>("/v1/fees/reconcile/confirm", { method: "POST", body: JSON.stringify({ confirmations }) }),

  // Parent portal
  getParentInvoices: () => authedRequest<ParentInvoice[]>("/v1/parent/invoices"),
  parentPay: (invoiceId: string, amountKobo: number, email: string) =>
    authedRequest<{ reference: string; authorizationUrl: string }>("/v1/parent/pay", { method: "POST", body: JSON.stringify({ invoiceId, amountKobo, email }) }),
  parentPayVerify: (reference: string) =>
    authedRequest<{ applied: boolean; status: string; receiptCode?: string }>("/v1/parent/pay/verify", { method: "POST", body: JSON.stringify({ reference }) }),

  // Direct messaging
  getMessageable: () => authedRequest<Messageable[]>("/v1/me/messageable"),
  createConversation: (counterpartId: string) =>
    authedRequest<{ conversationId: string }>("/v1/me/conversations", { method: "POST", body: JSON.stringify({ counterpartId }) }),
  getConversations: () => authedRequest<ConversationRow[]>("/v1/me/conversations"),
  getMessages: (id: string) => authedRequest<ChatMessage[]>(`/v1/me/conversations/${id}/messages`),
  postMessage: (id: string, body: string) =>
    authedRequest<{ id: string; sentAt: string }>(`/v1/me/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) }),

  // Identity context (P4)
  getMe: () => authedRequest<MeResponse>("/v1/me"),
  switchContext: (membershipId: string) =>
    authedRequest<{ token: string }>("/v1/auth/context", {
      method: "POST",
      body: JSON.stringify({ membershipId }),
    }),

  // Permissions (RBAC)
  getPermissionsCatalog: () => authedRequest<PermissionCatalog>("/v1/permissions"),
  getStaffPermissions: (id: string) => authedRequest<{ keys: string[] }>(`/v1/staff/${id}/permissions`),
  setStaffPermissions: (id: string, keys: string[]) =>
    authedRequest<{ keys: string[] }>(`/v1/staff/${id}/permissions`, { method: "PUT", body: JSON.stringify({ keys }) }),
  getMyPermissions: () => authedRequest<{ keys: string[] }>("/v1/me/permissions"),

  // Skills config (AC-1 Task 3)
  getSkillConfig: (kind?: "conduct" | "early_years") =>
    authedRequest<SkillConfig>(kind ? `/v1/assessment/skill-domains?kind=${encodeURIComponent(kind)}` : "/v1/assessment/skill-domains"),
  createSkillDomain: (body: { name: string; order?: number; kind?: "conduct" | "early_years" }) =>
    authedRequest<SkillDomain>("/v1/assessment/skill-domains", { method: "POST", body: JSON.stringify(body) }),
  updateSkillDomain: (id: string, body: { name?: string; order?: number }) =>
    authedRequest<SkillDomain>(`/v1/assessment/skill-domains/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSkillDomain: (id: string) =>
    authedRequest<void>(`/v1/assessment/skill-domains/${id}`, { method: "DELETE" }),
  createSkillItem: (body: { domainId: string; name: string; order?: number }) =>
    authedRequest<SkillItem>("/v1/assessment/skill-items", { method: "POST", body: JSON.stringify(body) }),
  updateSkillItem: (id: string, body: { name?: string; order?: number }) =>
    authedRequest<SkillItem>(`/v1/assessment/skill-items/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSkillItem: (id: string) =>
    authedRequest<void>(`/v1/assessment/skill-items/${id}`, { method: "DELETE" }),
  getSkillScale: (kind?: "conduct" | "early_years") =>
    authedRequest<SkillScalePoint[]>(kind ? `/v1/assessment/skill-scale?kind=${encodeURIComponent(kind)}` : "/v1/assessment/skill-scale"),
  setSkillScale: (points: Array<{ value: number; label: string }>, kind?: "conduct" | "early_years") =>
    authedRequest<SkillScalePoint[]>("/v1/assessment/skill-scale", { method: "PUT", body: JSON.stringify({ points, ...(kind ? { kind } : {}) }) }),

  // Report-card config (AC-1 Task 6)
  getReportCardConfig: () => authedRequest<ReportCardConfig>("/v1/assessment/report-card-config"),
  putReportCardConfig: (body: Partial<Omit<ReportCardConfig, "id">>) =>
    authedRequest<ReportCardConfig>("/v1/assessment/report-card-config", { method: "PUT", body: JSON.stringify(body) }),

  // Class-level update (AC-3)
  updateClassLevel: (id: string, body: { isEarlyYears?: boolean }) =>
    authedRequest<ClassLevel>(`/v1/class-levels/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),

  // Skills grid + remarks (AC-1 Task 10)
  getSkillsGrid: (classId: string, termId: string, kind?: "conduct" | "early_years") =>
    authedRequest<SkillsGrid>(`/v1/assessment/skills/grid?classId=${encodeURIComponent(classId)}&termId=${encodeURIComponent(termId)}${kind ? `&kind=${encodeURIComponent(kind)}` : ""}`),
  saveSkillRatings: (body: { classId: string; termId: string; ratings: Array<{ studentId: string; skillItemId: string; value: number }>; kind?: "conduct" | "early_years" }) =>
    authedRequest<{ saved: number }>("/v1/assessment/skills", { method: "PUT", body: JSON.stringify(body) }),
  getRemarks: (studentId: string, termId: string) =>
    authedRequest<TermRemark | null>(`/v1/assessment/remarks?studentId=${encodeURIComponent(studentId)}&termId=${encodeURIComponent(termId)}`),
  putRemarks: (body: { studentId: string; termId: string; classId: string; formTeacherRemark?: string; principalRemark?: string }) =>
    authedRequest<TermRemark>("/v1/assessment/remarks", { method: "PUT", body: JSON.stringify(body) }),

  // ─── Admissions — staff (OP-1 Task 7) ──────────────────────────────────────
  listApplicants: (q?: { status?: ApplicationStatus; level?: string; year?: string; q?: string }) => {
    const params = new URLSearchParams();
    if (q?.status) params.set("status", q.status);
    if (q?.level) params.set("level", q.level);
    if (q?.year) params.set("year", q.year);
    if (q?.q) params.set("q", q.q);
    const qs = params.toString();
    return authedRequest<Applicant[]>(`/v1/admissions/applicants${qs ? `?${qs}` : ""}`);
  },
  getApplicant: (id: string) =>
    authedRequest<Applicant>(`/v1/admissions/applicants/${encodeURIComponent(id)}`),
  createApplicant: (dto: {
    firstName: string;
    middleName?: string;
    lastName: string;
    gender: string;
    dateOfBirth: string;
    stateOfOrigin?: string;
    desiredClassLevelId: string;
    academicYearId: string;
    guardianName: string;
    guardianPhone: string;
    guardianEmail?: string;
    guardianRelation: string;
    previousSchool?: string;
  }) =>
    authedRequest<Applicant>("/v1/admissions/applicants", {
      method: "POST",
      body: JSON.stringify(dto),
    }),
  transitionApplicant: (id: string, body: { to: ApplicationStatus; reason?: string }) =>
    authedRequest<Applicant>(`/v1/admissions/applicants/${encodeURIComponent(id)}/transition`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  enrollApplicant: (id: string, body: { classId: string; termId: string; admissionNo?: string }) =>
    authedRequest<{ studentId: string; admissionNo: string }>(
      `/v1/admissions/applicants/${encodeURIComponent(id)}/enroll`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  admissionsStats: () => authedRequest<ApplicantStats>("/v1/admissions/stats"),

  // ─── Timetable (OP-2) ────────────────────────────────────────────────────────
  listPeriods: () => authedRequest<Period[]>("/v1/timetable/periods"),
  createPeriod: (dto: { label: string; startTime: string; endTime: string; order: number; isBreak?: boolean }) =>
    authedRequest<Period>("/v1/timetable/periods", { method: "POST", body: JSON.stringify(dto) }),
  updatePeriod: (id: string, dto: { label?: string; startTime?: string; endTime?: string; order?: number; isBreak?: boolean }) =>
    authedRequest<Period>(`/v1/timetable/periods/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(dto) }),
  deletePeriod: (id: string) =>
    authedRequest<void>(`/v1/timetable/periods/${encodeURIComponent(id)}`, { method: "DELETE" }),
  getClassTimetable: (classId: string, academicYearId: string) =>
    authedRequest<ClassTimetable>(`/v1/timetable/class/${encodeURIComponent(classId)}?academicYearId=${encodeURIComponent(academicYearId)}`),
  getTeacherTimetable: (staffId: string, academicYearId: string) =>
    authedRequest<TeacherTimetable>(`/v1/timetable/teacher/${encodeURIComponent(staffId)}?academicYearId=${encodeURIComponent(academicYearId)}`),
  putTimetableEntry: (dto: { classId: string; academicYearId: string; dayOfWeek: number; periodId: string; subjectAssignmentId: string }) =>
    authedRequest<{ id: string }>("/v1/timetable/entry", { method: "PUT", body: JSON.stringify(dto) }),
  deleteTimetableEntry: (id: string) =>
    authedRequest<void>(`/v1/timetable/entry/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // ─── Lesson plans (OP-3) ─────────────────────────────────────────────────────
  getLessonPlans: (assignmentId: string, termId: string) =>
    authedRequest<LessonPlan[]>(
      `/v1/lesson-plans/assignment/${encodeURIComponent(assignmentId)}?termId=${encodeURIComponent(termId)}`,
    ),
  getLessonPlan: (id: string) => authedRequest<LessonPlan>(`/v1/lesson-plans/${encodeURIComponent(id)}`),
  putLessonPlan: (dto: {
    subjectAssignmentId: string;
    termId: string;
    weekNumber: number;
    topic?: string;
    objectives?: string;
    activities?: string;
    resources?: string;
    assessment?: string;
    notes?: string;
  }) => authedRequest<LessonPlan>("/v1/lesson-plans", { method: "PUT", body: JSON.stringify(dto) }),
  submitLessonPlan: (id: string) =>
    authedRequest<LessonPlan>(`/v1/lesson-plans/${encodeURIComponent(id)}/submit`, { method: "POST" }),
  reviewLessonPlan: (id: string, body: { decision: "APPROVED" | "RETURNED"; note?: string }) =>
    authedRequest<LessonPlan>(`/v1/lesson-plans/${encodeURIComponent(id)}/review`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  lessonPlanReviewQueue: (termId?: string) =>
    authedRequest<LessonPlanQueueItem[]>(
      `/v1/lesson-plans/review-queue${termId ? `?termId=${encodeURIComponent(termId)}` : ""}`,
    ),

  // ─── Admissions — public (unauthenticated, no bearer token) ─────────────────
  publicApply: (dto: {
    schoolSlug: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    gender: string;
    dateOfBirth: string;
    stateOfOrigin?: string;
    desiredClassLevelId: string;
    academicYearId: string;
    guardianName: string;
    guardianPhone: string;
    guardianEmail?: string;
    guardianRelation: string;
    previousSchool?: string;
  }) =>
    request<{ applicationNo: string }>("/v1/public/applications", {
      method: "POST",
      body: JSON.stringify(dto),
    }),
  publicAdmissionMeta: (slug: string) =>
    request<{ schoolName: string; classLevels: { id: string; name: string }[]; academicYears: { id: string; name: string }[] }>(
      `/v1/public/schools/${encodeURIComponent(slug)}/admission-meta`,
    ),
};
