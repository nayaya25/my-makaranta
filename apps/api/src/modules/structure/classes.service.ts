import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { CreateClassDto } from "./dto/classes.dto";

@Injectable()
export class ClassesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateClassDto) {
    return this.prisma.class.create({
      data: {
        classLevelId: dto.classLevelId,
        name: dto.name,
        ...(dto.formTeacherId ? { formTeacherId: dto.formTeacherId } : {}),
      } as never,
    });
  }

  async findAll() {
    return this.prisma.class.findMany({ include: { classLevel: true } });
  }
}
