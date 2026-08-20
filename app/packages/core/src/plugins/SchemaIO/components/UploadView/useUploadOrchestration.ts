import { useCallback, useEffect, useRef, useState } from "react";
import { useFileUpload, createXhrTransport } from "@fiftyone/upload";
import { getFetchPathPrefix } from "@fiftyone/utilities";
import { useFormSync } from "./useFormSync";

const transport = createXhrTransport();

interface UseUploadOrchestrationOptions {
  path: string;
  onChange: (path: string, value: unknown) => void;
  destination: string;
  accept?: string[];
  maxSize?: number;
  maxFiles?: number;
  maxConcurrent?: number;
}

export function useUploadOrchestration({
  path,
  onChange,
  destination,
  accept,
  maxSize,
  maxFiles,
  maxConcurrent,
}: UseUploadOrchestrationOptions) {
  const uploadEndpoint = `${getFetchPathPrefix()}/files/upload`;
  const autoUploadRef = useRef({ destination, endpoint: uploadEndpoint });
  autoUploadRef.current = { destination, endpoint: uploadEndpoint };

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
  });

  useFormSync({ path, files, onChange });

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
      await cancel(id);
    },
    [cancel],
  );

  const handleCancelAll = useCallback(async () => {
    await cancelAll();
  }, [cancelAll]);

  const handleDeleteAll = useCallback(async () => {
    await deleteAll();
  }, [deleteAll]);

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
