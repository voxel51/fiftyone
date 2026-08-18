import { useEffect } from "react";
import type { UseFileUploadOptions } from "./types";
import { errorMessage } from "./utils";
import { useFileDrop } from "./useFileDrop";
import { useFileInput } from "./useFileInput";
import { useFileManager } from "./useFileManager";
import { useUploadManager } from "./useUploadManager";

export function useFileUpload(options: UseFileUploadOptions = {}) {
  const {
    multiple = false,
    accept,
    transport,
    maxConcurrent,
    headers,
    onFileSuccess,
    onFileError,
    autoUpload,
  } = options;

  const {
    files,
    errors,
    filesRef,
    setFiles,
    updateFile,
    addFiles,
    removeFile,
    clear,
  } = useFileManager(options);

  const { upload, cancel, retry, cancelAll, deleteAll } = useUploadManager({
    filesRef,
    updateFile,
    setFiles,
    transport,
    maxConcurrent,
    headers,
    onFileSuccess,
    onFileError,
  });

  const dropProps = useFileDrop(addFiles);
  const { inputProps, browse } = useFileInput(accept, multiple, addFiles);

  // Auto-upload: as soon as new files land in "selected" status, start uploading
  useEffect(() => {
    if (autoUpload && files.some((f) => f.status === "selected")) {
      upload(autoUpload).catch((err) => {
        // `upload` marks files "uploading" before resolving headers, so a
        // rejection there (e.g. an async headers factory that throws) would
        // otherwise leave them stuck "uploading" forever with no feedback.
        const msg = errorMessage(err);
        setFiles((prev) =>
          prev.map((f) =>
            f.status === "uploading"
              ? { ...f, status: "error", error: msg }
              : f,
          ),
        );
      });
    }
  }, [autoUpload, files, upload, setFiles]);

  return {
    files,
    errors,
    addFiles,
    removeFile,
    clear,
    upload,
    cancel,
    retry,
    cancelAll,
    deleteAll,
    dropProps,
    inputProps,
    browse,
    totalFiles: files.length,
    completedFiles: files.filter((f) => f.status === "success").length,
    failedFiles: files.filter((f) => f.status === "error").length,
    isUploading: files.some((f) => f.status === "uploading"),
  };
}
