import { useCallback, useRef } from "react";
import type { FileUploadItem, UseFileUploadOptions } from "@fiftyone/upload";
import type { FileValue } from "./types";
import { fileValueFromUploadItem } from "./utils";

interface UseFormSyncOptions {
  path: string;
  data: FileValue[] | undefined;
  onChange: (path: string, value: FileValue[]) => void;
}

/**
 * Creates `onFileSuccess` and `onFileError` callbacks that keep the operator
 * form value in sync with upload results.
 *
 * Completed uploads are appended to the form value as `FileValue` objects.
 * Cancelled / removed uploads are pruned by `absolute_path`.
 */
export function useFormSync({ path, data, onChange }: UseFormSyncOptions) {
  const dataRef = useRef(data);
  dataRef.current = data;

  const appendFile = useCallback(
    (item: FileUploadItem) => {
      const current = dataRef.current ?? [];
      const fileValue = fileValueFromUploadItem(item);
      onChange(path, [...current, fileValue]);
    },
    [path, onChange]
  );

  const removeFileByPath = useCallback(
    (remotePath: string) => {
      const current = dataRef.current ?? [];
      onChange(
        path,
        current.filter((f) => f.absolute_path !== remotePath)
      );
    },
    [path, onChange]
  );

  const onFileSuccess: UseFileUploadOptions["onFileSuccess"] = useCallback(
    (item) => {
      appendFile(item);
    },
    [appendFile]
  );

  return { onFileSuccess, removeFileByPath };
}
