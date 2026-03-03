import React from "react";
import { Alert, Box, Typography } from "@mui/material";
import HeaderView from "../HeaderView";
import { getComponentProps } from "../../utils";
import UploadDropZone from "./UploadDropZone";
import UploadFileList from "./UploadFileList";
import UploadTotalProgress from "./UploadTotalProgress";
import UploadActions from "./UploadActions";
import { useUploadOrchestration } from "./useUploadOrchestration";

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

  const {
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
  } = useUploadOrchestration({
    path,
    data,
    onChange,
    destination,
    accept,
    maxSize,
    maxFiles,
    maxConcurrent,
  });

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
