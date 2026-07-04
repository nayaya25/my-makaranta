import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { ALLOWED_TRANSITIONS } from "./transitions";
import { PutLessonPlanDto, ReviewLessonPlanDto } from "./dto/lesson-plans.dto";
import { weeksInTerm } from "./weeks.util";

@Injectable()
export class LessonPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async putDraft(dto: PutLessonPlanDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const assignment = await this.prisma.subjectAssignment.findFirst({ where: { id: dto.subjectAssignmentId, schoolId } });
    if (!assignment) throw new NotFoundException("Subject assignment not found in this school.");
    const staffId = await this.resolveCallerStaffId();
    if (!staffId || staffId !== assignment.staffId) throw new ForbiddenException("You can only edit lesson plans for your own classes.");
    const term = await this.prisma.term.findFirst({ where: { id: dto.termId, schoolId } });
    if (!term) throw new NotFoundException("Term not found in this school.");
    if (term.academicYearId !== assignment.academicYearId) throw new BadRequestException("Term and assignment are in different academic years.");
    const maxWeek = weeksInTerm(term.startDate, term.endDate);
    if (dto.weekNumber < 1 || dto.weekNumber > maxWeek) throw new BadRequestException(`weekNumber must be 1–${maxWeek}.`);

    const existing = await this.prisma.lessonPlan.findFirst({
      where: { subjectAssignmentId: dto.subjectAssignmentId, termId: dto.termId, weekNumber: dto.weekNumber, schoolId },
    });
    if (existing && (existing.status === "SUBMITTED" || existing.status === "APPROVED")) {
      throw new BadRequestException("This plan is locked (submitted or approved) and cannot be edited.");
    }
    const fields = {
      topic: dto.topic, objectives: dto.objectives, activities: dto.activities,
      resources: dto.resources, assessment: dto.assessment, notes: dto.notes,
    };
    return this.prisma.lessonPlan.upsert({
      where: { subjectAssignmentId_termId_weekNumber: {
        subjectAssignmentId: dto.subjectAssignmentId, termId: dto.termId, weekNumber: dto.weekNumber } },
      create: { schoolId, subjectAssignmentId: dto.subjectAssignmentId, termId: dto.termId, weekNumber: dto.weekNumber, ...fields },
      update: { ...fields, status: existing?.status === "RETURNED" ? "DRAFT" : undefined },
    });
  }

  async getForAssignment(assignmentId: string, termId: string, canReviewAll = false) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const assignment = await this.prisma.subjectAssignment.findFirst({ where: { id: assignmentId, schoolId } });
    if (!assignment) throw new NotFoundException("Subject assignment not found in this school.");
    // A reviewer may read any assignment's plans; otherwise the caller must own the assignment.
    if (!canReviewAll) {
      const staffId = await this.resolveCallerStaffId();
      if (!staffId || staffId !== assignment.staffId) {
        throw new ForbiddenException("You can only view lesson plans for your own classes.");
      }
    }
    return this.prisma.lessonPlan.findMany({
      where: { subjectAssignmentId: assignmentId, termId, schoolId },
      orderBy: { weekNumber: "asc" },
    });
  }

  async getOne(id: string, canReviewAll = false) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const plan = await this.prisma.lessonPlan.findFirst({
      where: { id, schoolId },
      include: { subjectAssignment: { select: { staffId: true } } },
    });
    if (!plan) throw new NotFoundException("Lesson plan not found.");
    if (!canReviewAll) {
      const staffId = await this.resolveCallerStaffId();
      if (!staffId || staffId !== plan.subjectAssignment.staffId) {
        throw new ForbiddenException("You can only view your own lesson plans.");
      }
    }
    return plan;
  }

  async submit(id: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const plan = await this.prisma.lessonPlan.findFirst({ where: { id, schoolId }, include: { subjectAssignment: true } });
    if (!plan) throw new NotFoundException("Lesson plan not found.");
    const staffId = await this.resolveCallerStaffId();
    if (!staffId || staffId !== plan.subjectAssignment.staffId) throw new ForbiddenException("You can only submit your own lesson plans.");
    if (!(ALLOWED_TRANSITIONS[plan.status] ?? []).includes("SUBMITTED")) {
      throw new BadRequestException(`Cannot submit a ${plan.status} plan.`);
    }
    return this.prisma.lessonPlan.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  }

  async review(id: string, dto: ReviewLessonPlanDto) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const plan = await this.prisma.lessonPlan.findFirst({ where: { id, schoolId } });
    if (!plan) throw new NotFoundException("Lesson plan not found.");
    if (!(ALLOWED_TRANSITIONS[plan.status] ?? []).includes(dto.decision)) {
      throw new BadRequestException(`Cannot ${dto.decision.toLowerCase()} a ${plan.status} plan.`);
    }
    if (dto.decision === "RETURNED" && !dto.note?.trim()) throw new BadRequestException("A note is required when returning a plan.");
    const reviewerStaffId = await this.resolveCallerStaffId();
    return this.prisma.lessonPlan.update({
      where: { id },
      data: { status: dto.decision, reviewNote: dto.note ?? null, reviewedByStaffId: reviewerStaffId, reviewedAt: new Date() },
    });
  }

  async reviewQueue(termId?: string) {
    const schoolId = TenantContext.schoolIdOrThrow();
    const rows = await this.prisma.lessonPlan.findMany({
      where: { schoolId, status: "SUBMITTED", ...(termId ? { termId } : {}) },
      include: { subjectAssignment: { include: {
        subject: { select: { name: true } }, class: { select: { name: true } },
        staff: { select: { firstName: true, lastName: true } } } } },
      orderBy: { submittedAt: "asc" },
    });
    // Flatten to the queue-item contract the web consumes.
    return rows.map((p) => ({
      id: p.id,
      weekNumber: p.weekNumber,
      submittedAt: p.submittedAt,
      termId: p.termId,
      subjectName: p.subjectAssignment.subject.name,
      className: p.subjectAssignment.class.name,
      teacherName: `${p.subjectAssignment.staff.firstName} ${p.subjectAssignment.staff.lastName}`,
    }));
  }

  private async resolveCallerStaffId(): Promise<string | null> {
    const userId = TenantContext.current()?.userId;
    if (!userId) return null;
    const user = await this.prisma.user.findFirst({ where: { id: userId }, select: { identityType: true, identityId: true } });
    return user?.identityType === "STAFF" ? user.identityId : null;
  }
}
