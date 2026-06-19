import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { CurrentUser, RequestUser } from "../../core/auth/current-user.decorator";
import { ProfileService } from "./profile.service";
import { UpdateProfileDto } from "./dto/profile.dto";

@Controller("v1/profile")
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private profile: ProfileService) {}

  @Get("me")
  me(@CurrentUser() user: RequestUser) {
    return this.profile.getMe(user);
  }

  @Patch("me")
  update(@CurrentUser() user: RequestUser, @Body() dto: UpdateProfileDto) {
    return this.profile.updateMe(user, dto);
  }

  @Post("me/photo")
  @UseInterceptors(FileInterceptor("file"))
  setPhoto(@CurrentUser() user: RequestUser, @UploadedFile() file?: Express.Multer.File) {
    return this.profile.setPhoto(user, file);
  }
}
