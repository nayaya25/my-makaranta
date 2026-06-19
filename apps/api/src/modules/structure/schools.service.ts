import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../core/prisma/prisma.service";
import { STORAGE_SERVICE, type StorageService } from "../../core/storage/storage.types";
import { CreateSchoolDto, UpdateSchoolDto } from "./dto/schools.dto";

// Raster types only — SVG is excluded deliberately: an uploaded SVG can carry
// inline scripts and would execute as same-origin stored XSS when its signed
// /files URL is opened directly. Matches the staff/student photo allow-list.
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type SchoolRecord = { logoUrl?: string | null };

@Injectable()
export class SchoolsService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    @Inject(STORAGE_SERVICE) private storage: StorageService,
  ) {}

  /** Resolve a stored logo KEY to a fresh signed URL on read (external URLs pass through). */
  private async signLogo<T extends SchoolRecord>(school: T): Promise<T> {
    if (school.logoUrl && !/^https?:\/\//.test(school.logoUrl)) {
      return { ...school, logoUrl: await this.storage.getSignedUrl(school.logoUrl) };
    }
    return school;
  }

  async createSchool(dto: CreateSchoolDto, userId: string) {
    // Onboarding only: a user may bootstrap a school exactly once, while still PENDING.
    // Prevents an existing member from minting a new school and self-granting proprietor rights.
    const actor = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!actor) throw new NotFoundException("User not found.");
    if (actor.schoolId || actor.identityType !== "PENDING") {
      throw new ForbiddenException("This account already belongs to a school.");
    }

    const slug = dto.slug ?? dto.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const existing = await this.prisma.school.findUnique({ where: { slug } });
    if (existing) throw new BadRequestException(`School slug "${slug}" is already taken.`);

    const school = await this.prisma.school.create({
      data: {
        name: dto.name,
        slug,
        ...(dto.country ? { country: dto.country as never } : {}),
        ...(dto.currency ? { currency: dto.currency } : {}),
      },
    });

    const permissions = await this.prisma.permission.findMany();

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        schoolId: school.id,
        identityType: "PROPRIETOR",
        tokenVersion: { increment: 1 },
      },
    });

    if (permissions.length > 0) {
      await this.prisma.userPermission.createMany({
        data: permissions.map((p) => ({ userId, permissionId: p.id, scope: {} })),
        skipDuplicates: true,
      });
    }

    const token = await this.jwt.signAsync({
      sub: userId,
      phone: updatedUser.phone,
      schoolId: school.id,
      identityType: "PROPRIETOR",
      tokenVersion: updatedUser.tokenVersion,
    });

    return { school, token };
  }

  async getMySchool(schoolId: string | null) {
    if (!schoolId) throw new NotFoundException("No school associated with this account.");
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new NotFoundException("School not found.");
    return this.signLogo(school);
  }

  async updateMySchool(schoolId: string | null, dto: UpdateSchoolDto) {
    if (!schoolId) throw new NotFoundException("No school associated with this account.");
    const school = await this.prisma.school.update({
      where: { id: schoolId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.country !== undefined ? { country: dto.country as never } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      },
    });
    return this.signLogo(school);
  }

  async setLogo(
    schoolId: string | null,
    file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    if (!schoolId) throw new NotFoundException("No school associated with this account.");
    if (!file) throw new BadRequestException("No file uploaded.");
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException("Logo must be JPEG, PNG, or WebP.");
    }
    if (file.size > MAX_IMAGE_BYTES) throw new BadRequestException("Logo must be 5MB or smaller.");

    const ext = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
    const key = `logos/${schoolId}.${ext}`;
    await this.storage.put(key, file.buffer, { contentType: file.mimetype });
    await this.prisma.school.update({ where: { id: schoolId }, data: { logoUrl: key } });
    return { logoUrl: await this.storage.getSignedUrl(key) };
  }
}
