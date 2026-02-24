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

  // Stable limiter — recreated only when maxConcurrent changes
  const limiter: ConcurrencyLimiter | undefined = useMemo(
    () =>
      maxConcurrent != null
        ? createConcurrencyLimiter(maxConcurrent)
        : undefined,
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
      updateFile(item.id, { status: "uploading", progress: 0 });

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
      // Resolve headers once — avoids async yield when headers is undefined
      const resolved =
        headers != null ? await resolveHeaders(headers) : undefined;
      const toUpload = filesRef.current.filter((f) => f.status === "selected");
      const run = (item: FileUploadItem) => uploadOne(item, action, resolved);
      const tasks = limiter
        ? toUpload.map((item) => limiter(() => run(item)))
        : toUpload.map(run);
      await Promise.all(tasks);
    },
    [filesRef, uploadOne, limiter, headers]
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

  return { upload, cancel, retry, cancelAll };
}
