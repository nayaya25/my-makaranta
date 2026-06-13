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
  try {
    return await request<T>(path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      session.clear();
      if (typeof window !== "undefined") window.location.replace("/login");
    }
    throw err;
  }
}

export interface AuthUser {
  id: string;
  phone: string;
  schoolId: string | null;
  identityType: string;
}

export interface School {
  id: string;
  name: string;
  slug: string | null;
  country: string | null;
  currency: string | null;
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
}

export interface Parent {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
}

export const api = {
  requestOtp: (phone: string) =>
    request<void>("/auth/otp/request", { method: "POST", body: JSON.stringify({ phone }) }),
  verifyOtp: (phone: string, code: string) =>
    request<{ token: string; user: AuthUser }>("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ phone, code }),
    }),

  createSchool: (data: { name: string; slug?: string; country?: string; currency?: string }) =>
    authedRequest<{ school: School; token: string }>("/v1/schools", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getMySchool: () => authedRequest<School>("/v1/schools/me"),

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
      body: JSON.stringify(data),
    }),
  listClassLevels: () => authedRequest<ClassLevel[]>("/v1/class-levels"),

  listClasses: () => authedRequest<Class[]>("/v1/classes"),
  createClass: (data: { classLevelId: string; name: string }) =>
    authedRequest<Class>("/v1/classes", { method: "POST", body: JSON.stringify(data) }),

  listSubjects: () => authedRequest<Subject[]>("/v1/subjects"),
  createSubject: (data: { name: string; code: string }) =>
    authedRequest<Subject>("/v1/subjects", { method: "POST", body: JSON.stringify(data) }),

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

  listStaff: () => authedRequest<Staff[]>("/v1/staff"),
  createStaff: (data: {
    staffNo: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  }) =>
    authedRequest<Staff>("/v1/staff", { method: "POST", body: JSON.stringify(data) }),

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
};
