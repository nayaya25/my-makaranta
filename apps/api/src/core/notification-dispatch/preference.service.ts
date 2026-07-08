import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS } from "./notification-category";
import type { SetPreferenceDto } from "./dto/preference.dto";

export interface PreferenceState {
  mutedChannels: string[];
  mutedCategories: string[];
}

const DEFAULT_PREFERENCE: PreferenceState = { mutedChannels: [], mutedCategories: [] };

@Injectable()
export class PreferenceService {
  constructor(private prisma: PrismaService) {}

  /** Batch-loads preferences for a set of parents, keyed by parentId. Parents with no row are absent from the map. */
  async loadPreferences(schoolId: string, parentIds: string[]): Promise<Map<string, PreferenceState>> {
    const map = new Map<string, PreferenceState>();
    if (parentIds.length === 0) return map;

    const rows = await this.prisma.notificationPreference.findMany({
      where: { schoolId, parentId: { in: parentIds } },
    });
    for (const row of rows) {
      map.set(row.parentId, { mutedChannels: row.mutedChannels, mutedCategories: row.mutedCategories });
    }
    return map;
  }

  /** Filters `requested` channels down to the ones the parent hasn't muted. A muted category
   *  suppresses every channel outright. No preference row (or `undefined`) means "receive everything". */
  effectiveChannels(pref: PreferenceState | undefined, category: string, requested: string[]): string[] {
    if (pref?.mutedCategories.includes(category)) return [];
    const mutedChannels = pref?.mutedChannels ?? [];
    return requested.filter((c) => !mutedChannels.includes(c));
  }

  /** Returns a parent's preferences, defaulting to "receive everything" if no row exists. */
  async getForParent(schoolId: string, parentId: string): Promise<PreferenceState> {
    const row = await this.prisma.notificationPreference.findFirst({ where: { schoolId, parentId } });
    if (!row) return { ...DEFAULT_PREFERENCE };
    return { mutedChannels: row.mutedChannels, mutedCategories: row.mutedCategories };
  }

  /** Validates + upserts a parent's preferences. Rejects unknown channels/categories and parents
   *  outside the caller's school. */
  async setForParent(schoolId: string, parentId: string, dto: SetPreferenceDto): Promise<PreferenceState> {
    const mutedChannels = dto.mutedChannels ?? [];
    const mutedCategories = dto.mutedCategories ?? [];

    for (const channel of mutedChannels) {
      if (!(NOTIFICATION_CHANNELS as readonly string[]).includes(channel)) {
        throw new BadRequestException(`mutedChannels must be one of ${NOTIFICATION_CHANNELS.join(", ")}.`);
      }
    }
    for (const category of mutedCategories) {
      if (!(NOTIFICATION_CATEGORIES as readonly string[]).includes(category)) {
        throw new BadRequestException(`mutedCategories must be one of ${NOTIFICATION_CATEGORIES.join(", ")}.`);
      }
    }

    const parent = await this.prisma.parent.findFirst({ where: { id: parentId, schoolId } });
    if (!parent) throw new NotFoundException("Parent not found.");

    const row = await this.prisma.notificationPreference.upsert({
      where: { parentId },
      create: { schoolId, parentId, mutedChannels, mutedCategories },
      update: { mutedChannels, mutedCategories },
    });
    return { mutedChannels: row.mutedChannels, mutedCategories: row.mutedCategories };
  }
}
