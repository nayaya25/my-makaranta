import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { NotificationsService } from "./notifications.service";
import { AnnouncementsService } from "../announcements/announcements.service";

// @nestjs/schedule@6's CronExpression enum has no EVERY_15_MINUTES member
// (only 5/10/30-minute steps); use the equivalent literal cron expression.
const EVERY_15_MINUTES = "0 */15 * * * *";

@Injectable()
export class NotificationsCron {
  constructor(
    private notifications: NotificationsService,
    private announcements: AnnouncementsService,
  ) {}

  @Cron("0 7 * * *")
  nightlyFeeReminders() {
    return this.notifications.runFeeReminders(new Date());
  }

  @Cron(EVERY_15_MINUTES)
  dispatchScheduled() {
    return this.announcements.dispatchScheduledAnnouncements(new Date());
  }
}
