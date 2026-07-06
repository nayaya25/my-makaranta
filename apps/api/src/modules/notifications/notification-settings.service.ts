import { BadRequestException, Injectable } from "@nestjs/common";
import type { NotificationSettings } from "@prisma/client";
import { PrismaService } from "../../core/prisma/prisma.service";
import type { UpdateNotificationSettingsDto } from "./dto/notifications.dto";

const ALLOWED_CHANNELS = new Set(["SMS", "EMAIL"]);
const MIN_OFFSET = -30;
const MAX_OFFSET = 30;

@Injectable()
export class NotificationSettingsService {
  constructor(private prisma: PrismaService) {}

  /** Ensures a settings row exists for the school (creating defaults if needed) and returns it. */
  get(schoolId: string): Promise<NotificationSettings> {
    return this.prisma.notificationSettings.upsert({
      where: { schoolId },
      create: { schoolId },
      update: {},
    });
  }

  private validate(dto: UpdateNotificationSettingsDto): void {
    if (dto.reminderOffsetDays) {
      for (const offset of dto.reminderOffsetDays) {
        if (!Number.isInteger(offset) || offset < MIN_OFFSET || offset > MAX_OFFSET) {
          throw new BadRequestException(
            `reminderOffsetDays must be integers between ${MIN_OFFSET} and ${MAX_OFFSET}.`,
          );
        }
      }
    }
    if (dto.channels) {
      for (const channel of dto.channels) {
        if (!ALLOWED_CHANNELS.has(channel)) {
          throw new BadRequestException(`channels must be one of ${[...ALLOWED_CHANNELS].join(", ")}.`);
        }
      }
    }
  }

  async update(schoolId: string, dto: UpdateNotificationSettingsDto): Promise<NotificationSettings> {
    this.validate(dto);
    await this.get(schoolId); // ensure the row exists before updating
    return this.prisma.notificationSettings.update({
      where: { schoolId },
      data: {
        ...(dto.feeRemindersEnabled !== undefined && { feeRemindersEnabled: dto.feeRemindersEnabled }),
        ...(dto.reminderOffsetDays !== undefined && { reminderOffsetDays: dto.reminderOffsetDays }),
        ...(dto.resultsReadyEnabled !== undefined && { resultsReadyEnabled: dto.resultsReadyEnabled }),
        ...(dto.channels !== undefined && { channels: dto.channels }),
      },
    });
  }
}
