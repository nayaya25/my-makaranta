// apps/api/src/core/identity/identity.module.ts
import { Module } from "@nestjs/common";
import { IdentityService } from "./identity.service";

@Module({ providers: [IdentityService], exports: [IdentityService] })
export class IdentityModule {}
