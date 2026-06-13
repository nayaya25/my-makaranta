import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantInfo {
  schoolId: string | null;
  userId: string | null;
}

const storage = new AsyncLocalStorage<TenantInfo>();

export const TenantContext = {
  current(): TenantInfo | null {
    return storage.getStore() ?? null;
  },
  run<T>(info: TenantInfo, fn: () => Promise<T>): Promise<T> {
    return storage.run(info, fn);
  },
  schoolIdOrThrow(): string {
    const ctx = storage.getStore();
    if (!ctx?.schoolId) throw new Error("TenantContext: schoolId required");
    return ctx.schoolId;
  },
};
