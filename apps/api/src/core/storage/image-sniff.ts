/**
 * Server-side image verification by magic bytes — never trust the client-supplied
 * multipart `mimetype`, which is attacker-controlled. We sniff the actual leading
 * bytes and only accept raster formats (JPEG/PNG/WebP). SVG is intentionally
 * unsupported everywhere (inline scripts → stored XSS). Dependency-free.
 */

export type SniffedImage = "image/jpeg" | "image/png" | "image/webp";

/** Returns the verified image type from the buffer's signature, or null if it isn't an allowed raster image. */
export function sniffImageType(buf: Buffer): SniffedImage | null {
  if (!buf || buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: "RIFF" .... "WEBP" (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

/** Stable file extension for a verified image type. */
export function extForImage(type: SniffedImage): "jpg" | "png" | "webp" {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}
