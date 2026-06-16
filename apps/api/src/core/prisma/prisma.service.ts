import { Injectable, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { TenantContext } from "../tenant/tenant.context";

/** Models that carry a `schoolId` column and are auto-scoped to the current tenant. */
const TENANT_MODELS = new Set([
  "AcademicYear",
  "Term",
  "ClassLevel",
  "Class",
  "Subject",
  "Staff",
  "Student",
  "Parent",
  "AttendanceRecord",
  "AssessmentType",
  "GradeBoundary",
  "SubjectAssignment",
  "Score",
  "Release",
  "ResultSheet",
  "ResultSheetEntry",
  "Correction",
  "FeeItem",
  "Invoice",
  "InvoiceLine",
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();

    this.$use(async (params, next) => {
      const schoolId = TenantContext.current()?.schoolId;
      if (!schoolId || !params.model || !TENANT_MODELS.has(params.model)) return next(params);

      switch (params.action) {
        // findUnique can't accept a non-unique filter; convert to findFirst to add the tenant scope.
        case "findUnique":
          params.action = "findFirst";
          params.args.where = { ...params.args.where, schoolId };
          break;
        case "findUniqueOrThrow":
          params.action = "findFirstOrThrow";
          params.args.where = { ...params.args.where, schoolId };
          break;
        case "findFirst":
        case "findFirstOrThrow":
        case "findMany":
        case "count":
        case "aggregate":
        case "groupBy":
        case "updateMany":
        case "deleteMany":
          params.args = params.args ?? {};
          params.args.where = { ...(params.args.where ?? {}), schoolId };
          break;
        case "create":
          params.args.data = { ...params.args.data, schoolId };
          break;
        // Single-record update/delete target a unique id; tenant safety for those is enforced by
        // service-layer scoping + PostgreSQL RLS (defense-in-depth).
        default:
          break;
      }
      return next(params);
    });

    // Audit every mutation on tenant models (who/when/what). Logs the resulting row;
    // a failed audit write must never break the mutation it describes.
    this.$use(async (params, next) => {
      const result = await next(params);
      const MUTATIONS = new Set(["create", "update", "delete"]);
      if (params.model && TENANT_MODELS.has(params.model) && MUTATIONS.has(params.action)) {
        const ctx = TenantContext.current();
        const row = result as { id?: string } | null;
        try {
          await this.auditLog.create({
            data: {
              schoolId: ctx?.schoolId ?? null,
              actorId: ctx?.userId ?? null,
              action: `${params.model}.${params.action}`,
              resourceType: params.model,
              resourceId: row?.id ?? "(unknown)",
              after: result ? JSON.parse(JSON.stringify(result)) : undefined,
            },
          });
        } catch {
          // swallow — auditing is best-effort and must not fail the operation
        }
      }
      return result;
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
