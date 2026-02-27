import type { FileUploadItem } from "@fiftyone/upload";

export interface UploadViewProps {
  onChange: (path: string, value: unknown) => void;
  path: string;
  schema: UploadViewSchema;
  data?: FileValue[];
}

export interface UploadViewSchema {
  type: string;
  view: UploadViewConfig;
}

export interface UploadViewConfig {
  destination: string;
  accept?: string[];
  max_size?: number;
  max_files?: number;
  max_concurrent?: number;
  label?: string;
  description?: string;
  caption?: string;
  read_only?: boolean;
  componentsProps?: Record<string, unknown>;
}

export interface FileValue {
  absolute_path: string;
  name: string;
  type: string;
  size: number;
}

export function fileValueFromUploadItem(item: FileUploadItem): FileValue {
  return {
    absolute_path: item.remotePath!,
    name: item.name,
    type: item.type,
    size: item.size,
  };
}
