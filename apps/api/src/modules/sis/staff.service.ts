import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { CreateStaffDto, UpdateStaffDto } from "./dto/staff.dto";

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateStaffDto) {
    return this.prisma.staff.create({
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
  }

  async findAll() {
    return this.prisma.staff.findMany();
  }

  async findOne(id: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id } });
    if (!staff) throw new NotFoundException("Staff not found");
    return staff;
  }

  async update(id: string, dto: UpdateStaffDto) {
    await this.findOne(id);
    return this.prisma.staff.update({
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
  }
}
