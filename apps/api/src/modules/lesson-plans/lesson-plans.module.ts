import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { LessonPlansController } from "./lesson-plans.controller";
import { LessonPlansService } from "./lesson-plans.service";

@Module({
  imports: [AuthModule],
  controllers: [LessonPlansController],
  providers: [LessonPlansService],
})
export class LessonPlansModule {}
