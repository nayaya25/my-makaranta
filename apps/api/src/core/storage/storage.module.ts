import { Global, Module } from "@nestjs/common";
import { STORAGE_SERVICE } from "./storage.types";
import { LocalFsStorageAdapter } from "./local-fs.adapter";
import { S3StorageAdapter } from "./s3.adapter";

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useFactory: () =>
        process.env.STORAGE_PROVIDER === "s3"
          ? new S3StorageAdapter()
          : new LocalFsStorageAdapter(),
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
