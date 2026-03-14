import { vi, beforeEach } from "vitest";
import type { TransportPostOptions, UploadTransport } from "../types";

// ── File creation ──────────────────────────────────────────────────────

export function createFile(
  name: string,
  size: number,
  type: string,
  lastModified?: number
): File {
  const content = new Uint8Array(size);
  return new File([content], name, {
    type,
    lastModified: lastModified ?? Date.now(),
  });
}

// ── Drag event mock ────────────────────────────────────────────────────

export function createDragEvent(files: File[]): React.DragEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: { files },
  } as unknown as React.DragEvent;
}

// ── Deferred promise ───────────────────────────────────────────────────

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ── Response factories ─────────────────────────────────────────────────

export function successResponse(path: string) {
  return new Response(JSON.stringify({ path }), { status: 201 });
}

export function errorResponse(status: number, code: string, message = "error") {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
  });
}

// ── Mock transport ─────────────────────────────────────────────────────

export function createMockTransport() {
  const post = vi.fn();
  const del = vi.fn().mockResolvedValue(undefined);
  return {
    transport: { post, delete: del } as unknown as UploadTransport,
    post,
    delete: del,
  };
}

export type { TransportPostOptions };

// ── Global fetch mock ──────────────────────────────────────────────────

export const mockFetch = vi.fn();

export function setupFetchMock() {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });
}
