import { getFetchParameters, type Stage } from "@fiftyone/utilities";
import type { GetFramesRequest } from "../../../core/src/client/framesClient";
import {
  FrameBitmapStream,
  type FrameBitmap,
  type FrameBitmapStreamOptions,
} from "./frameBitmapStream";
import type { FrameReadyMessage } from "./frameWorkerProtocol";

/** Per-frame metadata the ImaVid `/frames` source carries. */
export interface ImaVidFrameMeta {
  src: string;
  /** Source media path of this frame's sample (drives the header filename). */
  filepath: string;
}

/**
 * What the ImaVid stream publishes per frame. Alias of the shared
 * {@link FrameBitmap} — kept for the tile's existing import.
 */
export type ImaVidImageFrame = FrameBitmap<ImaVidFrameMeta>;

export interface ImaVidImageStreamOptions extends FrameBitmapStreamOptions {
  /** Current dataset name (POST /frames requires it). */
  dataset: string;
  /** Active view stages — same shape sent on every dataset query. */
  view: Stage[];
  /** Group slice name, when the dataset is grouped. */
  groupSlice?: string | null;
  /**
   * Dynamic-group value, when the clip is a dynamic group rather than a video
   * sample. Routes `/frames` to that group's ordered samples (ImaVid for an
   * image dataset grouped into a video).
   */
  dynamicGroup?: string | null;
  /**
   * The dataset's modal media field (default `filepath`) — the field each
   * frame's media path is read from, and the value the header displays.
   */
  mediaField?: string;
}

/**
 * Image stream backed by `POST /frames` for ImaVid-style playback
 * (`to_frames(sample_frames=True)` data — one materialized image per frame).
 *
 * The JSON fetch and per-image fetch+decode both run inside a `framesWorker`
 * so the main thread never parses a `/frames` response or decodes an image;
 * the worker transfers `ImageBitmap`s back zero-copy. All the chunking / cache
 * / readiness machinery lives in {@link FrameBitmapStream}; this subclass only
 * supplies the `/frames` source.
 */
export class ImaVidImageStream extends FrameBitmapStream<ImaVidFrameMeta> {
  private readonly dataset: string;
  private readonly view: Stage[];
  private readonly groupSlice: string | null;
  private readonly dynamicGroup: string | null;
  private readonly mediaField: string;

  constructor(opts: ImaVidImageStreamOptions) {
    super(opts);
    this.dataset = opts.dataset;
    this.view = opts.view;
    this.groupSlice = opts.groupSlice ?? null;
    this.dynamicGroup = opts.dynamicGroup ?? null;
    this.mediaField = opts.mediaField ?? "filepath";
  }

  protected createWorker(): Worker {
    return new Worker(new URL("./framesWorker.ts", import.meta.url), {
      type: "module",
    });
  }

  protected postInit(worker: Worker): void {
    // Hand the worker the same fetch context the main thread uses. Normalize
    // HeadersInit → Record so it's structured-cloneable.
    const params = getFetchParameters();
    worker.postMessage({
      type: "init",
      origin: params.origin,
      pathPrefix: params.pathPrefix,
      headers: normalizeHeaders(params.headers),
    });
  }

  protected buildChunkRequest(
    startFrame: number,
    numFrames: number,
  ): GetFramesRequest {
    return {
      frameNumber: startFrame,
      numFrames,
      frameCount: this.frameCount,
      sampleId: this.sampleId,
      dataset: this.dataset,
      view: this.view,
      slice: this.groupSlice ?? undefined,
      dynamicGroup: this.dynamicGroup ?? undefined,
      // The image stream only needs each frame's media path; project to it so
      // `/frames` doesn't ship every label field per frame. An enterprise
      // server signs the named field's cloud path into `media_url`.
      fields: [this.mediaField],
      mediaField: this.mediaField,
    };
  }

  protected override toMeta(msg: FrameReadyMessage): ImaVidFrameMeta {
    const meta = msg.meta as Partial<ImaVidFrameMeta> | undefined;
    return { src: meta?.src ?? "", filepath: meta?.filepath ?? "" };
  }
}

function normalizeHeaders(
  headers: HeadersInit | undefined,
): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });

    return out;
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...(headers as Record<string, string>) };
}
