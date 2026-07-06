/**
 * Controller delegation unit tests for InstallmentScheduleController.
 *
 * Strategy: mock InstallmentScheduleService, call controller methods directly, assert
 * the right service method is invoked with the right args and the return
 * value is forwarded. No HTTP / NestJS bootstrap needed — fast and focused.
 */

import { InstallmentScheduleController } from "./installment-schedule.controller";
import { InstallmentScheduleService } from "./installment-schedule.service";
import { SetScheduleDto } from "./dto/installments.dto";

function mockInstallmentScheduleService(): jest.Mocked<InstallmentScheduleService> {
  return {
    getSchedule: jest.fn(),
    setSchedule: jest.fn(),
  } as unknown as jest.Mocked<InstallmentScheduleService>;
}

describe("InstallmentScheduleController", () => {
  let controller: InstallmentScheduleController;
  let svc: jest.Mocked<InstallmentScheduleService>;

  beforeEach(() => {
    svc = mockInstallmentScheduleService();
    controller = new InstallmentScheduleController(svc);
  });

  it("getSchedule() delegates to service.getSchedule() with classLevelId + termId", async () => {
    const expected = [{ order: 1, label: "First", percentBps: 5000, dueDate: new Date("2026-09-01") }];
    svc.getSchedule.mockResolvedValue(expected as never);
    const result = await controller.getSchedule("cl1", "t1");
    expect(svc.getSchedule).toHaveBeenCalledWith("cl1", "t1");
    expect(result).toBe(expected);
  });

  it("setSchedule() delegates to service.setSchedule() with classLevelId, termId, installments from dto", async () => {
    const dto: SetScheduleDto = {
      classLevelId: "cl1",
      termId: "t1",
      installments: [{ order: 1, percentBps: 10000, dueDate: "2026-09-01" }],
    };
    const saved = [{ order: 1, label: null, percentBps: 10000, dueDate: new Date("2026-09-01") }];
    svc.setSchedule.mockResolvedValue(saved as never);
    const result = await controller.setSchedule(dto);
    expect(svc.setSchedule).toHaveBeenCalledWith("cl1", "t1", dto.installments);
    expect(result).toBe(saved);
  });
});
