import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { CreateSubjectDto } from "./dto/subjects.dto";

@Injectable()
export class SubjectsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSubjectDto) {
    return this.prisma.subject.create({ data: { name: dto.name, code: dto.code } as never });
  }

  async findAll() {
    return this.prisma.subject.findMany();
  }
}
