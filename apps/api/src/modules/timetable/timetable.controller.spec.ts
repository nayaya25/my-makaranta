/**
 * Controller delegation unit tests for PeriodsController + TimetableController.
 *
 * Strategy: mock both services, call controller methods directly, assert the
 * right service method is invoked with the right args and the return value is
 * forwarded. No HTTP / NestJS bootstrap needed — fast and focused.
 */

import { PeriodsController } from "./periods.controller";
import { TimetableController } from "./timetable.controller";
import { PeriodsService } from "./periods.service";
import { TimetableService } from "./timetable.service";
import { CreatePeriodDto, UpdatePeriodDto, PutEntryDto } from "./dto/timetable.dto";

// ──────────────────────────────────────────────────────────────────────────────
// Minimal mock factories
// ──────────────────────────────────────────────────────────────────────────────

function mockPeriodsService(): jest.Mocked<PeriodsService> {
  return {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  } as unknown as jest.Mocked<PeriodsService>;
}

function mockTimetableService(): jest.Mocked<TimetableService> {
  return {
    getClassGrid: jest.fn(),
    getTeacherGrid: jest.fn(),
    putEntry: jest.fn(),
    deleteEntry: jest.fn(),
  } as unknown as jest.Mocked<TimetableService>;
}

// ──────────────────────────────────────────────────────────────────────────────
// PeriodsController
// ──────────────────────────────────────────────────────────────────────────────

describe("PeriodsController", () => {
  let controller: PeriodsController;
  let svc: jest.Mocked<PeriodsService>;

  beforeEach(() => {
    svc = mockPeriodsService();
    controller = new PeriodsController(svc);
  });

  it("list() delegates to periods.list()", async () => {
    const expected = [{ id: "p1", label: "Period 1", startTime: "08:00", endTime: "08:45", order: 1, isBreak: false, schoolId: "s1" }];
    svc.list.mockResolvedValue(expected as never);
    const result = await controller.list();
    expect(svc.list).toHaveBeenCalledTimes(1);
    expect(result).toBe(expected);
  });

  it("create() delegates to periods.create() with dto", async () => {
    const dto: CreatePeriodDto = { label: "P1", startTime: "08:00", endTime: "08:45", order: 1, isBreak: false };
    const created = { id: "p1", schoolId: "s1", ...dto };
    svc.create.mockResolvedValue(created as never);
    const result = await controller.create(dto);
    expect(svc.create).toHaveBeenCalledWith(dto);
    expect(result).toBe(created);
  });

  it("update() delegates to periods.update() with id + dto", async () => {
    const dto: UpdatePeriodDto = { label: "Renamed" };
    const updated = { id: "p1", schoolId: "s1", label: "Renamed", startTime: "08:00", endTime: "08:45", order: 1, isBreak: false };
    svc.update.mockResolvedValue(updated as never);
    const result = await controller.update("p1", dto);
    expect(svc.update).toHaveBeenCalledWith("p1", dto);
    expect(result).toBe(updated);
  });

  it("remove() delegates to periods.remove() with id", async () => {
    svc.remove.mockResolvedValue(undefined);
    await controller.remove("p1");
    expect(svc.remove).toHaveBeenCalledWith("p1");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// TimetableController
// ──────────────────────────────────────────────────────────────────────────────

describe("TimetableController", () => {
  let controller: TimetableController;
  let svc: jest.Mocked<TimetableService>;

  beforeEach(() => {
    svc = mockTimetableService();
    controller = new TimetableController(svc);
  });

  it("getClassGrid() delegates with classId + academicYearId", async () => {
    const grid = { periods: [], entries: [] };
    svc.getClassGrid.mockResolvedValue(grid as never);
    const result = await controller.getClassGrid("cls1", "ay1");
    expect(svc.getClassGrid).toHaveBeenCalledWith("cls1", "ay1");
    expect(result).toBe(grid);
  });

  it("getTeacherGrid() delegates with staffId + academicYearId", async () => {
    const grid = { periods: [], entries: [] };
    svc.getTeacherGrid.mockResolvedValue(grid as never);
    const result = await controller.getTeacherGrid("staff1", "ay1");
    expect(svc.getTeacherGrid).toHaveBeenCalledWith("staff1", "ay1");
    expect(result).toBe(grid);
  });

  it("putEntry() delegates with dto", async () => {
    const dto: PutEntryDto = {
      classId: "cls1",
      academicYearId: "ay1",
      dayOfWeek: 1,
      periodId: "p1",
      subjectAssignmentId: "sa1",
    };
    const entry = { id: "e1", schoolId: "s1", ...dto };
    svc.putEntry.mockResolvedValue(entry as never);
    const result = await controller.putEntry(dto);
    expect(svc.putEntry).toHaveBeenCalledWith(dto);
    expect(result).toBe(entry);
  });

  it("deleteEntry() delegates with id", async () => {
    svc.deleteEntry.mockResolvedValue(undefined);
    await controller.deleteEntry("e1");
    expect(svc.deleteEntry).toHaveBeenCalledWith("e1");
  });
});
