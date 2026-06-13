export const STORAGE_SERVICE = Symbol("STORAGE_SERVICE");

export interface PutOptions {
  contentType?: string;
}

export interface StorageService {
  /** Store bytes under a key. Returns the key. */
  put(key: string, body: Buffer, opts?: PutOptions): Promise<string>;
  /** A time-limited URL for reading the object. */
  getSignedUrl(key: string, ttlSeconds?: number): Promise<string>;
  /** Remove an object (no-op if absent). */
  delete(key: string): Promise<void>;
}
