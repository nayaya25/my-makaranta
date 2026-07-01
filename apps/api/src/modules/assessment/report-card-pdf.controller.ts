import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../../core/auth/jwt-auth.guard";
import { PermissionGuard } from "../../core/auth/permissions/permission.guard";
import { RequirePermissions } from "../../core/auth/permissions/require-permissions.decorator";
import { ReportCardService } from "./report-card.service";
import { renderReportCardPdf } from "./report-card-pdf";

@Controller("v1/assessment/report-card.pdf")
export class ReportCardPdfController {
  constructor(private readonly reportCardService: ReportCardService) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequirePermissions("results.release")
  async download(
    @Query("studentId") studentId: string,
    @Query("termId") termId: string,
    @Res() res: Response,
  ): Promise<void> {
    const payload = await this.reportCardService.getReportCard(studentId, termId);
    const buffer = await renderReportCardPdf(payload);

    const rawFilename = `report-card-${payload.student.admissionNo}-${payload.term.label}.pdf`;
    const filename = rawFilename.replace(/[^a-zA-Z0-9.\-_]/g, "-");

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.length,
    });
    res.end(buffer);
  }
}
