import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../../core/auth/current-user.decorator";
import { SchoolsService } from "./schools.service";
import { CreateSchoolDto } from "./dto/schools.dto";

@Controller("v1/schools")
export class SchoolsController {
  constructor(private schools: SchoolsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateSchoolDto, @CurrentUser() user: RequestUser) {
    return this.schools.createSchool(dto, user.id);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: RequestUser) {
    return this.schools.getMySchool(user.schoolId);
  }
}
