import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { AnnouncementsModule } from "../announcements/announcements.module";
import { NotificationsService } from "./notifications.service";
import { NotificationSettingsService } from "./notification-settings.service";
import { NotificationsCron } from "./notifications.cron";
import { NotificationsController } from "./notifications.controller";
import { MessageTemplatesController } from "./message-templates.controller";

@Module({
  imports: [AuthModule, AnnouncementsModule],
  controllers: [NotificationsController, MessageTemplatesController],
  providers: [NotificationsService, NotificationSettingsService, NotificationsCron],
  exports: [NotificationsService, NotificationSettingsService],
})
export class NotificationsModule {}
