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
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
