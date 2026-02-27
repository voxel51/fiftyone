import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Typography } from "@mui/material";
import { useFileUpload, createXhrTransport } from "@fiftyone/upload";
import HeaderView from "../HeaderView";
import { getComponentProps } from "../../utils";
import UploadDropZone from "./UploadDropZone";
import UploadFileList from "./UploadFileList";
import UploadTotalProgress from "./UploadTotalProgress";
import UploadActions from "./UploadActions";
import useFormSync from "./useFormSync";

const transport = createXhrTransport();

export default function UploadView(props) {
  const { onChange, path, schema, data } = props;
  const { view = {} } = schema;
  const {
    destination,
    accept,
    max_size: maxSize,
    max_files: maxFiles,
    max_concurrent: maxConcurrent,
    read_only: readOnly,
  } = view;

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

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} nested />
      <Box sx={{ pt: 1 }} {...getComponentProps(props, "uploadContainer")}>
        {dropZoneVisible && (
          <UploadDropZone
            dropProps={dropProps}
            inputProps={inputProps}
            browse={browse}
            disabled={readOnly || atFileLimit}
          />
        )}
        {errors.map((error, i) => (
          <Alert key={i} severity="warning" sx={{ mt: 1 }}>
            <Typography>{error}</Typography>
          </Alert>
        ))}
        {files.length > 0 && (
          <>
            {(isUploading || completedFiles > 0) && (
              <UploadTotalProgress
                files={files}
                isUploading={isUploading}
                completedFiles={completedFiles}
                failedFiles={failedFiles}
                totalFiles={totalFiles}
              />
            )}
            <UploadFileList
              files={files}
              onCancel={handleCancel}
              onRetry={retry}
            />
            <UploadActions
              showAddMore={!dropZoneVisible && !readOnly && !atFileLimit}
              showCancelAll={isUploading}
              onAddMore={() => setAddMoreOpen(true)}
              onCancelAll={handleCancelAll}
              onDeleteAll={handleDeleteAll}
            />
          </>
        )}
      </Box>
    </Box>
  );
}
