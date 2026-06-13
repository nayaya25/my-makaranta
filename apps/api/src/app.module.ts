import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AppController } from "./app.controller";
import { PrismaModule } from "./core/prisma/prisma.module";
import { TenantModule } from "./core/tenant/tenant.module";
import { TenantMiddleware } from "./core/tenant/tenant.middleware";
import { AuthModule } from "./core/auth/auth.module";
import { StorageModule } from "./core/storage/storage.module";
import { EmailModule } from "./core/email/email.module";
import { getJwtSecret } from "./core/config/secrets";

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
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes("*");
  }
}
