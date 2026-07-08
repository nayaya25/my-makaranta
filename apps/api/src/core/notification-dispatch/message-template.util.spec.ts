/**
 * Engagement EN-3b Task 2 — renderTemplate / validateTemplate
 *
 * Run:
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/my_makaranta_test?schema=public' \
 *     pnpm exec jest message-template.util --runInBand
 */
import { BadRequestException } from "@nestjs/common";
import { renderTemplate, validateTemplate } from "./message-template.util";

describe("renderTemplate", () => {
  it("substitutes a repeated variable", () => {
    expect(renderTemplate("Hi {{studentName}}, {{studentName}}!", { studentName: "Ada" })).toBe("Hi Ada, Ada!");
  });

  it("renders a missing variable as an empty string", () => {
    expect(renderTemplate("Bal {{balance}}", {})).toBe("Bal ");
  });

  it("leaves text without placeholders unchanged", () => {
    expect(renderTemplate("No placeholders here.", { studentName: "Ada" })).toBe("No placeholders here.");
  });

  it("substitutes multiple distinct variables", () => {
    expect(renderTemplate("{{a}} and {{b}}", { a: "1", b: "2" })).toBe("1 and 2");
  });
});

describe("validateTemplate", () => {
  it("passes when the body only uses allowed variables", () => {
    expect(() =>
      validateTemplate("FEE_INSTALLMENT_REMINDER", "{{studentName}} {{amount}} {{dueDate}}"),
    ).not.toThrow();
  });

  it("rejects a body referencing a variable not in the key's allowed set", () => {
    expect(() => validateTemplate("RESULTS_READY", "{{studentName}} {{amount}}")).toThrow(BadRequestException);
  });

  it("rejects an unknown template key", () => {
    expect(() => validateTemplate("NOPE", "x")).toThrow(BadRequestException);
  });
});
