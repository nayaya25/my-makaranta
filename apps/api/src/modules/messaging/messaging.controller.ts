import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { CurrentUser, type RequestUser } from "../../core/auth/current-user.decorator";
import { MessagingService } from "./messaging.service";
import { CreateConversationDto, PostMessageDto } from "./dto";

@Controller("v1/me")
export class MessagingController {
  constructor(private service: MessagingService) {}

  @Get("messageable")
  @UseGuards(JwtAuthGuard)
  messageable(@CurrentUser() user: RequestUser) {
    return this.service.getMessageable(user);
  }

  @Post("conversations")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  createConversation(@Body() dto: CreateConversationDto, @CurrentUser() user: RequestUser) {
    return this.service.createConversation(user, dto.counterpartId);
  }

  @Get("conversations")
  @UseGuards(JwtAuthGuard)
  conversations(@CurrentUser() user: RequestUser) {
    return this.service.getConversations(user);
  }

  @Get("conversations/:id/messages")
  @UseGuards(JwtAuthGuard)
  messages(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.service.getMessages(user, id);
  }

  @Post("conversations/:id/messages")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  postMessage(@Param("id") id: string, @Body() dto: PostMessageDto, @CurrentUser() user: RequestUser) {
    return this.service.postMessage(user, id, dto.body);
  }
}
