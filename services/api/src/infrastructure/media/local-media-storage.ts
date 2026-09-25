import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ValidationError } from "../../domain/errors.js";
import type { MediaStorage, StoredMediaObject } from "../../application/ports.js";

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

function extensionForMime(mime: string, originalFilename: string | null): string {
  const fromName = originalFilename?.includes(".")
    ? originalFilename.slice(originalFilename.lastIndexOf(".") + 1).toLowerCase()
    : "";
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  const preferred = map[mime];
  if (preferred) return preferred;
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName)) return fromName;
  return "bin";
}

/**
 * Local filesystem MediaStorage under MEDIA_ROOT.
 * storageKey is always `{projectId}/{uuid}.{ext}` — never trust client paths.
 */
export class LocalMediaStorage implements MediaStorage {
  constructor(private readonly root: string) {}

  private rootResolved(): string {
    return path.resolve(this.root);
  }

  /** Ensures storageKey stays inside MEDIA_ROOT (no path traversal). */
  resolvePath(storageKey: string): string {
    const normalized = storageKey.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!normalized || normalized.includes("..") || normalized.startsWith("/")) {
      throw new ValidationError("Invalid storage key");
    }
    const parts = normalized.split("/");
    if (parts.length !== 2 || !parts.every((p) => SAFE_SEGMENT.test(p))) {
      throw new ValidationError("Invalid storage key");
    }
    const absolute = path.resolve(this.rootResolved(), ...parts);
    const rootWithSep = this.rootResolved() + path.sep;
    if (absolute !== this.rootResolved() && !absolute.startsWith(rootWithSep)) {
      throw new ValidationError("Invalid storage key");
    }
    return absolute;
  }

  async store(input: {
    projectId: string;
    originalFilename: string | null;
    mime: string;
    body: Buffer;
  }): Promise<StoredMediaObject> {
    if (!SAFE_SEGMENT.test(input.projectId)) {
      throw new ValidationError("Invalid project id for media storage");
    }
    const ext = extensionForMime(input.mime, input.originalFilename);
    const storageKey = `${input.projectId}/${randomUUID()}.${ext}`;
    const absolutePath = this.resolvePath(storageKey);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.body);
    const checksum = createHash("sha256").update(input.body).digest("hex");
    return {
      storageKey,
      sizeBytes: input.body.byteLength,
      checksum,
      absolutePath,
    };
  }

  async delete(storageKey: string): Promise<void> {
    const absolutePath = this.resolvePath(storageKey);
    try {
      await access(absolutePath);
      await unlink(absolutePath);
    } catch {
      /* missing file is fine on delete */
    }
  }

  openReadStream(storageKey: string) {
    const absolutePath = this.resolvePath(storageKey);
    return createReadStream(absolutePath);
  }
}
