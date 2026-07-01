import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { PasswordService } from "../../core/auth/password.service";
import { validateSlug } from "../../core/tenant/slug";
import { SignupDto } from "./dto/signup.dto";
import { seedSkillDefaults } from "../../../prisma/seed-skill-defaults";
import { seedSubjectCategories } from "../../../prisma/seed-subject-categories";

@Injectable()
export class SignupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async checkSlug(slug: string): Promise<{ available: boolean; reason: string | null }> {
    const validationError = validateSlug(slug);
    if (validationError !== null) {
      return { available: false, reason: validationError };
    }

    const existing = await this.prisma.school.findUnique({ where: { slug } });
    if (existing) {
      return { available: false, reason: "taken" };
    }

    return { available: true, reason: null };
  }

  async signup(dto: SignupDto): Promise<{ slug: string; schoolId: string }> {
    // 1. Validate slug format
    const slugError = validateSlug(dto.slug);
    if (slugError !== null) {
      throw new BadRequestException(slugError);
    }

    // 2. Validate password policy
    const pwError = this.passwords.validatePolicy(dto.password);
    if (pwError !== null) {
      throw new BadRequestException(pwError);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 3. Slug not taken
      const existingSchool = await tx.school.findUnique({ where: { slug: dto.slug } });
      if (existingSchool) {
        throw new ConflictException("slug taken");
      }

      // 4. No existing Person with that email or phone
      if (dto.email) {
        const existingByEmail = await tx.person.findUnique({ where: { email: dto.email } });
        if (existingByEmail) {
          throw new ConflictException("email already registered");
        }
      }
      if (dto.phone) {
        const existingByPhone = await tx.person.findUnique({ where: { phone: dto.phone } });
        if (existingByPhone) {
          throw new ConflictException("phone already registered");
        }
      }

      // 5. Find proprietor role
      let proprietor;
      try {
        proprietor = await tx.role.findFirstOrThrow({
          where: { schoolId: null, key: "proprietor" },
        });
      } catch {
        throw new InternalServerErrorException("System roles not seeded. Contact support.");
      }

      // 6. Create School (website not in schema — omitted)
      const school = await tx.school.create({
        data: {
          name: dto.schoolName,
          slug: dto.slug,
          country: dto.country as any,
          ...(dto.type ? { type: dto.type } : {}),
        },
      });

      // 7. Create Person
      const passwordHash = await this.passwords.hash(dto.password);
      const person = await tx.person.create({
        data: {
          email: dto.email,
          phone: dto.phone,
          firstName: dto.firstName,
          lastName: dto.lastName,
          gender: dto.gender,
          passwordHash,
        },
      });

      // 8. Create Membership
      const membership = await tx.membership.create({
        data: {
          personId: person.id,
          schoolId: school.id,
          status: "active",
        },
      });

      // 9. Create RoleAssignment
      await tx.roleAssignment.create({
        data: {
          membershipId: membership.id,
          roleId: proprietor.id,
        },
      });

      // 10. Return
      return { slug: school.slug, schoolId: school.id };
    });

    await seedSkillDefaults(this.prisma, result.schoolId);
    await seedSubjectCategories(this.prisma, result.schoolId);
    return result;
  }
}
