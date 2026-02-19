import { useEffect } from "react";
import type { UseFileUploadOptions } from "./types";
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

  const { upload, cancel, retry, cancelAll } = useUploadManager({
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
      upload(autoUpload);
    }
  }, [autoUpload, files, upload]);

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
    dropProps,
    inputProps,
    browse,
    totalFiles: files.length,
    completedFiles: files.filter((f) => f.status === "success").length,
    failedFiles: files.filter((f) => f.status === "error").length,
    isUploading: files.some((f) => f.status === "uploading"),
  };
}
