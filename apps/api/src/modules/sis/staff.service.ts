import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import { STORAGE_SERVICE, type StorageService } from "../../core/storage/storage.types";
import { sniffImageType, extForImage } from "../../core/storage/image-sniff";
import { CreateStaffDto, UpdateStaffDto } from "./dto/staff.dto";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

@Injectable()
export class StaffService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private storage: StorageService,
  ) {}

  /** Resolve a stored photo KEY to a fresh signed URL on read (external URLs pass through). */
  private async signPhoto<T extends { photoUrl?: string | null }>(s: T): Promise<T> {
    if (s.photoUrl && !/^https?:\/\//.test(s.photoUrl)) {
      return { ...s, photoUrl: await this.storage.getSignedUrl(s.photoUrl) };
    }
    return s;
  }

  async create(dto: CreateStaffDto) {
    try {
      return await this.prisma.staff.create({
        data: {
          staffNo: dto.staffNo,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone,
          photoUrl: dto.photoUrl,
          ...(dto.hiredAt !== undefined ? { hiredAt: new Date(dto.hiredAt) } : {}),
        } as never,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException("A staff member with that phone, email, or staff number already exists.");
      }
      throw e;
    }
  }

  async findAll() {
    const list = await this.prisma.staff.findMany();
    return Promise.all(list.map((s) => this.signPhoto(s)));
  }

  async findOne(id: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id } });
    if (!staff) throw new NotFoundException("Staff not found");
    return this.signPhoto(staff);
  }

  async update(id: string, dto: UpdateStaffDto) {
    await this.findOne(id);
    const updated = await this.prisma.staff.update({
      where: { id },
      data: {
        ...(dto.staffNo !== undefined ? { staffNo: dto.staffNo } : {}),
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl } : {}),
        ...(dto.hiredAt !== undefined ? { hiredAt: new Date(dto.hiredAt) } : {}),
      },
    });
    return this.signPhoto(updated);
  }

  async setPhoto(id: string, file?: { buffer: Buffer; mimetype: string; size: number }) {
    if (!file) throw new BadRequestException("No file uploaded.");
    if (file.size > MAX_PHOTO_BYTES) throw new BadRequestException("Photo must be 5MB or smaller.");
    // Verify by magic bytes — the client-supplied mimetype is not trusted.
    const type = sniffImageType(file.buffer);
    if (!type) throw new BadRequestException("Photo must be a valid JPEG, PNG, or WebP image.");

    const staff = await this.prisma.staff.findUnique({ where: { id } });
    if (!staff) throw new NotFoundException("Staff not found");

    const ext = extForImage(type);
    const key = `photos/staff/${staff.schoolId}/${id}.${ext}`;
    await this.storage.put(key, file.buffer, { contentType: type });
    await this.prisma.staff.update({ where: { id }, data: { photoUrl: key } });
    return { photoUrl: await this.storage.getSignedUrl(key) };
  }
}
