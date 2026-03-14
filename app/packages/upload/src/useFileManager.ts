import { useCallback, useEffect, useRef, useState } from "react";
import type { FileUploadItem, UseFileUploadOptions } from "./types";
import { mergeFiles, validateFiles } from "./utils";

export function useFileManager(options: UseFileUploadOptions) {
  const {
    multiple = false,
    accept,
    maxSize,
    maxSizeMessage,
    validate,
  } = options;

  const [files, setFiles] = useState<FileUploadItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const filesRef = useRef(files);
  filesRef.current = files;

  // Batched updateFile: accumulates patches and flushes once per animation
  // frame. Status changes flush immediately; progress-only updates are batched.
  const pendingPatches = useRef(new Map<string, Partial<FileUploadItem>>());
  const rafId = useRef<number | null>(null);

  const flushPatches = useCallback(() => {
    rafId.current = null;
    if (pendingPatches.current.size === 0) return;
    const batch = new Map(pendingPatches.current);
    pendingPatches.current.clear();
    setFiles((prev) =>
      prev.map((f) => {
        const patch = batch.get(f.id);
        return patch ? { ...f, ...patch } : f;
      })
    );
  }, []);

  useEffect(() => {
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, []);

  const updateFile = useCallback(
    (id: string, patch: Partial<FileUploadItem>) => {
      const isProgressOnly =
        Object.keys(patch).length === 1 && "progress" in patch;
      if (isProgressOnly) {
        pendingPatches.current.set(id, {
          ...pendingPatches.current.get(id),
          ...patch,
        });
        if (rafId.current == null) {
          rafId.current = requestAnimationFrame(flushPatches);
        }
      } else {
        // Status changes (uploading, success, error) flush immediately
        pendingPatches.current.delete(id);
        setFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
        );
      }
    },
    [flushPatches]
  );

  const addFiles = useCallback(
    (incoming: File[] | FileList) => {
      const result = validateFiles(Array.from(incoming), {
        accept,
        maxSize,
        maxSizeMessage,
        validate,
      });
      setErrors(result.errors);
      if (result.accepted.length > 0) {
        setFiles((prev) => mergeFiles(prev, result.accepted, multiple));
      }
    },
    [multiple, accept, maxSize, maxSizeMessage, validate]
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clear = useCallback(() => {
    setFiles([]);
    setErrors([]);
  }, []);

  return {
    files,
    errors,
    filesRef,
    setFiles,
    updateFile,
    addFiles,
    removeFile,
    clear,
  };
}
