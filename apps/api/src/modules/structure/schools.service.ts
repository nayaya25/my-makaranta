import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

/** Public branding fields returned by the tenant-resolve endpoint. Never includes
 *  counts, contacts, fees, or any other non-public field. */
export interface PublicTenantDto {
  id: string;
  name: string;
  slug: string;
  themeKey: string;
  logoUrl: string | null;
  motto: string | null;
}
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../core/prisma/prisma.service";
import { STORAGE_SERVICE, type StorageService } from "../../core/storage/storage.types";
import { sniffImageType, extForImage } from "../../core/storage/image-sniff";
import { CreateSchoolDto, UpdateBrandingDto, UpdateSchoolDto } from "./dto/schools.dto";
import { validateSlug } from "../../core/tenant/slug";
import { PALETTE_KEYS } from "../../core/tenant/palette-keys";
import { seedSkillDefaults } from "../../../prisma/seed-skill-defaults";
import { seedSubjectCategories } from "../../../prisma/seed-subject-categories";

// Raster types only — SVG is excluded deliberately: an uploaded SVG can carry
// inline scripts and would execute as same-origin stored XSS when its signed
// /files URL is opened directly. Format is verified by magic bytes, not the
// client-supplied mimetype.
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

    const slugError = validateSlug(slug);
    if (slugError) throw new BadRequestException(slugError);

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

    await seedSkillDefaults(this.prisma, school.id);
    await seedSubjectCategories(this.prisma, school.id);

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
    if (file.size > MAX_IMAGE_BYTES) throw new BadRequestException("Logo must be 5MB or smaller.");
    // Verify by magic bytes — the client-supplied mimetype is not trusted (and
    // this rejects SVG, which would be a stored-XSS vector).
    const type = sniffImageType(file.buffer);
    if (!type) throw new BadRequestException("Logo must be a valid JPEG, PNG, or WebP image.");

    const ext = extForImage(type);
    const key = `logos/${schoolId}.${ext}`;
    await this.storage.put(key, file.buffer, { contentType: type });
    await this.prisma.school.update({ where: { id: schoolId }, data: { logoUrl: key } });
    return { logoUrl: await this.storage.getSignedUrl(key) };
  }

  /**
   * Resolves a school by slug for the public tenant endpoint.
   * CRITICAL: selects ONLY public branding fields — never contacts, counts, or fees.
   */
  async findPublicBySlug(slug: string): Promise<PublicTenantDto> {
    const school = await this.prisma.school.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        themeKey: true,
        logoUrl: true,
        motto: true,
      },
    });
    if (!school) throw new NotFoundException(`No school found for slug "${slug}".`);
    return this.signLogo(school);
  }

  async updateBranding(schoolId: string | null, dto: UpdateBrandingDto) {
    if (!schoolId) throw new NotFoundException("No school associated with this account.");

    if (dto.themeKey !== undefined && !(PALETTE_KEYS as readonly string[]).includes(dto.themeKey)) {
      throw new BadRequestException(
        `themeKey must be one of: ${PALETTE_KEYS.join(", ")}`,
      );
    }

    const school = await this.prisma.school.update({
      where: { id: schoolId },
      data: {
        ...(dto.themeKey !== undefined ? { themeKey: dto.themeKey } : {}),
        ...(dto.motto !== undefined ? { motto: dto.motto } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.state !== undefined ? { state: dto.state } : {}),
        ...(dto.technicalContact?.name !== undefined
          ? { technicalContactName: dto.technicalContact.name }
          : {}),
        ...(dto.technicalContact?.phone !== undefined
          ? { technicalContactPhone: dto.technicalContact.phone }
          : {}),
        ...(dto.technicalContact?.email !== undefined
          ? { technicalContactEmail: dto.technicalContact.email }
          : {}),
      },
    });
    return this.signLogo(school);
  }
}
