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
  mask: Float32Array;
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
  progress: DownloadProgress;
  warning: string;
};

export type WorkerMessageType = keyof WorkerMessages;
export type WorkerRequest<T extends WorkerMessageType> = WorkerMessages[T]["request"];
export type WorkerResponse<T extends WorkerMessageType> = WorkerMessages[T]["response"];

export type DownloadProgressCallback = (progress: DownloadProgress) => void;
export type WarningCallback = (message: string) => void;

export interface AnnotationProvider {
  initialize(onProgress?: DownloadProgressCallback, onWarning?: WarningCallback): Promise<void>;
  infer(request: InferenceRequest): Promise<InferenceResult>;
  abort(): void;
  dispose(): void;
}