import { useEffect, useRef } from "react";
import type { FileUploadItem } from "@fiftyone/upload";
import type { FileValue } from "./types";
import { fileValueFromUploadItem } from "./utils";

interface UseFormSyncOptions {
  path: string;
  files: FileUploadItem[];
  onChange: (path: string, value: FileValue[]) => void;
}

/**
 * Keeps the operator form value in sync with the current set of
 * successfully uploaded files.
 *
 * The value is recomputed from `files` on every change rather than
 * accumulated incrementally, since `files` is the single source of truth
 * already updated safely (via functional state updates) as uploads
 * complete, fail, or are cancelled/removed.
 */
const EMPTY_SERIALIZED = "[]";

export function useFormSync({ path, files, onChange }: UseFormSyncOptions) {
  const lastSerialized = useRef(EMPTY_SERIALIZED);

  useEffect(() => {
    const successful = files
      .filter((file) => file.status === "success")
      .map(fileValueFromUploadItem);
    const serialized = JSON.stringify(successful);
    if (serialized === lastSerialized.current) return;
    lastSerialized.current = serialized;
    onChange(path, successful);
  }, [files, path, onChange]);
}
