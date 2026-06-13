import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { STORAGE_SERVICE, type StorageService } from "../../core/storage/storage.types";
import { TenantContext } from "../../core/tenant/tenant.context";
import { CreateStudentDto, UpdateStudentDto } from "./dto/student.dto";

const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private storage: StorageService,
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

  async findAll() {
    return this.prisma.student.findMany();
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
    return student;
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
    if (!ALLOWED_PHOTO_TYPES.has(file.mimetype)) {
      throw new BadRequestException("Photo must be JPEG, PNG, or WebP.");
    }
    if (file.size > MAX_PHOTO_BYTES) throw new BadRequestException("Photo must be 5MB or smaller.");

    // findUnique is tenant-scoped → null for another school's student.
    const student = await this.prisma.student.findUnique({ where: { id } });
    if (!student) throw new NotFoundException("Student not found");

    const ext = file.mimetype === "image/png" ? "png" : file.mimetype === "image/webp" ? "webp" : "jpg";
    const schoolId = TenantContext.schoolIdOrThrow();
    const key = `photos/${schoolId}/${id}.${ext}`;
    await this.storage.put(key, file.buffer, { contentType: file.mimetype });
    const photoUrl = await this.storage.getSignedUrl(key);

    await this.prisma.student.update({ where: { id }, data: { photoUrl } });
    return { photoUrl };
  }
}
