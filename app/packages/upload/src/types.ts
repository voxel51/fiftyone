export type FileUploadStatus =
  | "selected"
  | "uploading"
  | "success"
  | "error"
  | "cancelled";

export interface FileUploadItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: FileUploadStatus;
  progress: number;
  remotePath?: string;
  error?: string;
}

export interface UploadAction {
  destination: string;
  resolvePath?: (destination: string, file: File) => string;
  endpoint?: string;
}

export type ValidationOptions = Pick<
  UseFileUploadOptions,
  "accept" | "maxSize" | "maxSizeMessage" | "validate"
>;

// ── Transport ──────────────────────────────────────────────────────────

export interface TransportPostOptions {
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
  headers?: Record<string, string>;
}

export interface TransportDeleteOptions {
  headers?: Record<string, string>;
}

export interface UploadTransport {
  post(
    url: string,
    file: File,
    options: TransportPostOptions
  ): Promise<{ path: string }>;

  delete(url: string, options?: TransportDeleteOptions): Promise<void>;
}

// ── Headers ────────────────────────────────────────────────────────────

export type HeadersOption =
  | Record<string, string>
  | (() => Record<string, string> | Promise<Record<string, string>>);

// ── Hook options ───────────────────────────────────────────────────────

export interface UseFileUploadOptions {
  multiple?: boolean;
  accept?: string[];
  maxSize?: number;
  maxSizeMessage?: string;
  validate?: (file: File) => string | null;
  transport?: UploadTransport;
  maxConcurrent?: number;
  headers?: HeadersOption;
  onFileSuccess?: (file: FileUploadItem) => void;
  onFileError?: (file: FileUploadItem, error: string) => void;
  /** When provided, files begin uploading immediately after selection. */
  autoUpload?: UploadAction;
}
