import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { ParentService } from "./parent.service";

@Controller("v1/parent")
export class ParentController {
  constructor(private service: ParentService) {}

  @Get("children")
  @UseGuards(JwtAuthGuard)
  children(@CurrentUser() user: RequestUser) {
    return this.service.getChildren(user);
  }
}
