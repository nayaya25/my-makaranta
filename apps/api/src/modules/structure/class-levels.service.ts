import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { ClassLevelItemDto } from "./dto/class-levels.dto";

@Injectable()
export class ClassLevelsService {
  constructor(private prisma: PrismaService) {}

  async createMany(items: ClassLevelItemDto[]) {
    const created = await Promise.all(
      items.map((item) =>
        this.prisma.classLevel.create({ data: { name: item.name, order: item.order } as never }),
      ),
    );
    return created;
  }

  async findAll() {
    return this.prisma.classLevel.findMany({ orderBy: { order: "asc" } });
  }
}
