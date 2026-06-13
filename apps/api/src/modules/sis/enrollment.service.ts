import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { CreateEnrollmentDto } from "./dto/enrollment.dto";

@Injectable()
export class EnrollmentService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateEnrollmentDto) {
    return this.prisma.enrollment.upsert({
      where: { studentId_termId: { studentId: dto.studentId, termId: dto.termId } },
      create: {
        studentId: dto.studentId,
        classId: dto.classId,
        termId: dto.termId,
      },
      update: {
        classId: dto.classId,
      },
    });
  }
}
