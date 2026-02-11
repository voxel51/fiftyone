import type {
  FileUploadItem,
  HeadersOption,
  UploadAction,
  ValidationOptions,
} from "./types";

// ── ID generation ──────────────────────────────────────────────────────

let nextId = 0;

export function generateId(): string {
  return `upload-${++nextId}-${Date.now()}`;
}

// ── File fingerprinting ────────────────────────────────────────────────

export function getFileFingerprint(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

// ── Accept matching ────────────────────────────────────────────────────

export function matchesAccept(file: File, accept: string[]): boolean {
  return accept.some((pattern) => {
    if (pattern.startsWith(".")) {
      return file.name.toLowerCase().endsWith(pattern.toLowerCase());
    }
    if (pattern.endsWith("/*")) {
      return file.type.startsWith(pattern.slice(0, -1));
    }
    return file.type === pattern;
  });
}

// ── Single-file validation ─────────────────────────────────────────────

export function validateFile(
  file: File,
  options: ValidationOptions
): string | null {
  const { accept, maxSize, maxSizeMessage, validate } = options;

  if (accept && !matchesAccept(file, accept)) {
    return `"${file.name}" does not match accepted types: ${accept.join(", ")}`;
  }
  if (maxSize != null && file.size > maxSize) {
    return maxSizeMessage ?? `"${file.name}" exceeds the maximum file size`;
  }
  if (validate) {
    return validate(file);
  }
  return null;
}

// ── Batch validation ───────────────────────────────────────────────────

export function validateFiles(
  files: File[],
  options: ValidationOptions
): { accepted: File[]; errors: string[] } {
  const accepted: File[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const error = validateFile(file, options);
    if (error) {
      errors.push(error);
    } else {
      accepted.push(file);
    }
  }

  return { accepted, errors };
}

// ── File item creation ─────────────────────────────────────────────────

export function createFileItem(file: File): FileUploadItem {
  return {
    id: generateId(),
    file,
    name: file.name,
    size: file.size,
    type: file.type,
    status: "selected",
    progress: 0,
  };
}

// ── Merge new files into existing list ─────────────────────────────────

export function mergeFiles(
  existing: FileUploadItem[],
  accepted: File[],
  multiple: boolean
): FileUploadItem[] {
  const fingerprints = new Set(
    existing.map((item) => getFileFingerprint(item.file))
  );

  const newItems = accepted
    .filter((file) => {
      const fp = getFileFingerprint(file);
      if (fingerprints.has(fp)) return false;
      fingerprints.add(fp);
      return true;
    })
    .map(createFileItem);

  if (!multiple) {
    return newItems.length > 0 ? [newItems[0]] : existing;
  }

  return [...existing, ...newItems];
}

// ── URL builders ───────────────────────────────────────────────────────

export function defaultResolvePath(destination: string, file: File): string {
  return `${destination}/${file.name}`;
}

export function buildUploadUrl(action: UploadAction, file: File): string {
  const { destination, endpoint = "/files/upload", resolvePath } = action;
  const path = (resolvePath ?? defaultResolvePath)(destination, file);
  return `${endpoint}?path=${encodeURIComponent(path)}`;
}

export function buildDeleteUrl(
  endpoint: string | undefined,
  remotePath: string
): string {
  const base = (endpoint ?? "/files/upload").replace(/\/upload$/, "");
  return `${base}?path=${encodeURIComponent(remotePath)}`;
}

// ── Error extraction ───────────────────────────────────────────────────

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Upload failed";
}

// ── Headers resolution ─────────────────────────────────────────────────

export async function resolveHeaders(
  headers?: HeadersOption
): Promise<Record<string, string> | undefined> {
  if (!headers) return undefined;
  if (typeof headers === "function") return await headers();
  return headers;
}

// ── Concurrency limiter ────────────────────────────────────────────────

export type ConcurrencyLimiter = <T>(fn: () => Promise<T>) => Promise<T>;

export function createConcurrencyLimiter(max: number): ConcurrencyLimiter {
  let active = 0;
  const queue: (() => void)[] = [];

  function next() {
    while (queue.length > 0 && active < max) {
      active++;
      queue.shift()!();
    }
  }

  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() =>
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          })
      );
      next();
    });
}
