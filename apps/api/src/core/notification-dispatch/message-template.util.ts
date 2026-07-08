import { BadRequestException } from "@nestjs/common";
import { MESSAGE_TEMPLATES } from "./message-template.registry";

const VAR_RE = /\{\{\s*(\w+)\s*\}\}/g;

/** Pure substitution: every `{{name}}` is replaced with `vars[name]`, or "" if absent. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(VAR_RE, (_m, name: string) => vars[name] ?? "");
}

/** Throws `BadRequestException` for an unknown template key or a body referencing a
 *  variable outside that key's allowed set. */
export function validateTemplate(key: string, body: string): void {
  const spec = (MESSAGE_TEMPLATES as Record<string, { variables: readonly string[] }>)[key];
  if (!spec) throw new BadRequestException(`Unknown template key: ${key}`);
  const used = [...body.matchAll(VAR_RE)].map((m) => m[1]!);
  const bad = [...new Set(used.filter((v) => !spec.variables.includes(v)))];
  if (bad.length) throw new BadRequestException(`Unknown template variable(s): ${bad.join(", ")}`);
}
