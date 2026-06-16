import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { FeesController } from "./fees.controller";
import { FeesService } from "./fees.service";

@Module({ imports: [AuthModule], controllers: [FeesController], providers: [FeesService] })
export class FeesModule {}
