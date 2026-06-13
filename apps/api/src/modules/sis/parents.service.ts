import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { CreateParentDto, CreateGuardianDto } from "./dto/parent.dto";

@Injectable()
export class ParentsService {
  constructor(private prisma: PrismaService) {}

  async createParent(dto: CreateParentDto) {
    return this.prisma.parent.create({
      data: {
        phone: dto.phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        ...(dto.preferredLang !== undefined ? { preferredLang: dto.preferredLang } : {}),
      } as never,
    });
  }

  async createGuardian(studentId: string, dto: CreateGuardianDto) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException("Student not found");

    return this.prisma.guardian.create({
      data: {
        studentId,
        parentId: dto.parentId,
        relationship: dto.relationship as never,
        isPrimary: dto.isPrimary ?? false,
      },
    });
  }

  async findGuardians(studentId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException("Student not found");

    return this.prisma.guardian.findMany({
      where: { studentId },
      include: { parent: true },
    });
  }
}
