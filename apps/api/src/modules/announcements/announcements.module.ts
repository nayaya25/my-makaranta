import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { EmailModule } from "../../core/email/email.module";
import { AnnouncementsController } from "./announcements.controller";
import { AnnouncementsService } from "./announcements.service";

@Module({ imports: [AuthModule, EmailModule], controllers: [AnnouncementsController], providers: [AnnouncementsService] })
export class AnnouncementsModule {}
