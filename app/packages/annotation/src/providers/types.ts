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

/** Maps worker message types to their request/response payloads. */
export type WorkerMessages = {
  loadModel: WorkerMessage<Record<string, never>, void>;
  embedAndDecode: WorkerMessage<InferenceRequest, InferenceResult>;
};

export type WorkerMessageType = keyof WorkerMessages;
export type WorkerRequest<T extends WorkerMessageType> = WorkerMessages[T]["request"];
export type WorkerResponse<T extends WorkerMessageType> = WorkerMessages[T]["response"];

export interface AnnotationProvider {
  initialize(): Promise<void>;
  infer(request: InferenceRequest): Promise<InferenceResult>;
  abort(): void;
  dispose(): void;
}
