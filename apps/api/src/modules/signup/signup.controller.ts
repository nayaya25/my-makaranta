import { Controller, Get, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SignupService } from "./signup.service";

@Controller("v1/public/signup")
export class SignupController {
  constructor(private readonly signupService: SignupService) {}

  @Get("slug-available")
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  checkSlug(@Query("slug") slug: string) {
    return this.signupService.checkSlug(slug ?? "");
  }
}
