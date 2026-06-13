import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { LocalFsStorageAdapter } from "./local-fs.adapter";

describe("LocalFsStorageAdapter", () => {
  const dir = resolve(".storage-test");
  let adapter: LocalFsStorageAdapter;

  beforeAll(() => {
    process.env.STORAGE_LOCAL_DIR = dir;
    adapter = new LocalFsStorageAdapter();
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.STORAGE_LOCAL_DIR;
  });

  it("put writes the bytes to disk under the key", async () => {
    const key = "students/abc/photo.png";
    await adapter.put(key, Buffer.from("hello"));
    const content = await fs.readFile(join(dir, key), "utf8");
    expect(content).toBe("hello");
  });

  it("getSignedUrl returns a readable URL containing the key", async () => {
    const url = await adapter.getSignedUrl("students/abc/photo.png");
    expect(url).toContain("/files/students/abc/photo.png");
  });

  it("delete removes the object", async () => {
    const key = "tmp/x.txt";
    await adapter.put(key, Buffer.from("x"));
    await adapter.delete(key);
    await expect(fs.access(join(dir, key))).rejects.toBeDefined();
  });
});
