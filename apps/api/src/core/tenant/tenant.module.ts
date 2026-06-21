import { Module } from "@nestjs/common";
import { TenantMiddleware } from "./tenant.middleware";
import { TenantGuard } from "./tenant.guard";

@Module({
  providers: [TenantMiddleware, TenantGuard],
  exports: [TenantMiddleware, TenantGuard],
})
export class TenantModule {}
