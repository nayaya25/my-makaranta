import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { redisConnectionOptions } from "../../core/queue/redis";
import type { StudentImportRow } from "./students-import";

export const STUDENT_IMPORT_QUEUE = "student-import";

@Injectable()
export class ImportsService implements OnModuleDestroy {
  private queue?: Queue;

  // Lazy: only connect when first used, so merely instantiating this service
  // (e.g. tests importing AppModule) opens no Redis connection.
  private getQueue(): Queue {
    if (!this.queue) {
      this.queue = new Queue(STUDENT_IMPORT_QUEUE, { connection: redisConnectionOptions() });
    }
    return this.queue;
  }

  async enqueueStudents(rows: StudentImportRow[], schoolId: string, actorId: string) {
    const job = await this.getQueue().add(
      "students",
      { rows, schoolId, actorId },
      { removeOnComplete: 100, removeOnFail: 100 },
    );
    return { jobId: job.id };
  }

  async status(jobId: string) {
    const job = await this.getQueue().getJob(jobId);
    if (!job) return null;
    return {
      id: job.id,
      state: await job.getState(),
      progress: job.progress,
      result: job.returnvalue ?? null,
      failedReason: job.failedReason ?? null,
    };
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }
}
