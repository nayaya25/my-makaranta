import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AdmissionsService } from "./admissions.service";
import { PublicApplicationDto } from "./dto/public-application.dto";

@Controller("v1/public")
export class AdmissionsPublicController {
  constructor(private readonly service: AdmissionsService) {}

  @Post("applications")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  createPublic(@Body() dto: PublicApplicationDto) {
    return this.service.createPublic(dto);
  }

  @Get("schools/:slug/admission-meta")
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  admissionMeta(@Param("slug") slug: string) {
    return this.service.publicMeta(slug);
  }
}
