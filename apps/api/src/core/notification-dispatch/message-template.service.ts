import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MESSAGE_TEMPLATES, type MessageTemplateKey } from "./message-template.registry";
import { renderTemplate, validateTemplate } from "./message-template.util";

export interface MessageTemplateListItem {
  key: MessageTemplateKey;
  body: string;
  isCustomized: boolean;
  allowedVariables: string[];
  defaultBody: string;
}

@Injectable()
export class MessageTemplateService {
  constructor(private prisma: PrismaService) {}

  /** Renders a school's override (if any) or the code default for `key`, substituting `vars`. */
  async render(schoolId: string, key: MessageTemplateKey, vars: Record<string, string>): Promise<string> {
    const row = await this.prisma.messageTemplate.findFirst({ where: { schoolId, key } });
    const body = row?.body ?? MESSAGE_TEMPLATES[key].default;
    return renderTemplate(body, vars);
  }

  /** All registry keys with the school's override-or-default body + customization state. */
  async list(schoolId: string): Promise<MessageTemplateListItem[]> {
    const rows = await this.prisma.messageTemplate.findMany({ where: { schoolId } });
    const rowByKey = new Map(rows.map((r) => [r.key, r]));

    return (Object.keys(MESSAGE_TEMPLATES) as MessageTemplateKey[]).map((key) => {
      const spec = MESSAGE_TEMPLATES[key];
      const row = rowByKey.get(key);
      return {
        key,
        body: row?.body ?? spec.default,
        isCustomized: !!row,
        allowedVariables: [...spec.variables],
        defaultBody: spec.default,
      };
    });
  }

  /** Validates `body` against `key`'s allowed variables, then upserts the school's override row. */
  async set(schoolId: string, key: string, body: string): Promise<void> {
    validateTemplate(key, body);
    await this.prisma.messageTemplate.upsert({
      where: { schoolId_key: { schoolId, key } },
      create: { schoolId, key, body },
      update: { body },
    });
  }

  /** Deletes the school's override row for `key`, reverting `render`/`list` to the code default. */
  async reset(schoolId: string, key: string): Promise<void> {
    await this.prisma.messageTemplate.deleteMany({ where: { schoolId, key } });
  }
}
