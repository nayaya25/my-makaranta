import { Controller, Get, Param } from "@nestjs/common";
import { PublicService } from "./public.service";

@Controller("v1/public")
export class PublicController {
  constructor(private service: PublicService) {}

  @Get("verify/:code")
  verify(@Param("code") code: string) {
    return this.service.verify(code);
  }
}
