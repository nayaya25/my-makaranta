/**
 * Controller delegation unit tests for NotificationsController.
 *
 * Strategy: mock NotificationSettingsService, stub TenantContext.schoolIdOrThrow,
 * call controller methods directly, assert the right service method is invoked
 * with the right args and the return value is forwarded. No HTTP / NestJS
 * bootstrap needed — fast and focused.
 */

import { NotificationsController } from "./notifications.controller";
import { NotificationSettingsService } from "./notification-settings.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import type { UpdateNotificationSettingsDto } from "./dto/notifications.dto";

function mockSettingsService(): jest.Mocked<NotificationSettingsService> {
  return {
    get: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<NotificationSettingsService>;
}

describe("NotificationsController", () => {
  let controller: NotificationsController;
  let svc: jest.Mocked<NotificationSettingsService>;

  beforeEach(() => {
    svc = mockSettingsService();
    controller = new NotificationsController(svc);
    jest.spyOn(TenantContext, "schoolIdOrThrow").mockReturnValue("school-1");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("getSettings() delegates to service.get() with the tenant schoolId", async () => {
    const expected = {
      id: "ns1",
      schoolId: "school-1",
      feeRemindersEnabled: true,
      reminderOffsetDays: [-3, 0, 3],
      resultsReadyEnabled: true,
      channels: ["SMS", "EMAIL"],
      updatedAt: new Date(),
    };
    svc.get.mockResolvedValue(expected as never);

    const result = await controller.getSettings();

    expect(svc.get).toHaveBeenCalledWith("school-1");
    expect(result).toBe(expected);
  });

  it("updateSettings() delegates to service.update() with the tenant schoolId + dto", async () => {
    const dto: UpdateNotificationSettingsDto = { feeRemindersEnabled: false, channels: ["SMS"] };
    const updated = {
      id: "ns1",
      schoolId: "school-1",
      feeRemindersEnabled: false,
      reminderOffsetDays: [-3, 0, 3],
      resultsReadyEnabled: true,
      channels: ["SMS"],
      updatedAt: new Date(),
    };
    svc.update.mockResolvedValue(updated as never);

    const result = await controller.updateSettings(dto);

    expect(svc.update).toHaveBeenCalledWith("school-1", dto);
    expect(result).toBe(updated);
  });
});
