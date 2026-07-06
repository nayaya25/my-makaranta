/**
 * Controller delegation unit tests for DiscountsController.
 *
 * Strategy: mock DiscountsService, call controller methods directly, assert
 * the right service method is invoked with the right args and the return
 * value is forwarded. No HTTP / NestJS bootstrap needed — fast and focused.
 */

import { DiscountsController } from "./discounts.controller";
import { DiscountsService } from "./discounts.service";
import { AssignDiscountDto, CreateSchemeDto, UpdateSchemeDto } from "./dto/discounts.dto";

function mockDiscountsService(): jest.Mocked<DiscountsService> {
  return {
    listSchemes: jest.fn(),
    createScheme: jest.fn(),
    updateScheme: jest.fn(),
    deleteScheme: jest.fn(),
    listForStudent: jest.fn(),
    assign: jest.fn(),
    revoke: jest.fn(),
    schemeRoster: jest.fn(),
  } as unknown as jest.Mocked<DiscountsService>;
}

describe("DiscountsController", () => {
  let controller: DiscountsController;
  let svc: jest.Mocked<DiscountsService>;

  beforeEach(() => {
    svc = mockDiscountsService();
    controller = new DiscountsController(svc);
  });

  it("listSchemes() delegates to service.listSchemes()", async () => {
    const expected = [{ id: "sc1", name: "Sibling", method: "PERCENT", value: 10, active: true }];
    svc.listSchemes.mockResolvedValue(expected as never);
    const result = await controller.listSchemes();
    expect(svc.listSchemes).toHaveBeenCalledTimes(1);
    expect(result).toBe(expected);
  });

  it("createScheme() delegates to service.createScheme() with dto", async () => {
    const dto: CreateSchemeDto = { name: "Sibling", method: "PERCENT", value: 10 };
    const created = { id: "sc1", schoolId: "s1", ...dto, active: true };
    svc.createScheme.mockResolvedValue(created as never);
    const result = await controller.createScheme(dto);
    expect(svc.createScheme).toHaveBeenCalledWith(dto);
    expect(result).toBe(created);
  });

  it("updateScheme() delegates to service.updateScheme() with id + dto", async () => {
    const dto: UpdateSchemeDto = { active: false };
    const updated = { id: "sc1", schoolId: "s1", name: "Sibling", method: "PERCENT", value: 10, active: false };
    svc.updateScheme.mockResolvedValue(updated as never);
    const result = await controller.updateScheme("sc1", dto);
    expect(svc.updateScheme).toHaveBeenCalledWith("sc1", dto);
    expect(result).toBe(updated);
  });

  it("deleteScheme() delegates to service.deleteScheme() with id", async () => {
    const deleted = { id: "sc1" };
    svc.deleteScheme.mockResolvedValue(deleted as never);
    const result = await controller.deleteScheme("sc1");
    expect(svc.deleteScheme).toHaveBeenCalledWith("sc1");
    expect(result).toBe(deleted);
  });

  it("schemeRoster() delegates to service.schemeRoster() with id", async () => {
    const roster = [{ id: "sd1", studentId: "st1", discountSchemeId: "sc1" }];
    svc.schemeRoster.mockResolvedValue(roster as never);
    const result = await controller.schemeRoster("sc1");
    expect(svc.schemeRoster).toHaveBeenCalledWith("sc1");
    expect(result).toBe(roster);
  });

  it("listForStudent() delegates to service.listForStudent() with studentId", async () => {
    const list = [{ id: "sd1", studentId: "st1", discountSchemeId: "sc1" }];
    svc.listForStudent.mockResolvedValue(list as never);
    const result = await controller.listForStudent("st1");
    expect(svc.listForStudent).toHaveBeenCalledWith("st1");
    expect(result).toBe(list);
  });

  it("assign() delegates to service.assign() with studentId + schemeId from dto", async () => {
    const dto: AssignDiscountDto = { schemeId: "sc1" };
    const created = { id: "sd1", studentId: "st1", discountSchemeId: "sc1" };
    svc.assign.mockResolvedValue(created as never);
    const result = await controller.assign("st1", dto);
    expect(svc.assign).toHaveBeenCalledWith("st1", "sc1");
    expect(result).toBe(created);
  });

  it("revoke() delegates to service.revoke() with id", async () => {
    const revoked = { id: "sd1" };
    svc.revoke.mockResolvedValue(revoked as never);
    const result = await controller.revoke("sd1");
    expect(svc.revoke).toHaveBeenCalledWith("sd1");
    expect(result).toBe(revoked);
  });
});
