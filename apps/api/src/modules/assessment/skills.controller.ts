import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { SkillsService } from "./skills.service";
import {
  CreateSkillDomainDto,
  UpdateSkillDomainDto,
  CreateSkillItemDto,
  UpdateSkillItemDto,
  SetSkillScaleDto,
} from "./dto/skills.dto";

@Controller("v1/assessment")
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions("school.manage")
export class SkillsController {
  constructor(private service: SkillsService) {}

  @Get("skill-domains")
  listConfig() {
    return this.service.listConfig();
  }

  @Post("skill-domains")
  createDomain(@Body() dto: CreateSkillDomainDto) {
    return this.service.createDomain(dto);
  }

  @Patch("skill-domains/:id")
  updateDomain(@Param("id") id: string, @Body() dto: UpdateSkillDomainDto) {
    return this.service.updateDomain(id, dto);
  }

  @Delete("skill-domains/:id")
  deleteDomain(@Param("id") id: string) {
    return this.service.deleteDomain(id);
  }

  @Post("skill-items")
  createItem(@Body() dto: CreateSkillItemDto) {
    return this.service.createItem(dto);
  }

  @Patch("skill-items/:id")
  updateItem(@Param("id") id: string, @Body() dto: UpdateSkillItemDto) {
    return this.service.updateItem(id, dto);
  }

  @Delete("skill-items/:id")
  deleteItem(@Param("id") id: string) {
    return this.service.deleteItem(id);
  }

  @Get("skill-scale")
  getScale() {
    return this.service.getScale();
  }

  @Put("skill-scale")
  setScale(@Body() dto: SetSkillScaleDto) {
    return this.service.setScale(dto.points);
  }
}
