import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { SkillsService } from "./skills.service";
import {
  CreateSkillDomainDto,
  UpdateSkillDomainDto,
  CreateSkillItemDto,
  UpdateSkillItemDto,
  SetSkillScaleDto,
  SaveSkillRatingsDto,
  SKILL_KINDS,
  type SkillKind,
} from "./dto/skills.dto";

function parseKind(raw: string | undefined): SkillKind {
  const k = raw ?? "conduct";
  if (!SKILL_KINDS.includes(k as SkillKind)) {
    throw new BadRequestException(`Invalid kind '${k}'. Must be one of: ${SKILL_KINDS.join(", ")}.`);
  }
  return k as SkillKind;
}

@Controller("v1/assessment")
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions("school.manage")
export class SkillsController {
  constructor(private service: SkillsService) {}

  @Get("skill-domains")
  listConfig(@Query("kind") kind?: string) {
    return this.service.listConfig(parseKind(kind));
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
  getScale(@Query("kind") kind?: string) {
    return this.service.getScale(parseKind(kind));
  }

  @Put("skill-scale")
  setScale(@Body() dto: SetSkillScaleDto, @Query("kind") kind?: string) {
    return this.service.setScale(dto.points, parseKind(kind));
  }

  @Get("skills/grid")
  @RequirePermissions("skills.record")
  getGrid(
    @Query("classId") classId: string,
    @Query("termId") termId: string,
    @Query("kind") kind?: string,
  ) {
    return this.service.getGrid(classId, termId, parseKind(kind));
  }

  @Put("skills")
  @RequirePermissions("skills.record")
  saveRatings(@Body() dto: SaveSkillRatingsDto, @CurrentUser() user: RequestUser) {
    return this.service.saveRatings(dto, user.id);
  }
}
