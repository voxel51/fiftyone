import { Alert, Box, Typography } from "@mui/material";
import React, { useState } from "react";
import FileDrop from "./FileDrop";
import HeaderView from "./HeaderView";
import TabsView from "./TabsView";
import TextFieldView from "./TextFieldView";
import { getComponentProps } from "../utils";

export default function FileView(props) {
  const { onChange, path, schema, autoFocused } = props;
  const { view = {} } = schema;
  const { types } = view;
  const [type, setType] = useState("file");
  const isObject = schema.type === "object";
  const maxSize = view.max_size || null;
  const customMaxSizeMessage = view.max_size_error_message || null;
  const [currentError, setCurrentError] = useState(null);

  const showError = (message) => {
    setCurrentError({ message });
  };

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView {...props} nested />
      <Box sx={{ pt: 1 }} {...getComponentProps(props, "fileContainer")}>
        {type === "file" && (
          <FileDrop
            onChange={async (files, clear) => {
              if (files?.length === 0) {
                return onChange(path, "");
              }
              const [file] = files;
              const { error, result } = await fileToBase64(file);
              if (error) {
                clear();
                showError("Error reading file");
                return;
              }
              if (maxSize && file.size > maxSize) {
                clear();
                showError(
                  customMaxSizeMessage ||
                    `File size must be less than ${humanReadableBytes(maxSize)}`
                );
                return;
              }
              setCurrentError(null);
              const obj = {
                contents: result,
                name: file.name,
                type: file.type,
                size: file.size,
                last_modified: file.lastModified,
              };
              if (isObject) return onChange(path, obj);
              onChange(path, result);
            }}
            types={types}
            autoFocused={autoFocused}
            // allowMultiple={allowMultiple}
            {...getComponentProps(props, "fileDrop")}
          />
        )}
        {currentError && (
          <Alert severity="warning">
            <Typography>{currentError.message}</Typography>
          </Alert>
        )}
      </Box>
    </Box>
  );
}

function fileToBase64(
  file: File
): Promise<{ result?: string; error?: ProgressEvent<EventTarget> }> {
  return new Promise((resolve) => {
    const fileReader = new FileReader();
    fileReader.readAsDataURL(file);
    fileReader.onload = () => resolve({ result: fileReader.result as string });
    fileReader.onerror = (error) => resolve({ error });
  });
}

function humanReadableBytes(bytes: number): string {
  if (!bytes) return "";

  const units: string[] = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  if (bytes === 0) return "0 Byte";

  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + units[i];
}
