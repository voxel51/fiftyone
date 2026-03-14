import { useCallback, useEffect, useRef, useState } from "react";
import { useFileUpload, createXhrTransport } from "@fiftyone/upload";
import type { FileValue } from "./types";
import { useFormSync } from "./useFormSync";

const transport = createXhrTransport();

interface UseUploadOrchestrationOptions {
  path: string;
  data: FileValue[] | undefined;
  onChange: (path: string, value: unknown) => void;
  destination: string;
  accept?: string[];
  maxSize?: number;
  maxFiles?: number;
  maxConcurrent?: number;
}

export function useUploadOrchestration({
  path,
  data,
  onChange,
  destination,
  accept,
  maxSize,
  maxFiles,
  maxConcurrent,
}: UseUploadOrchestrationOptions) {
  const autoUploadRef = useRef({ destination, endpoint: "/files/upload" });
  autoUploadRef.current = { destination, endpoint: "/files/upload" };

  const { onFileSuccess, removeFileByPath } = useFormSync({
    path,
    data,
    onChange,
  });

  const {
    files,
    errors,
    upload,
    cancel,
    retry,
    cancelAll,
    deleteAll,
    dropProps,
    inputProps,
    browse,
    totalFiles,
    completedFiles,
    failedFiles,
    isUploading,
  } = useFileUpload({
    multiple: true,
    accept,
    maxSize,
    maxConcurrent,
    transport,
    onFileSuccess,
  });

  // Trigger uploads manually so we always use the latest destination from
  // the operator schema, avoiding stale closures from autoUpload memoization.
  useEffect(() => {
    if (files.some((f) => f.status === "selected")) {
      upload(autoUploadRef.current);
    }
  }, [files, upload]);

  const [addMoreOpen, setAddMoreOpen] = useState(false);
  const dropZoneVisible = files.length === 0 || addMoreOpen;

  const fileCountRef = useRef(files.length);
  useEffect(() => {
    if (files.length > fileCountRef.current) {
      setAddMoreOpen(false);
    }
    fileCountRef.current = files.length;
  }, [files.length]);

  const handleCancel = useCallback(
    async (id: string) => {
      const file = files.find((f) => f.id === id);
      if (file?.remotePath) {
        removeFileByPath(file.remotePath);
      }
      await cancel(id);
    },
    [files, cancel, removeFileByPath]
  );

  const handleCancelAll = useCallback(async () => {
    await cancelAll();
    onChange(path, []);
  }, [cancelAll, onChange, path]);

  const handleDeleteAll = useCallback(async () => {
    await deleteAll();
    onChange(path, []);
  }, [deleteAll, onChange, path]);

  const atFileLimit = maxFiles != null && files.length >= maxFiles;

  return {
    files,
    errors,
    retry,
    dropProps,
    inputProps,
    browse,
    totalFiles,
    completedFiles,
    failedFiles,
    isUploading,
    dropZoneVisible,
    atFileLimit,
    handleCancel,
    handleCancelAll,
    handleDeleteAll,
    setAddMoreOpen,
  };
}
