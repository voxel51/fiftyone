import type { FileUploadItem } from "@fiftyone/upload";
import type { FileValue } from "./types";

export function statusBorderColor(status: string): string {
  if (status === "success") return "success.main";
  if (status === "error") return "error.main";
  return "divider";
}

export function statusOpacity(status: string): number {
  if (status === "success" || status === "error") return 1;
  return 0.45;
}

export function computeTotalProgress(files: FileUploadItem[]): number {
  if (files.length === 0) return 0;
  const sum = files.reduce((acc, f) => {
    if (f.status === "success") return acc + 100;
    if (f.status === "uploading") return acc + f.progress;
    return acc;
  }, 0);
  return sum / files.length;
}

export function fileValueFromUploadItem(item: FileUploadItem): FileValue {
  return {
    absolute_path: item.remotePath!,
    name: item.name,
    type: item.type,
    size: item.size,
  };
}
