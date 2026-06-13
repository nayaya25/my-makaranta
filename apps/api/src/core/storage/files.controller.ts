import { Controller, Get, NotFoundException, Param, StreamableFile } from "@nestjs/common";
import { createReadStream, existsSync } from "node:fs";
import { join, normalize, resolve } from "node:path";

/** Serves locally-stored uploads in dev (STORAGE_PROVIDER=local). In prod (s3) files are
 *  fetched via signed URLs, so this returns 404. Path-traversal is blocked. */
@Controller("files")
export class FilesController {
  private readonly root = resolve(process.env.STORAGE_LOCAL_DIR ?? ".storage");

  @Get("*")
  get(@Param() params: Record<string, string>): StreamableFile {
    if (process.env.STORAGE_PROVIDER === "s3") throw new NotFoundException();
    const rel = params["0"] ?? "";
    const safe = normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
    const path = join(this.root, safe);
    if (!path.startsWith(this.root) || !existsSync(path)) throw new NotFoundException();
    return new StreamableFile(createReadStream(path));
  }
}
