export enum PointLabel {
  NEGATIVE = 0,
  POSITIVE = 1,
}

/** Coordinates: [0,1] normalized. */
export interface PromptPoint {
  x: number;
  y: number;
  label: PointLabel;
}

export interface InferenceRequest {
  imageUrl: string;
  points: PromptPoint[];
}

/** Coordinates: [0,1] normalized. */
export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface InferenceResult {
  /** Row-major mask values in [0,1], length = maskWidth * maskHeight. */
  mask: Float32Array;
  /** Pixel width of the cropped mask region. */
  maskWidth: number;
  /** Pixel height of the cropped mask region. */
  maskHeight: number;
  /** Bounding box in normalized [0,1] coordinates. */
  bbox: BoundingBox;
}

interface WorkerMessage<Req, Res> {
  request: Req;
  response: Res;
}

export interface DownloadProgress {
  file: "encoder" | "decoder";
  loaded: number;
  total: number;
}

/** Maps worker message types to their request/response payloads. */
export type WorkerMessages = {
  loadModel: WorkerMessage<Record<string, never>, void>;
  embedAndDecode: WorkerMessage<InferenceRequest, InferenceResult>;
};

/** One-way worker-to-main-thread notification payloads. */
export type WorkerNotifications = {
  status: ProviderStatus;
  progress: DownloadProgress;
  warning: string;
  error: ProviderError;
};

export type WorkerMessageType = keyof WorkerMessages;
export type WorkerRequest<T extends WorkerMessageType> = WorkerMessages[T]["request"];
export type WorkerResponse<T extends WorkerMessageType> = WorkerMessages[T]["response"];

/** Status events emitted during the provider lifecycle. */
export type ProviderStatus = "loading" | "encoding" | "ready" | "failure";

/** Typed error categories for structured error reporting. */
export type ProviderErrorKind =
  | "unsupported"
  | "download_failure"
  | "encoder_failure"
  | "decoder_failure"
  | "inference_failure";

export interface ProviderError {
  kind: ProviderErrorKind;
  message: string;
}

export type StatusCallback = (status: ProviderStatus) => void;
export type DownloadProgressCallback = (progress: DownloadProgress) => void;
export type WarningCallback = (message: string) => void;
export type ErrorCallback = (error: ProviderError) => void;

export interface AnnotationProvider {
  initialize(): Promise<void>;
  infer(request: InferenceRequest): Promise<InferenceResult>;
  abort(): void;
  dispose(): void;
}
