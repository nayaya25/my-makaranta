import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { ParentsService } from "./parents.service";
import { CreateParentDto, CreateGuardianDto } from "./dto/parent.dto";

@Controller()
export class ParentsController {
  constructor(private parents: ParentsService) {}

  @Post("v1/parents")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("students.create")
  createParent(@Body() dto: CreateParentDto) {
    return this.parents.createParent(dto);
  }

  @Post("v1/students/:id/guardians")
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("students.update")
  createGuardian(@Param("id") id: string, @Body() dto: CreateGuardianDto) {
    return this.parents.createGuardian(id, dto);
  }

  @Get("v1/students/:id/guardians")
  @UseGuards(JwtAuthGuard)
  findGuardians(@Param("id") id: string) {
    return this.parents.findGuardians(id);
  }
}
