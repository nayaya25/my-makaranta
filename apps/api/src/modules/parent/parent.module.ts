import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { ParentController } from "./parent.controller";
import { ParentService } from "./parent.service";

@Module({ imports: [AuthModule], controllers: [ParentController], providers: [ParentService] })
export class ParentModule {}
