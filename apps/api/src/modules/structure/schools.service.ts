import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../core/prisma/prisma.service";
import { CreateSchoolDto } from "./dto/schools.dto";

@Injectable()
export class SchoolsService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async createSchool(dto: CreateSchoolDto, userId: string) {
    // Onboarding only: a user may bootstrap a school exactly once, while still PENDING.
    // Prevents an existing member from minting a new school and self-granting proprietor rights.
    const actor = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!actor) throw new NotFoundException("User not found.");
    if (actor.schoolId || actor.identityType !== "PENDING") {
      throw new ForbiddenException("This account already belongs to a school.");
    }

    const slug = dto.slug ?? dto.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const existing = await this.prisma.school.findUnique({ where: { slug } });
    if (existing) throw new BadRequestException(`School slug "${slug}" is already taken.`);

    const school = await this.prisma.school.create({
      data: {
        name: dto.name,
        slug,
        ...(dto.country ? { country: dto.country as never } : {}),
        ...(dto.currency ? { currency: dto.currency } : {}),
      },
    });

    const permissions = await this.prisma.permission.findMany();

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        schoolId: school.id,
        identityType: "PROPRIETOR",
        tokenVersion: { increment: 1 },
      },
    });

    if (permissions.length > 0) {
      await this.prisma.userPermission.createMany({
        data: permissions.map((p) => ({ userId, permissionId: p.id, scope: {} })),
        skipDuplicates: true,
      });
    }

    const token = await this.jwt.signAsync({
      sub: userId,
      phone: updatedUser.phone,
      schoolId: school.id,
      identityType: "PROPRIETOR",
      tokenVersion: updatedUser.tokenVersion,
    });

    return { school, token };
  }

  async getMySchool(schoolId: string | null) {
    if (!schoolId) throw new NotFoundException("No school associated with this account.");
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new NotFoundException("School not found.");
    return school;
  }
}
