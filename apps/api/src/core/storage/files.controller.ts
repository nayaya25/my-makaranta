import { Controller, Get, NotFoundException, Param, Query, StreamableFile } from "@nestjs/common";
import { createReadStream, existsSync } from "node:fs";
import { join, normalize, resolve } from "node:path";
import { verifyFileToken } from "./file-signing";

/** Serves locally-stored uploads in dev (STORAGE_PROVIDER=local) ONLY via a valid signed token
 *  (exp+sig from StorageService.getSignedUrl). No valid signature -> 404, so files can't be
 *  enumerated or read cross-tenant. In prod (s3) this route is disabled; S3 signs its own URLs.
 *  Path-traversal is blocked. */
@Controller("files")
export class FilesController {
  private readonly root = resolve(process.env.STORAGE_LOCAL_DIR ?? ".storage");

  @Get("*")
  get(
    @Param() params: Record<string, string>,
    @Query("exp") exp: string,
    @Query("sig") sig: string,
  ): StreamableFile {
    if (process.env.STORAGE_PROVIDER === "s3") throw new NotFoundException();
    const rel = params["0"] ?? "";
    if (!verifyFileToken(rel, Number(exp), sig)) throw new NotFoundException();

    const safe = normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
    const path = join(this.root, safe);
    if (!path.startsWith(this.root) || !existsSync(path)) throw new NotFoundException();
    return new StreamableFile(createReadStream(path));
  }
}
