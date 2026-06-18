import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { JwtModule } from "@nestjs/jwt";
import { AppController } from "./app.controller";
import { PrismaModule } from "./core/prisma/prisma.module";
import { TenantModule } from "./core/tenant/tenant.module";
import { TenantMiddleware } from "./core/tenant/tenant.middleware";
import { AuthModule } from "./core/auth/auth.module";
import { StorageModule } from "./core/storage/storage.module";
import { EmailModule } from "./core/email/email.module";
import { PaymentsProviderModule } from "./core/payments/payments.module";
import { getJwtSecret } from "./core/config/secrets";
import { StructureModule } from "./modules/structure/structure.module";
import { SisModule } from "./modules/sis/sis.module";
import { ImportsModule } from "./modules/imports/imports.module";
import { AttendanceModule } from "./modules/attendance/attendance.module";
import { AssessmentModule } from "./modules/assessment/assessment.module";
import { FeesModule } from "./modules/fees/fees.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { PublicModule } from "./modules/public/public.module";
import { ParentModule } from "./modules/parent/parent.module";
import { AnnouncementsModule } from "./modules/announcements/announcements.module";
import { MessagingModule } from "./modules/messaging/messaging.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { StaffAccessModule } from "./modules/staff-access/staff-access.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: process.env.NODE_ENV === "test" ? 100_000 : 120 }]),
    JwtModule.register({
      global: true,
      secret: getJwtSecret(),
      signOptions: { expiresIn: "30d" },
    }),
    PrismaModule,
    TenantModule,
    AuthModule,
    StorageModule,
    EmailModule,
    PaymentsProviderModule,
    StructureModule,
    SisModule,
    ImportsModule,
    AttendanceModule,
    AssessmentModule,
    FeesModule,
    PaymentsModule,
    PublicModule,
    ParentModule,
    AnnouncementsModule,
    MessagingModule,
    DashboardModule,
    StaffAccessModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
