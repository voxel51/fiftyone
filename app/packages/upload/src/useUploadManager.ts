import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useMemo, useRef } from "react";
import { createFetchTransport } from "./client";
import type {
  FileUploadItem,
  HeadersOption,
  UploadAction,
  UploadTransport,
} from "./types";
import {
  buildDeleteUrl,
  buildUploadUrl,
  createConcurrencyLimiter,
  errorMessage,
  resolveHeaders,
  type ConcurrencyLimiter,
} from "./utils";

export interface UploadManagerDeps {
  filesRef: MutableRefObject<FileUploadItem[]>;
  updateFile: (id: string, patch: Partial<FileUploadItem>) => void;
  setFiles: Dispatch<SetStateAction<FileUploadItem[]>>;
  transport?: UploadTransport;
  maxConcurrent?: number;
  headers?: HeadersOption;
  onFileSuccess?: (file: FileUploadItem) => void;
  onFileError?: (file: FileUploadItem, error: string) => void;
}

export function useUploadManager({
  filesRef,
  updateFile,
  setFiles,
  transport,
  maxConcurrent,
  headers,
  onFileSuccess,
  onFileError,
}: UploadManagerDeps) {
  const lastActionRef = useRef<UploadAction | null>(null);
  const abortControllersRef = useRef(new Map<string, AbortController>());

  // Stable transport reference — avoid re-creating default on every render
  const transportRef = useRef(transport ?? createFetchTransport());
  if (transport) transportRef.current = transport;

  const DEFAULT_MAX_CONCURRENT = 6;

  // Stable limiter — recreated only when maxConcurrent changes
  const limiter: ConcurrencyLimiter = useMemo(
    () => createConcurrencyLimiter(maxConcurrent ?? DEFAULT_MAX_CONCURRENT),
    [maxConcurrent]
  );

  // Headers are resolved once per upload/retry call and passed through,
  // avoiding an unnecessary async hop inside each uploadOne invocation.

  const uploadOne = useCallback(
    async (
      item: FileUploadItem,
      action: UploadAction,
      resolvedHeaders?: Record<string, string>
    ) => {
      const url = buildUploadUrl(action, item.file);
      const controller = new AbortController();
      abortControllersRef.current.set(item.id, controller);

      try {
        const { path } = await transportRef.current.post(url, item.file, {
          signal: controller.signal,
          onProgress: (p) => updateFile(item.id, { progress: p }),
          headers: resolvedHeaders,
        });
        if (!controller.signal.aborted) {
          const updated: Partial<FileUploadItem> = {
            status: "success",
            progress: 100,
            remotePath: path,
            error: undefined,
          };
          updateFile(item.id, updated);
          onFileSuccess?.({ ...item, ...updated } as FileUploadItem);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          const msg = errorMessage(err);
          updateFile(item.id, { status: "error", error: msg });
          onFileError?.(item, msg);
        }
      } finally {
        abortControllersRef.current.delete(item.id);
      }
    },
    [updateFile, onFileSuccess, onFileError]
  );

  const upload = useCallback(
    async (action: UploadAction) => {
      lastActionRef.current = action;
      const toUpload = filesRef.current.filter((f) => f.status === "selected");
      if (toUpload.length === 0) return;

      // Mark all selected files as "uploading" synchronously before any async
      // work. This prevents the autoUpload effect from re-queuing the same
      // files when the state update triggers a re-render.
      setFiles((prev) =>
        prev.map((f) =>
          f.status === "selected"
            ? { ...f, status: "uploading" as const, progress: 0 }
            : f
        )
      );

      const resolved =
        headers != null ? await resolveHeaders(headers) : undefined;
      const run = (item: FileUploadItem) => uploadOne(item, action, resolved);
      await Promise.all(toUpload.map((item) => limiter(() => run(item))));
    },
    [filesRef, setFiles, uploadOne, limiter, headers]
  );

  const cancel = useCallback(
    async (id: string) => {
      const file = filesRef.current.find((f) => f.id === id);
      if (!file) return;

      if (file.status === "uploading") {
        abortControllersRef.current.get(id)?.abort();
      }
      if (file.status === "success" && file.remotePath) {
        const url = buildDeleteUrl(
          lastActionRef.current?.endpoint,
          file.remotePath
        );
        const resolved =
          headers != null ? await resolveHeaders(headers) : undefined;
        await transportRef.current.delete(url, { headers: resolved });
      }
      setFiles((prev) => prev.filter((f) => f.id !== id));
    },
    [filesRef, setFiles, headers]
  );

  const retry = useCallback(
    async (id: string) => {
      const action = lastActionRef.current;
      if (!action) return;
      const file = filesRef.current.find((f) => f.id === id);
      if (!file || file.status !== "error") return;
      const resolved =
        headers != null ? await resolveHeaders(headers) : undefined;
      await uploadOne(file, action, resolved);
    },
    [filesRef, uploadOne, headers]
  );

  const cancelAll = useCallback(async () => {
    for (const c of abortControllersRef.current.values()) c.abort();
    abortControllersRef.current.clear();
    const snapshot = filesRef.current;
    setFiles([]);
    const resolved =
      headers != null ? await resolveHeaders(headers) : undefined;
    const toDelete = snapshot.filter(
      (f) => f.status === "success" && f.remotePath
    );
    await Promise.all(
      toDelete.map((f) =>
        transportRef.current.delete(
          buildDeleteUrl(lastActionRef.current?.endpoint, f.remotePath!),
          { headers: resolved }
        )
      )
    );
  }, [filesRef, setFiles, headers]);

  /**
   * Aborts every in-flight upload, sends DELETE requests for all
   * successfully uploaded files, and clears the file list.
   *
   * Unlike `cancelAll` (which is identical in behaviour today), this
   * method is intended to be the user-facing "destroy everything" action,
   * while `cancelAll` is the "stop all pending work" action.
   */
  const deleteAll = useCallback(async () => {
    for (const c of abortControllersRef.current.values()) c.abort();
    abortControllersRef.current.clear();

    const snapshot = filesRef.current;
    setFiles([]);

    const resolved =
      headers != null ? await resolveHeaders(headers) : undefined;

    const toDelete = snapshot.filter((f) => f.remotePath);
    await Promise.allSettled(
      toDelete.map((f) =>
        transportRef.current.delete(
          buildDeleteUrl(lastActionRef.current?.endpoint, f.remotePath!),
          { headers: resolved }
        )
      )
    );
  }, [filesRef, setFiles, headers]);

  return { upload, cancel, retry, cancelAll, deleteAll };
}
