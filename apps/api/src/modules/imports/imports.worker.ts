import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Worker } from "bullmq";
import { redisConnectionOptions } from "../../core/queue/redis";
import { PrismaService } from "../../core/prisma/prisma.service";
import { TenantContext } from "../../core/tenant/tenant.context";
import { STUDENT_IMPORT_QUEUE } from "./imports.service";
import { runStudentImport, type StudentImportRow } from "./students-import";

interface JobData {
  rows: StudentImportRow[];
  schoolId: string;
  actorId: string;
}

@Injectable()
export class ImportsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportsWorker.name);
  private worker?: Worker;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.worker = new Worker<JobData>(
      STUDENT_IMPORT_QUEUE,
      async (job) => {
        const { rows, schoolId, actorId } = job.data;
        // Run inside the tenant context so Prisma scopes inserts + audit logs to this school.
        return TenantContext.run({ schoolId, userId: actorId }, () =>
          runStudentImport(this.prisma, rows),
        );
      },
      { connection: redisConnectionOptions() },
    );
    this.worker.on("failed", (job, err) =>
      this.logger.error(`Import job ${job?.id} failed: ${err.message}`),
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
