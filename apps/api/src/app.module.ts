import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
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
import { DashboardModule } from "./modules/dashboard/dashboard.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    DashboardModule,
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
