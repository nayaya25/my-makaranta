/**
 * Controller delegation unit tests for MessageTemplatesController.
 *
 * Strategy: mock MessageTemplateService, stub TenantContext.schoolIdOrThrow,
 * call controller methods directly, assert the right service method is
 * invoked with the right args and the return value is forwarded. No HTTP /
 * NestJS bootstrap needed — fast and focused.
 */

import { BadRequestException } from "@nestjs/common";
import { MessageTemplatesController } from "./message-templates.controller";
import { MessageTemplateService } from "../../core/notification-dispatch/message-template.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import type { SetMessageTemplateDto } from "../../core/notification-dispatch/dto/message-template.dto";

function mockTemplateService(): jest.Mocked<MessageTemplateService> {
  return {
    render: jest.fn(),
    list: jest.fn(),
    set: jest.fn(),
    reset: jest.fn(),
  } as unknown as jest.Mocked<MessageTemplateService>;
}

describe("MessageTemplatesController", () => {
  let controller: MessageTemplatesController;
  let svc: jest.Mocked<MessageTemplateService>;

  beforeEach(() => {
    svc = mockTemplateService();
    controller = new MessageTemplatesController(svc);
    jest.spyOn(TenantContext, "schoolIdOrThrow").mockReturnValue("school-1");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("list() delegates to service.list() with the tenant schoolId, returning 3 keys with defaults + allowedVariables", async () => {
    const expected = [
      {
        key: "FEE_INSTALLMENT_REMINDER",
        body: "Dear Parent, {{studentName}}'s fees installment of {{amount}} is due {{dueDate}}. Kindly settle it. Thank you.",
        isCustomized: false,
        allowedVariables: ["studentName", "amount", "dueDate"],
        defaultBody:
          "Dear Parent, {{studentName}}'s fees installment of {{amount}} is due {{dueDate}}. Kindly settle it. Thank you.",
      },
      {
        key: "FEE_BALANCE_REMINDER",
        body: "Dear Parent, {{studentName}}'s {{termLabel}} fees balance is {{balance}}. Kindly settle it. Thank you.",
        isCustomized: false,
        allowedVariables: ["studentName", "termLabel", "balance"],
        defaultBody:
          "Dear Parent, {{studentName}}'s {{termLabel}} fees balance is {{balance}}. Kindly settle it. Thank you.",
      },
      {
        key: "RESULTS_READY",
        body: "Dear Parent, {{studentName}}'s results are now ready. Please log in to view the report card.",
        isCustomized: false,
        allowedVariables: ["studentName"],
        defaultBody: "Dear Parent, {{studentName}}'s results are now ready. Please log in to view the report card.",
      },
    ];
    svc.list.mockResolvedValue(expected as never);

    const result = await controller.list();

    expect(svc.list).toHaveBeenCalledWith("school-1");
    expect(result).toBe(expected);
    expect(result).toHaveLength(3);
  });

  it("set() delegates to service.set() with schoolId + key + dto.body", async () => {
    const dto: SetMessageTemplateDto = { body: "Hello {{studentName}}" };
    svc.set.mockResolvedValue(undefined);

    const result = await controller.set("RESULTS_READY", dto);

    expect(svc.set).toHaveBeenCalledWith("school-1", "RESULTS_READY", "Hello {{studentName}}");
    expect(result).toBeUndefined();
  });

  it("set() propagates BadRequestException from service.set() for an unknown variable", async () => {
    const dto: SetMessageTemplateDto = { body: "{{studentName}} {{amount}}" };
    svc.set.mockRejectedValue(new BadRequestException("Unknown template variable(s): amount"));

    await expect(controller.set("RESULTS_READY", dto)).rejects.toThrow(BadRequestException);
    expect(svc.set).toHaveBeenCalledWith("school-1", "RESULTS_READY", "{{studentName}} {{amount}}");
  });

  it("reset() delegates to service.reset() with schoolId + key", async () => {
    svc.reset.mockResolvedValue(undefined);

    const result = await controller.reset("RESULTS_READY");

    expect(svc.reset).toHaveBeenCalledWith("school-1", "RESULTS_READY");
    expect(result).toBeUndefined();
  });
});
