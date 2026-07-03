import { Module } from "@nestjs/common";
import { AuthModule } from "../../core/auth/auth.module";
import { PeriodsController } from "./periods.controller";
import { PeriodsService } from "./periods.service";
import { TimetableController } from "./timetable.controller";
import { TimetableService } from "./timetable.service";

@Module({
  imports: [AuthModule],
  controllers: [PeriodsController, TimetableController],
  providers: [PeriodsService, TimetableService],
})
export class TimetableModule {}
