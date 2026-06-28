import { randomInt } from "node:crypto";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { STORAGE_SERVICE, type StorageService } from "../../core/storage/storage.types";
import { sniffImageType, extForImage } from "../../core/storage/image-sniff";
import { TenantContext } from "../../core/tenant/tenant.context";
import { PasswordService } from "../../core/auth/password.service";
import { CreateStudentDto, UpdateStudentDto } from "./dto/student.dto";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Generates a temp password that satisfies the policy: min8 + upper + lower + digit + special */
function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const specials = "!@#$%&*";

  const rand = (set: string) => set[randomInt(0, set.length)];
  const extra = upper + lower + digits;

  // Guarantee one of each required class, then pad to 10 chars total
  const parts = [
    rand(upper),
    rand(upper),
    rand(lower),
    rand(lower),
    rand(digits),
    rand(digits),
    rand(specials),
    rand(extra),
    rand(extra),
    rand(extra),
  ];

  // Shuffle (Fisher-Yates with CSPRNG)
  for (let i = parts.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }
  return parts.join("");
}

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private storage: StorageService,
    private passwords: PasswordService,
  ) {}

  async create(dto: CreateStudentDto) {
    return this.prisma.student.create({
      data: {
        admissionNo: dto.admissionNo,
        firstName: dto.firstName,
        middleName: dto.middleName,
        lastName: dto.lastName,
        gender: dto.gender,
        dateOfBirth: new Date(dto.dateOfBirth),
        stateOfOrigin: dto.stateOfOrigin,
        photoUrl: dto.photoUrl,
      } as never,
    });
  }

  // Resolve a stored photo KEY to a fresh time-limited signed URL on read (external http(s)
  // URLs pass through). Never persist the signed URL — it would expire in the DB.
  private async signPhoto<T extends { photoUrl?: string | null }>(s: T): Promise<T> {
    if (s.photoUrl && !/^https?:\/\//.test(s.photoUrl)) {
      return { ...s, photoUrl: await this.storage.getSignedUrl(s.photoUrl) };
    }
    return s;
  }

  async findAll() {
    const list = await this.prisma.student.findMany();
    return Promise.all(list.map((s) => this.signPhoto(s)));
  }

  async findOne(id: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: {
        guardians: { include: { parent: true } },
        enrollments: { include: { class: true, term: true } },
      },
    });
    if (!student) throw new NotFoundException("Student not found");
    return this.signPhoto(student);
  }

  async update(id: string, dto: UpdateStudentDto) {
    await this.findOne(id);
    return this.prisma.student.update({
      where: { id },
      data: {
        ...(dto.admissionNo !== undefined ? { admissionNo: dto.admissionNo } : {}),
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.middleName !== undefined ? { middleName: dto.middleName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender as never } : {}),
        ...(dto.dateOfBirth !== undefined ? { dateOfBirth: new Date(dto.dateOfBirth) } : {}),
        ...(dto.stateOfOrigin !== undefined ? { stateOfOrigin: dto.stateOfOrigin } : {}),
        ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.student.delete({ where: { id } });
  }

  async setPhoto(id: string, file?: { buffer: Buffer; mimetype: string; size: number }) {
    if (!file) throw new BadRequestException("No file uploaded.");
    if (file.size > MAX_PHOTO_BYTES) throw new BadRequestException("Photo must be 5MB or smaller.");
    // Verify by magic bytes — the client-supplied mimetype is not trusted.
    const type = sniffImageType(file.buffer);
    if (!type) throw new BadRequestException("Photo must be a valid JPEG, PNG, or WebP image.");

    // findUnique is tenant-scoped → null for another school's student.
    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) throw new NotFoundException("Student not found");

    const ext = extForImage(type);
    const schoolId = TenantContext.schoolIdOrThrow();
    const key = `photos/${schoolId}/${id}.${ext}`;
    await this.storage.put(key, file.buffer, { contentType: type });

    // Persist the stable KEY; hand back a fresh signed URL for immediate display.
    await this.prisma.student.update({ where: { id }, data: { photoUrl: key } });
    return { photoUrl: await this.storage.getSignedUrl(key) };
  }

  /**
   * POST /v1/students/:id/login — provision or reset a student login.
   *
   * Tenant-scoped: the StudentProfile must belong to `callerSchoolId`.
   * Creates Person + Membership on first call; resets the password hash on subsequent calls.
   * Returns `{ studentId, tempPassword }` — shown once, not stored in plain.
   */
  async provisionLogin(profileId: string, callerSchoolId: string): Promise<{ studentId: string; tempPassword: string }> {
    // Generate and validate temp password before opening the transaction
    let tempPassword: string;
    let attempt = 0;
    do {
      tempPassword = generateTempPassword();
      if (attempt++ > 20) throw new Error("Could not generate a valid temp password");
    } while (this.passwords.validatePolicy(tempPassword) !== null);

    const result = await this.prisma.$transaction(async (tx) => {
      // Tenant scope: profile must belong to caller's school
      const profile = await tx.studentProfile.findFirst({
        where: { id: profileId, schoolId: callerSchoolId },
        include: { membership: { include: { person: true } } },
      });
      if (!profile) throw new NotFoundException("Student not found");

      // Hash only after confirming the profile exists (avoids ~300ms argon2 work on 404)
      const passwordHash = await this.passwords.hash(tempPassword);

      if (profile.membershipId && profile.membership) {
        // Existing login — reset password only, no new Membership
        await tx.person.update({
          where: { id: profile.membership.personId },
          data: { passwordHash },
        });
      } else {
        // No login yet — create Person, Membership, link to profile
        const person = await tx.person.create({
          data: { email: null, phone: null, passwordHash },
        });
        const membership = await tx.membership.create({
          data: { personId: person.id, schoolId: callerSchoolId, status: "active" },
        });
        await tx.studentProfile.update({
          where: { id: profileId },
          data: { membershipId: membership.id },
        });
      }

      return { studentId: profile.studentId };
    });

    return { studentId: result.studentId, tempPassword };
  }
}
