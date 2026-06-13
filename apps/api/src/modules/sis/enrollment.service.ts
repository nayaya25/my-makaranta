import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { CreateEnrollmentDto } from "./dto/enrollment.dto";

@Injectable()
export class EnrollmentService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateEnrollmentDto) {
    // Enrollment has no schoolId, so it isn't auto-scoped. Resolve all three ids through
    // tenant-scoped models first (findUnique returns null for another tenant's rows) to
    // prevent cross-tenant enrollment writes.
    const [student, cls, term] = await Promise.all([
      this.prisma.student.findUnique({ where: { id: dto.studentId } }),
      this.prisma.class.findUnique({ where: { id: dto.classId } }),
      this.prisma.term.findUnique({ where: { id: dto.termId } }),
    ]);
    if (!student || !cls || !term) {
      throw new NotFoundException("Student, class, or term not found in this school");
    }

    return this.prisma.enrollment.upsert({
      where: { studentId_termId: { studentId: dto.studentId, termId: dto.termId } },
      create: { studentId: dto.studentId, classId: dto.classId, termId: dto.termId },
      update: { classId: dto.classId },
    });
  }
}
