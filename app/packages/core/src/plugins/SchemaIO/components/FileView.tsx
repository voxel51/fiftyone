import { Alert, Box, Typography } from "@mui/material";
import React, { useState } from "react";
import FileDrop from "./FileDrop";
import HeaderView from "./HeaderView";
import { getComponentProps } from "../utils";
import { humanReadableBytes } from "@fiftyone/utilities";

export default function FileView(props) {
  const { onChange, path, schema, autoFocused } = props;
  const { view = {} } = schema;
  const { types } = view;
  const [type] = useState("file");
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
                return onChange(path, null);
              }
              const [file] = files;
              const { error, result } = await fileToBase64(file);
              if (error) {
                clear();
                // NOTE: error is a ProgressEvent<EventTarget>
                // there is no error message - so we print it to the console
                const msg = "Error reading file";
                console.error(msg);
                console.error(error);
                showError(msg);
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
              const resultStripped = stripBase64Prefix(result);
              const obj = {
                content: resultStripped,
                name: file.name,
                type: file.type,
                size: file.size,
                last_modified: file.lastModified,
              };
              if (isObject) return onChange(path, obj);
              onChange(path, resultStripped);
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

function stripBase64Prefix(data: string): string {
  return data.slice(data.indexOf(",") + 1);
}
