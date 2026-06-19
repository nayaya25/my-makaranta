import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { STORAGE_SERVICE, type StorageService } from "../../core/storage/storage.types";
import type { RequestUser } from "../../core/auth/current-user.decorator";
import { UpdateProfileDto } from "./dto/profile.dto";

const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export interface MyProfile {
  identityType: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  staffNo: string | null;
  preferredLang: string | null;
  /** Whether this account type supports a profile photo (only STAFF today). */
  photoSupported: boolean;
}

@Injectable()
export class ProfileService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private storage: StorageService,
  ) {}

  private async sign(key: string | null): Promise<string | null> {
    if (key && !/^https?:\/\//.test(key)) return this.storage.getSignedUrl(key);
    return key;
  }

  async getMe(user: RequestUser): Promise<MyProfile> {
    if (user.identityType === "STAFF") {
      const staff = await this.prisma.staff.findFirst({
        where: { id: user.identityId, schoolId: user.schoolId ?? undefined },
      });
      if (!staff) throw new NotFoundException("Staff profile not found.");
      return {
        identityType: "STAFF",
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        phone: staff.phone,
        photoUrl: await this.sign(staff.photoUrl),
        staffNo: staff.staffNo,
        preferredLang: null,
        photoSupported: true,
      };
    }

    if (user.identityType === "PARENT") {
      const parent = await this.prisma.parent.findFirst({
        where: { id: user.identityId, schoolId: user.schoolId ?? undefined },
      });
      if (!parent) throw new NotFoundException("Parent profile not found.");
      return {
        identityType: "PARENT",
        firstName: parent.firstName,
        lastName: parent.lastName,
        email: parent.email,
        phone: parent.phone,
        photoUrl: null,
        staffNo: null,
        preferredLang: parent.preferredLang,
        photoSupported: false,
      };
    }

    // PROPRIETOR (and any other User-backed identity): contact only.
    const u = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!u) throw new NotFoundException("Account not found.");
    return {
      identityType: u.identityType,
      firstName: null,
      lastName: null,
      email: u.email,
      phone: u.phone,
      photoUrl: null,
      staffNo: null,
      preferredLang: null,
      photoSupported: false,
    };
  }

  async updateMe(user: RequestUser, dto: UpdateProfileDto): Promise<MyProfile> {
    if (user.identityType === "STAFF") {
      await this.prisma.staff.updateMany({
        where: { id: user.identityId, schoolId: user.schoolId ?? undefined },
        data: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        },
      });
    } else if (user.identityType === "PARENT") {
      await this.prisma.parent.updateMany({
        where: { id: user.identityId, schoolId: user.schoolId ?? undefined },
        data: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.preferredLang !== undefined ? { preferredLang: dto.preferredLang as never } : {}),
        },
      });
    } else {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        },
      });
    }
    return this.getMe(user);
  }

  async setPhoto(
    user: RequestUser,
    file?: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<{ photoUrl: string }> {
    if (user.identityType !== "STAFF") {
      throw new BadRequestException("Profile photo is only available for staff accounts.");
    }
    if (!file) throw new BadRequestException("No file uploaded.");
    if (!ALLOWED_PHOTO_TYPES.has(file.mimetype)) {
      throw new BadRequestException("Photo must be JPEG, PNG, or WebP.");
    }
    if (file.size > MAX_PHOTO_BYTES) throw new BadRequestException("Photo must be 5MB or smaller.");

    const staff = await this.prisma.staff.findFirst({
      where: { id: user.identityId, schoolId: user.schoolId ?? undefined },
    });
    if (!staff) throw new NotFoundException("Staff profile not found.");

    const ext = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
    const key = `photos/staff/${staff.schoolId}/${staff.id}.${ext}`;
    await this.storage.put(key, file.buffer, { contentType: file.mimetype });
    await this.prisma.staff.update({ where: { id: staff.id }, data: { photoUrl: key } });
    return { photoUrl: await this.storage.getSignedUrl(key) };
  }
}
