import type {
  EncodedImageVisualization,
  ImageAnnotationsVisualization,
  PointCloudVisualization,
} from "../../decoders";
import type { ByteSourceDescriptor } from "../../query/bytes";
import { PlaybackSyncMode } from "../../schemas/v1";
import { VISUALIZATION_KIND } from "../../visualization";
import { chooseAnnotationTopic } from "./topic-matching";
import { streamTopics, type McapPreviewTopics } from "./stream-topics";
import type {
  McapDecodedMessage,
  McapResourceClient,
  McapStreamSyncPolicy,
} from "./types";

const IMAGE_SYNC_TOLERANCE_NS = 120_000_000n;
const NEXT_FRAME_STEP_NS = 1n;

const IMAGE_SYNC_POLICY: McapStreamSyncPolicy = {
  mode: PlaybackSyncMode.NEAREST,
  toleranceAfterNs: IMAGE_SYNC_TOLERANCE_NS,
  toleranceBeforeNs: IMAGE_SYNC_TOLERANCE_NS,
} as const;

export { chooseAnnotationTopic } from "./topic-matching";
export { streamTopics } from "./stream-topics";

/**
 * Default playback speed for animated MCAP grid previews.
 */
export const DEFAULT_MCAP_GRID_PREVIEW_PLAYBACK_RATE = 1.5;

/**
 * Default cadence for image-only MCAP grid preview playback.
 */
export const MCAP_GRID_PREVIEW_IMAGE_FRAME_DELAY_MS = 83;

/**
 * Default cadence for point-cloud MCAP grid preview playback.
 */
export const MCAP_GRID_PREVIEW_POINT_CLOUD_FRAME_DELAY_MS = 83;

/**
 * Default cadence for annotated MCAP grid preview playback.
 */
export const MCAP_GRID_PREVIEW_ANNOTATION_FRAME_DELAY_MS = 500;

/**
 * Supported stream topic buckets used by grid preview selection.
 */
export type McapGridTopics = McapPreviewTopics;

/**
 * Selected camera image topic plus its best matching annotation topic.
 */
export interface McapGridCameraSelection {
  readonly annotationTopic: string | null;
  readonly kind: "image";
  readonly streamTopic: string;
}

/**
 * Selected point-cloud topic.
 */
export interface McapGridPointCloudSelection {
  readonly kind: "point-cloud";
  readonly streamTopic: string;
}

/**
 * Selected stream descriptor for one MCAP grid preview.
 */
export type McapGridPreviewSelection =
  | McapGridCameraSelection
  | McapGridPointCloudSelection;

/**
 * Render-ready image preview frame, optionally paired with annotations.
 */
export interface McapGridImagePreviewFrame {
  readonly annotations: ImageAnnotationsVisualization | null;
  readonly image: EncodedImageVisualization;
  readonly kind: "image";
}

/**
 * Render-ready point-cloud preview frame.
 */
export interface McapGridPointCloudPreviewFrame {
  readonly kind: "point-cloud";
  readonly pointCloud: PointCloudVisualization;
}

/**
 * Render-ready preview frame shown by the MCAP grid renderer.
 */
export type McapGridPreviewFrame =
  | McapGridImagePreviewFrame
  | McapGridPointCloudPreviewFrame;

/**
 * Status values used by the MCAP grid preview renderer.
 */
export type McapGridPreviewStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "unavailable"
  | "error";

/**
 * Render state for one lightweight MCAP stream preview in the grid.
 */
export interface McapGridPreviewSnapshot {
  readonly error: string | null;
  readonly frame: McapGridPreviewFrame | null;
  readonly hasPreviewTopics: boolean;
  readonly streamTopic: string | null;
  readonly streamTopics: readonly string[];
  readonly status: McapGridPreviewStatus;
}

/**
 * Result returned by the grid preview worker for one high-level request.
 */
export interface McapGridPreviewResult {
  readonly delayMs?: number;
  readonly nextStartTimeNs?: bigint;
  readonly state: McapGridPreviewSnapshot;
}

/**
 * Worker-side cache entry for one MCAP source preview.
 */
export interface McapGridPreviewEntry {
  readonly client: McapResourceClient;
  autoSelection?: McapGridPreviewSelection | null;
  topics?: McapGridTopics;
}

/**
 * High-level grid preview decode request handled inside the shared worker pool.
 */
export interface McapGridPreviewDecodeRequest {
  readonly selectedStreamTopic?: string | null;
  readonly source: ByteSourceDescriptor;
  readonly startTimeNs?: bigint;
}

/**
 * Ensures a cached source stream selection and reads one render-ready preview.
 */
export async function decodeGridPreview(
  entry: McapGridPreviewEntry,
  { selectedStreamTopic, source, startTimeNs }: McapGridPreviewDecodeRequest,
): Promise<McapGridPreviewResult> {
  if (entry.topics === undefined) {
    entry.topics = streamTopics(await entry.client.readTopics({ source }));
  }

  const topics = entry.topics;
  const previewTopics = topics.previewable;
  const selection = chooseSelection(entry, topics, selectedStreamTopic);

  if (selectedStreamTopic && !selection) {
    return {
      state: {
        error: null,
        frame: null,
        hasPreviewTopics: previewTopics.length > 0,
        streamTopic: selectedStreamTopic,
        streamTopics: previewTopics,
        status: "unavailable",
      },
    };
  }

  if (!selection) {
    return {
      state: {
        error: null,
        frame: null,
        hasPreviewTopics: false,
        streamTopic: null,
        streamTopics: previewTopics,
        status: "empty",
      },
    };
  }

  const result = await readNextPreviewFrame({
    client: entry.client,
    selection,
    source,
    startTimeNs,
  });

  if (!result) {
    return {
      state: {
        error: null,
        frame: null,
        hasPreviewTopics: true,
        streamTopic: selection.streamTopic,
        streamTopics: previewTopics,
        status: "empty",
      },
    };
  }

  return {
    delayMs: result.delayMs,
    nextStartTimeNs: result.nextStartTimeNs,
    state: {
      error: null,
      frame: result.frame,
      hasPreviewTopics: true,
      streamTopic: selection.streamTopic,
      streamTopics: previewTopics,
      status: "ready",
    },
  };
}

function chooseSelection(
  entry: McapGridPreviewEntry,
  topics: McapGridTopics,
  selectedStreamTopic: string | null | undefined,
): McapGridPreviewSelection | null {
  if (selectedStreamTopic) {
    if (topics.image.includes(selectedStreamTopic)) {
      return {
        annotationTopic: chooseAnnotationTopic(
          selectedStreamTopic,
          topics.annotations,
        ),
        kind: "image",
        streamTopic: selectedStreamTopic,
      };
    }

    if (topics.pointCloud.includes(selectedStreamTopic)) {
      return {
        kind: "point-cloud",
        streamTopic: selectedStreamTopic,
      };
    }

    return null;
  }

  if (entry.autoSelection === undefined) {
    entry.autoSelection = chooseAutoSelection(topics);
  }

  return entry.autoSelection;
}

function chooseAutoSelection(
  topics: McapGridTopics,
): McapGridPreviewSelection | null {
  return chooseCameraSelection(topics) ?? choosePointCloudSelection(topics);
}

/**
 * Picks the first camera stream and its best matching annotation topic.
 * Deterministic so a sample keeps the same preview camera across renders.
 */
export function chooseCameraSelection(
  topics: McapGridTopics,
): McapGridCameraSelection | null {
  const imageTopic = topics.image[0];
  if (!imageTopic) {
    return null;
  }

  return {
    annotationTopic: chooseAnnotationTopic(imageTopic, topics.annotations),
    kind: "image",
    streamTopic: imageTopic,
  };
}

function choosePointCloudSelection(
  topics: McapGridTopics,
): McapGridPointCloudSelection | null {
  const pointCloudTopic = topics.pointCloud[0];
  return pointCloudTopic
    ? {
        kind: "point-cloud",
        streamTopic: pointCloudTopic,
      }
    : null;
}

interface ReadPreviewFrameRequest {
  readonly client: McapResourceClient;
  readonly selection: McapGridPreviewSelection;
  readonly source: ByteSourceDescriptor;
  readonly startTimeNs?: bigint;
}

/**
 * One decoded preview frame plus playback timing for the next tick.
 */
interface McapGridPreviewReadResult {
  readonly delayMs: number;
  readonly frame: McapGridPreviewFrame;
  readonly nextStartTimeNs: bigint;
}

async function readNextPreviewFrame(
  request: ReadPreviewFrameRequest,
): Promise<McapGridPreviewReadResult | null> {
  if (request.selection.kind === "point-cloud") {
    return readNextPointCloudPreviewFrame(request);
  }

  if (request.selection.annotationTopic) {
    const annotatedFrame = await readNextAnnotatedPreviewFrame(request);
    if (annotatedFrame) {
      return annotatedFrame;
    }
  }

  return readNextImagePreviewFrame(request);
}

async function readNextImagePreviewFrame({
  client,
  selection,
  source,
  startTimeNs,
}: ReadPreviewFrameRequest): Promise<McapGridPreviewReadResult | null> {
  if (selection.kind !== "image") {
    return null;
  }

  const imageMessage = await readNextMessage({
    client,
    source,
    startTimeNs,
    topic: selection.streamTopic,
  });
  const image = imageMessage ? imageFrame(imageMessage) : null;

  if (!imageMessage || !image) {
    return null;
  }

  return {
    delayMs: MCAP_GRID_PREVIEW_IMAGE_FRAME_DELAY_MS,
    frame: { annotations: null, image, kind: "image" },
    nextStartTimeNs: imageMessage.timelineTimeNs + NEXT_FRAME_STEP_NS,
  };
}

async function readNextAnnotatedPreviewFrame({
  client,
  selection,
  source,
  startTimeNs,
}: ReadPreviewFrameRequest): Promise<McapGridPreviewReadResult | null> {
  if (selection.kind !== "image") {
    return null;
  }

  if (!selection.annotationTopic) {
    return null;
  }

  const annotationMessage = await readNextMessage({
    client,
    source,
    startTimeNs,
    topic: selection.annotationTopic,
  });
  const annotations = annotationMessage
    ? annotationsFrame(annotationMessage)
    : null;

  if (!annotationMessage || !annotations) {
    return null;
  }

  const image =
    (await readImageFrameNear({
      client,
      source,
      timeNs: annotationMessage.timelineTimeNs,
      topic: selection.streamTopic,
    })) ??
    (await readNextMessage({
      client,
      source,
      startTimeNs: annotationMessage.timelineTimeNs,
      topic: selection.streamTopic,
    }).then((message) => (message ? imageFrame(message) : null)));

  if (!image) {
    return null;
  }

  return {
    delayMs: MCAP_GRID_PREVIEW_ANNOTATION_FRAME_DELAY_MS,
    frame: { annotations, image, kind: "image" },
    nextStartTimeNs: annotationMessage.timelineTimeNs + NEXT_FRAME_STEP_NS,
  };
}

async function readNextPointCloudPreviewFrame({
  client,
  selection,
  source,
  startTimeNs,
}: ReadPreviewFrameRequest): Promise<McapGridPreviewReadResult | null> {
  if (selection.kind !== "point-cloud") {
    return null;
  }

  const pointCloudMessage = await readNextMessage({
    client,
    source,
    startTimeNs,
    topic: selection.streamTopic,
  });
  const pointCloud = pointCloudMessage
    ? pointCloudFrame(pointCloudMessage)
    : null;

  if (!pointCloudMessage || !pointCloud) {
    return null;
  }

  return {
    delayMs: MCAP_GRID_PREVIEW_POINT_CLOUD_FRAME_DELAY_MS,
    frame: { kind: "point-cloud", pointCloud },
    nextStartTimeNs: pointCloudMessage.timelineTimeNs + NEXT_FRAME_STEP_NS,
  };
}

async function readNextMessage({
  client,
  source,
  startTimeNs,
  topic,
}: {
  readonly client: McapResourceClient;
  readonly source: ByteSourceDescriptor;
  readonly startTimeNs?: bigint;
  readonly topic: string;
}): Promise<McapDecodedMessage | null> {
  for await (const message of client.readDecodedMessages({
    limit: 1,
    source,
    startTimeNs,
    topics: [topic],
  })) {
    return message;
  }

  return null;
}

async function readImageFrameNear({
  client,
  source,
  timeNs,
  topic,
}: {
  readonly client: McapResourceClient;
  readonly source: ByteSourceDescriptor;
  readonly timeNs: bigint;
  readonly topic: string;
}): Promise<EncodedImageVisualization | null> {
  const window = await client.readSynchronizedMessages({
    source,
    streamPolicies: {
      [topic]: IMAGE_SYNC_POLICY,
    },
    timeNs,
    topics: [topic],
  });
  const message = window.messagesByTopic[topic]?.[0];
  return message ? imageFrame(message) : null;
}

function imageFrame(
  message: McapDecodedMessage,
): EncodedImageVisualization | null {
  const visualization = message.decoded.output.visualization;
  return visualization?.kind === VISUALIZATION_KIND.ENCODED_IMAGE
    ? visualization
    : null;
}

function annotationsFrame(
  message: McapDecodedMessage,
): ImageAnnotationsVisualization | null {
  const visualization = message.decoded.output.visualization;
  return visualization?.kind === VISUALIZATION_KIND.IMAGE_ANNOTATIONS
    ? visualization
    : null;
}

function pointCloudFrame(
  message: McapDecodedMessage,
): PointCloudVisualization | null {
  const visualization = message.decoded.output.visualization;
  return visualization?.kind === VISUALIZATION_KIND.POINT_CLOUD
    ? visualization
    : null;
}
