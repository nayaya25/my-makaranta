import type { PrismaService } from "../../core/prisma/prisma.service";

export interface StudentImportRow {
  admissionNo?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  gender?: string;
  dateOfBirth?: string;
  stateOfOrigin?: string;
  parentPhone?: string;
  parentFirstName?: string;
  parentLastName?: string;
  guardianRelationship?: string;
}

export interface ImportResult {
  total: number;
  imported: number;
  failed: number;
  errors: Array<{ row: number; admissionNo?: string; message: string }>;
}

const GENDERS: Record<string, "MALE" | "FEMALE"> = {
  m: "MALE",
  male: "MALE",
  f: "FEMALE",
  female: "FEMALE",
};

const RELATIONSHIPS = new Set([
  "MOTHER",
  "FATHER",
  "GUARDIAN",
  "GRANDPARENT",
  "AUNT",
  "UNCLE",
  "OTHER",
]);

/**
 * Validate + insert a batch of student rows within the AMBIENT tenant context
 * (caller must wrap in TenantContext.run). Per-row errors are collected, never thrown,
 * so one bad row never aborts the batch. Relies on the Prisma tenant middleware to scope
 * inserts to the current school.
 */
export async function runStudentImport(
  prisma: PrismaService,
  rows: StudentImportRow[],
): Promise<ImportResult> {
  const result: ImportResult = { total: rows.length, imported: 0, failed: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const line = i + 1;
    const fail = (message: string) => {
      result.failed++;
      result.errors.push({ row: line, admissionNo: row.admissionNo, message });
    };

    const admissionNo = row.admissionNo?.trim();
    const firstName = row.firstName?.trim();
    const lastName = row.lastName?.trim();
    const gender = row.gender ? GENDERS[row.gender.trim().toLowerCase()] : undefined;
    const dob = row.dateOfBirth ? new Date(row.dateOfBirth) : undefined;

    if (!admissionNo) {
      fail("admissionNo is required");
      continue;
    }
    if (!firstName) {
      fail("firstName is required");
      continue;
    }
    if (!lastName) {
      fail("lastName is required");
      continue;
    }
    if (!gender) {
      fail(`gender must be Male or Female (got "${row.gender ?? ""}")`);
      continue;
    }
    if (!dob || Number.isNaN(dob.getTime())) {
      fail(`dateOfBirth is invalid (got "${row.dateOfBirth ?? ""}")`);
      continue;
    }

    try {
      const student = await prisma.student.create({
        data: {
          admissionNo,
          firstName,
          middleName: row.middleName?.trim() || null,
          lastName,
          gender,
          dateOfBirth: dob,
          stateOfOrigin: row.stateOfOrigin?.trim() || null,
        } as never,
      });

      const parentPhone = row.parentPhone?.trim();
      if (parentPhone) {
        let parent = await prisma.parent.findFirst({ where: { phone: parentPhone } });
        if (!parent) {
          parent = await prisma.parent.create({
            data: {
              phone: parentPhone,
              firstName: row.parentFirstName?.trim() || firstName,
              lastName: row.parentLastName?.trim() || lastName,
            } as never,
          });
        }
        const rel = (row.guardianRelationship?.trim().toUpperCase() ?? "GUARDIAN");
        await prisma.guardian.create({
          data: {
            studentId: student.id,
            parentId: parent.id,
            relationship: (RELATIONSHIPS.has(rel) ? rel : "GUARDIAN") as never,
            isPrimary: true,
          },
        });
      }

      result.imported++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fail(/Unique constraint/i.test(msg) ? `duplicate admissionNo "${admissionNo}"` : msg);
    }
  }

  return result;
}
