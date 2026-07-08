import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PreferenceService } from "./preference.service";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { MessageTemplateService } from "./message-template.service";

/** Standalone dispatch core: preference-aware channel resolution + unified per-recipient send.
 *  Deliberately imports neither `announcements` nor `notifications` — they import this module,
 *  and importing either back would create a DI cycle. */
@Global()
@Module({
  imports: [AuthModule], // exports SmsService
  providers: [PreferenceService, NotificationDispatchService, MessageTemplateService],
  exports: [PreferenceService, NotificationDispatchService, MessageTemplateService],
})
export class NotificationDispatchModule {}
