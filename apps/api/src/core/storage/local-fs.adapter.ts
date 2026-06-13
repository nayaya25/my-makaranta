import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { PutOptions, StorageService } from "./storage.types";

/** Dev storage: writes to a local `.storage/` dir; URLs are served by the API's /files route. */
export class LocalFsStorageAdapter implements StorageService {
  private readonly root = resolve(process.env.STORAGE_LOCAL_DIR ?? ".storage");
  private readonly publicBase = process.env.API_BASE_URL ?? "http://localhost:4000";

  async put(key: string, body: Buffer, _opts?: PutOptions): Promise<string> {
    const path = join(this.root, key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, body);
    return key;
  }

  async getSignedUrl(key: string, _ttlSeconds = 900): Promise<string> {
    return `${this.publicBase}/files/${key}`;
  }

  async delete(key: string): Promise<void> {
    await fs.rm(join(this.root, key), { force: true });
  }
}
