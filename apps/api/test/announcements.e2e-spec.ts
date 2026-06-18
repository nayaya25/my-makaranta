/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../src/core/prisma/prisma.module";
import { PrismaService } from "../src/core/prisma/prisma.service";
import { TenantContext } from "../src/core/tenant/tenant.context";
import { AuthModule } from "../src/core/auth/auth.module";
import { EmailModule } from "../src/core/email/email.module";
import { AnnouncementsModule } from "../src/modules/announcements/announcements.module";
import { AnnouncementsService } from "../src/modules/announcements/announcements.service";
import { getJwtSecret } from "../src/core/config/secrets";

describe("Announcements (e2e)", () => {
  let prisma: PrismaService;
  let svc: AnnouncementsService;
  const suffix = Date.now();
  let schoolId: string;
  let schoolBId: string;
  const userId = "author-user";
  const author = () => ({ id: userId, phone: "+2348000000000", schoolId, identityType: "STAFF" as const, identityId: "staff-1" });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ global: true, secret: getJwtSecret(), signOptions: { expiresIn: "30d" } }),
        PassportModule,
        PrismaModule,
        AuthModule,
        EmailModule,
        AnnouncementsModule,
      ],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
    svc = moduleRef.get(AnnouncementsService);
    const a = await prisma.school.create({ data: { name: `Ann A ${suffix}`, slug: `ann-a-${suffix}` } });
    schoolId = a.id;
    const b = await prisma.school.create({ data: { name: `Ann B ${suffix}`, slug: `ann-b-${suffix}` } });
    schoolBId = b.id;
  });
  afterAll(async () => { await prisma.onModuleDestroy(); });

  const asA = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId, userId }, fn);
  const asB = <T>(fn: () => Promise<T>) => TenantContext.run({ schoolId: schoolBId, userId }, fn);

  describe("broadcast", () => {
    let classId: string;
    let otherClassId: string;
    let parentTwoKidsId: string;
    let parentOtherId: string;
    let foreignClassId: string;

    beforeAll(async () => {
      const ay = await prisma.academicYear.create({ data: { schoolId, name: `AnnYr-${suffix}`, startDate: new Date("2025-09-01"), endDate: new Date("2026-07-31") } });
      const term = await prisma.term.create({ data: { schoolId, academicYearId: ay.id, number: 1, isCurrent: true, startDate: new Date("2025-09-01"), endDate: new Date("2025-12-20") } });
      const lvl = await prisma.classLevel.create({ data: { schoolId, name: `AnnL-${suffix}`, order: 1 } });
      const c1 = await prisma.class.create({ data: { schoolId, classLevelId: lvl.id, name: `AnnC1-${suffix}` } });
      const c2 = await prisma.class.create({ data: { schoolId, classLevelId: lvl.id, name: `AnnC2-${suffix}` } });
      classId = c1.id; otherClassId = c2.id;
      // parentTwoKids: TWO students in c1 → must dedup to ONE recipient.
      const pk = await prisma.parent.create({ data: { schoolId, phone: `+234810${String(suffix).slice(-7)}`, firstName: "Two", lastName: "Kids", email: `pk-${suffix}@e.test` } });
      parentTwoKidsId = pk.id;
      const po = await prisma.parent.create({ data: { schoolId, phone: `+234820${String(suffix).slice(-7)}`, firstName: "Other", lastName: "Class", email: `po-${suffix}@e.test` } });
      parentOtherId = po.id;
      const mkStudent = async (label: string, cls: string, parentId: string) => {
        const stu = await prisma.student.create({ data: { schoolId, admissionNo: `${label}-${suffix}`, firstName: label, lastName: "S", gender: "MALE", dateOfBirth: new Date("2012-01-01") } });
        await prisma.guardian.create({ data: { studentId: stu.id, parentId, relationship: "FATHER" } });
        await prisma.enrollment.create({ data: { studentId: stu.id, classId: cls, termId: term.id } });
        return stu.id;
      };
      await mkStudent("K1", classId, parentTwoKidsId);
      await mkStudent("K2", classId, parentTwoKidsId); // same parent, same class → dedup
      await mkStudent("O1", otherClassId, parentOtherId);
      const fc = await prisma.class.create({ data: { schoolId: schoolBId, classLevelId: (await prisma.classLevel.create({ data: { schoolId: schoolBId, name: `FL-${suffix}`, order: 1 } })).id, name: `FC-${suffix}` } });
      foreignClassId = fc.id;
      await prisma.staff.createMany({ data: [
        { schoolId, staffNo: `ST1-${suffix}`, firstName: "Staff", lastName: "One", email: `st1-${suffix}@e.test`, phone: `+234870${String(suffix).slice(-7)}` },
        { schoolId, staffNo: `ST2-${suffix}`, firstName: "Staff", lastName: "Two", email: `st2-${suffix}@e.test`, phone: `+234871${String(suffix).slice(-7)}` },
      ] });
    });

    it("creates an announcement to a CLASS, dedups recipients, sets channels + flags", async () => {
      const r = await asA(() => svc.create({ title: "Closure", body: "School closed Friday.", audienceType: "CLASS", audienceIds: [classId], channels: ["SMS", "EMAIL"], roles: ["PARENT"] }, author()));
      expect(r.recipientCount).toBe(1); // parentTwoKids deduped from 2 students
      const recips = await prisma.announcementRecipient.findMany({ where: { schoolId, announcementId: r.id } });
      expect(recips.length).toBe(1);
      expect(recips[0]!.recipientType).toBe("PARENT");
      expect(recips[0]!.recipientId).toBe(parentTwoKidsId);
      expect(recips[0]!.smsSent).toBe(true);     // mock SMS succeeds
      expect(recips[0]!.emailSent).toBe(true);   // parent has an email
      const ann = await prisma.announcement.findFirstOrThrow({ where: { schoolId, id: r.id } });
      expect(ann.channels).toEqual(["IN_APP", "SMS", "EMAIL"]);
      expect(ann.sentAt).toBeInstanceOf(Date);
    });

    it("rejects a foreign class id (tenant-IDOR)", async () => {
      await expect(asA(() => svc.create({ title: "x", body: "y", audienceType: "CLASS", audienceIds: [foreignClassId], channels: [], roles: ["PARENT"] }, author()))).rejects.toThrow(BadRequestException);
    });

    it("lists sent announcements with recipient + read counts", async () => {
      const list = await asA(() => svc.list());
      expect(list.length).toBeGreaterThanOrEqual(1);
      const closure = list.find((a) => a.title === "Closure")!;
      expect(closure.recipientCount).toBe(1);
      expect(closure.readCount).toBe(0);
    });

    it("parent inbox returns only the parent's own rows; mark-read sets readAt; bumps readCount", async () => {
      const parentUser = (pid: string) => ({ id: "pu", phone: "+2348094000001", schoolId, identityType: "PARENT" as const, identityId: pid });
      const inbox = await asA(() => svc.getInbox(parentUser(parentTwoKidsId)));
      expect(inbox.length).toBe(1);
      expect(inbox[0]!.readAt).toBeNull();
      const annId = inbox[0]!.announcementId;
      // a DIFFERENT parent (not a recipient) → mark-read 404
      await expect(asA(() => svc.markReadForUser(annId, parentUser(parentOtherId)))).rejects.toThrow(NotFoundException);
      // the real recipient → ok, readAt set
      await asA(() => svc.markReadForUser(annId, parentUser(parentTwoKidsId)));
      const after = await asA(() => svc.getInbox(parentUser(parentTwoKidsId)));
      expect(after[0]!.readAt).not.toBeNull();
      const list = await asA(() => svc.list());
      expect(list.find((a) => a.id === annId)!.readCount).toBe(1);
    });

    it("ALL audience resolves every parent in the school (deduped)", async () => {
      const r = await asA(() => svc.create({ title: "All", body: "Hello everyone.", audienceType: "ALL", audienceIds: [], channels: [], roles: ["PARENT"] }, author()));
      expect(r.recipientCount).toBe(2); // parentTwoKids + parentOther
    });

    it("targets PARENT + STAFF: class parents (deduped) + all staff, each delivered", async () => {
      const r = await asA(() => svc.create({ title: "Both", body: "All hands.", audienceType: "CLASS", audienceIds: [classId], channels: ["SMS", "EMAIL"], roles: ["PARENT", "STAFF"] }, author()));
      expect(r.recipientCount).toBe(3); // 1 deduped class parent + 2 staff
      const rows = await prisma.announcementRecipient.findMany({ where: { schoolId, announcementId: r.id } });
      expect(rows.filter((x) => x.recipientType === "PARENT").length).toBe(1);
      expect(rows.filter((x) => x.recipientType === "STAFF").length).toBe(2);
      expect(rows.every((x) => x.smsSent && x.emailSent)).toBe(true);
    });

    it("STAFF-only audience resolves all staff, no parents", async () => {
      const r = await asA(() => svc.create({ title: "Staff memo", body: "Meeting 4pm.", audienceType: "ALL", audienceIds: [], channels: ["SMS"], roles: ["STAFF"] }, author()));
      const rows = await prisma.announcementRecipient.findMany({ where: { schoolId, announcementId: r.id } });
      expect(rows.length).toBe(2);
      expect(rows.every((x) => x.recipientType === "STAFF")).toBe(true);
    });

    it("a STAFF recipient reads via getInbox; receipts readCount reflects it", async () => {
      const created = await asA(() => svc.create({ title: "StaffRead", body: "Read me.", audienceType: "ALL", audienceIds: [], channels: [], roles: ["STAFF"] }, author()));
      // find a staff recipient id
      const staffRow = await prisma.announcementRecipient.findFirstOrThrow({ where: { schoolId, announcementId: created.id, recipientType: "STAFF" } });
      const staffUser = { id: "su", phone: "+2340000000009", schoolId, identityType: "STAFF" as const, identityId: staffRow.recipientId };
      const inbox = await asA(() => svc.getInbox(staffUser));
      expect(inbox.some((x) => x.announcementId === created.id)).toBe(true);
      expect(inbox.find((x) => x.announcementId === created.id)!.readAt).toBeNull();
      await asA(() => svc.markReadForUser(created.id, staffUser));
      const rec = await asA(() => svc.getRecipients(created.id));
      expect(rec.aggregates.readCount).toBe(1);
      // a non-recipient staff id → mark-read 404
      await expect(asA(() => svc.markReadForUser(created.id, { ...staffUser, identityId: "no-such-staff" }))).rejects.toThrow(NotFoundException);
    });

    it("getRecipients returns the per-recipient breakdown + aggregates; foreign id 404", async () => {
      const created = await asA(() => svc.create({ title: "Receipts", body: "Check.", audienceType: "CLASS", audienceIds: [classId], channels: ["SMS", "EMAIL"], roles: ["PARENT", "STAFF"] }, author()));
      const rec = await asA(() => svc.getRecipients(created.id));
      expect(rec.aggregates.total).toBe(3);
      expect(rec.aggregates.readCount).toBe(0);
      expect(rec.aggregates.smsCount).toBe(3);
      expect(rec.aggregates.emailCount).toBe(3); // staff have email; the 2-kids parent has an email
      expect(rec.recipients.every((x) => x.name && x.name !== "Unknown")).toBe(true);
      await expect(asB(() => svc.getRecipients(created.id))).rejects.toThrow(NotFoundException);
      // a parent reads → readCount bumps, that row's readAt set; staff rows stay null
      const parentUser = { id: "pu", phone: "+2348094000001", schoolId, identityType: "PARENT" as const, identityId: parentTwoKidsId };
      await asA(() => svc.markReadForUser(created.id, parentUser));
      const rec2 = await asA(() => svc.getRecipients(created.id));
      expect(rec2.aggregates.readCount).toBe(1);
      expect(rec2.recipients.find((x) => x.recipientType === "STAFF")!.readAt).toBeNull();
    });

    it("isolates tenants — school B sees none of A's announcements", async () => {
      const list = await asB(() => svc.list());
      expect(list.every((a) => a.title !== "Closure")).toBe(true);
    });
  });
});
