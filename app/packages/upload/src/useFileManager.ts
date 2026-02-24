import { useCallback, useRef, useState } from "react";
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

  const updateFile = useCallback(
    (id: string, patch: Partial<FileUploadItem>) =>
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
      ),
    []
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
