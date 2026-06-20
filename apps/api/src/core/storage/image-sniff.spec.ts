import { sniffImageType, extForImage } from "./image-sniff";

/** Build a 16-byte buffer starting with the given signature bytes. */
function buf(...sig: number[]): Buffer {
  const b = Buffer.alloc(16);
  sig.forEach((v, i) => (b[i] = v));
  return b;
}

describe("sniffImageType", () => {
  it("accepts a JPEG signature", () => {
    expect(sniffImageType(buf(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
  });

  it("accepts a PNG signature", () => {
    expect(sniffImageType(buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
  });

  it("accepts a WebP (RIFF…WEBP) signature", () => {
    // RIFF at 0-3, WEBP at 8-11
    expect(
      sniffImageType(buf(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50)),
    ).toBe("image/webp");
  });

  it("rejects an SVG payload (stored-XSS vector) even though it's 'image-like'", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(sniffImageType(svg)).toBeNull();
  });

  it("rejects HTML mislabeled as an image", () => {
    expect(sniffImageType(Buffer.from("<!doctype html><script>alert(1)</script>"))).toBeNull();
  });

  it("rejects buffers too short to identify", () => {
    expect(sniffImageType(buf(0xff, 0xd8))).toBeNull();
  });

  it("maps verified types to stable extensions", () => {
    expect(extForImage("image/jpeg")).toBe("jpg");
    expect(extForImage("image/png")).toBe("png");
    expect(extForImage("image/webp")).toBe("webp");
  });
});
