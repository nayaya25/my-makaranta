import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { TenantContext } from "../../core/tenant/tenant.context";
import { AdmissionsService } from "./admissions.service";
import {
  CreateApplicantDto,
  EnrollApplicantDto,
  ListApplicantsQuery,
  TransitionDto,
  UpdateApplicantDto,
} from "./dto/admissions.dto";

@Controller("v1/admissions")
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermissions("admissions.manage")
export class AdmissionsController {
  constructor(private readonly admissions: AdmissionsService) {}

  @Get("applicants")
  list(@Query() query: ListApplicantsQuery) {
    return this.admissions.list(query);
  }

  @Post("applicants")
  create(@Body() dto: CreateApplicantDto) {
    return this.admissions.createStaff(dto);
  }

  @Get("stats")
  stats() {
    return this.admissions.stats();
  }

  @Get("applicants/:id")
  getOne(@Param("id") id: string) {
    return this.admissions.getOne(id);
  }

  @Patch("applicants/:id")
  patch(@Param("id") id: string, @Body() dto: UpdateApplicantDto) {
    return this.admissions.patch(id, dto);
  }

  @Post("applicants/:id/transition")
  transition(@Param("id") id: string, @Body() dto: TransitionDto) {
    const actorId = TenantContext.current()?.userId ?? "system";
    return this.admissions.transition(id, dto, actorId);
  }

  @Post("applicants/:id/enroll")
  enroll(@Param("id") id: string, @Body() dto: EnrollApplicantDto) {
    return this.admissions.enroll(id, dto);
  }
}
