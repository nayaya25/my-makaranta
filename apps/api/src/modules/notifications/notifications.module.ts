import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { NotificationsService } from "./notifications.service";
import { NotificationSettingsService } from "./notification-settings.service";

@Module({
  imports: [AuthModule],
  providers: [NotificationsService, NotificationSettingsService],
  exports: [NotificationsService, NotificationSettingsService],
})
export class NotificationsModule {}
