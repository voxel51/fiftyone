import {
  buildPointCloudRenderPayload,
  type PointCloudRenderPayload,
  ImageVisualization,
  ImageAnnotationsVisualization,
  PointCloudVisualization,
} from "../../decoders";
import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceDescriptor,
} from "../../query/bytes";
import { PlaybackSyncMode, type StreamInventory } from "../../schemas/v1";
import { VISUALIZATION_KIND } from "../../visualization";
import {
  chooseAnnotationTopic,
  filterDefaultTopicEquivalents,
} from "./topic-matching";
import { streamTopics, type McapPreviewTopics } from "./stream-topics";
import type {
  McapDecodedMessage,
  McapResourceClient,
  McapStreamSyncPolicy,
} from "./types";

const IMAGE_SYNC_TOLERANCE_NS = 120_000_000n;
const NEXT_FRAME_STEP_NS = 1n;
const POINT_COMPONENT_COUNT = 3;
const COLOR_COMPONENT_COUNT = 3;

/** Maximum point count retained by one MCAP grid preview frame. */
export const MCAP_GRID_PREVIEW_MAX_POINTS = 120_000;

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
 * Reduced playback speed for remote MCAP grid previews. Remote playback is
 * intentionally bandwidth-first; users can still open the modal for the full
 * playback experience.
 */
export const REMOTE_MCAP_GRID_PREVIEW_PLAYBACK_RATE = 0.5;

/** Maximum request cadence for a remote MCAP grid preview. */
export const REMOTE_MCAP_GRID_PREVIEW_MIN_FRAME_DELAY_MS = 250;

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
 * Returns the wall-clock delay between grid-preview frame requests. Local and
 * unknown sources retain the existing cadence; explicitly remote sources use
 * a slower rate plus a four-requests-per-second ceiling.
 */
export function mcapGridPreviewPlaybackDelayMs(
  source: ByteSourceDescriptor,
  frameDelayMs = MCAP_GRID_PREVIEW_IMAGE_FRAME_DELAY_MS,
): number {
  if (source.readProfile === BYTE_SOURCE_READ_PROFILE.REMOTE) {
    return Math.max(
      REMOTE_MCAP_GRID_PREVIEW_MIN_FRAME_DELAY_MS,
      frameDelayMs / REMOTE_MCAP_GRID_PREVIEW_PLAYBACK_RATE,
    );
  }

  return Math.max(0, frameDelayMs / DEFAULT_MCAP_GRID_PREVIEW_PLAYBACK_RATE);
}

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
  readonly image: ImageVisualization;
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
  /** Full source inventory, handed off on initial grid reads for modal reuse. */
  readonly bootstrapTopics?: readonly StreamInventory[];
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
  inventory?: readonly StreamInventory[];
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
    entry.inventory = await entry.client.readTopics({ source });
    entry.topics = streamTopics(entry.inventory);
  }

  const topics = entry.topics;
  const bootstrapTopics =
    startTimeNs === undefined ? entry.inventory : undefined;
  const previewTopics = topics.previewable;
  const selection = chooseSelection(entry, topics, selectedStreamTopic);

  if (selectedStreamTopic && !selection) {
    return {
      bootstrapTopics,
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
      bootstrapTopics,
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
      bootstrapTopics,
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
    bootstrapTopics,
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
  const imageTopic = filterDefaultTopicEquivalents(topics.image, {
    getKind: () => "image",
    getTopic: (topic) => topic,
  })[0];
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
  const pointCloudTopic = filterDefaultTopicEquivalents(topics.pointCloud, {
    getKind: () => "point-cloud",
    getTopic: (topic) => topic,
  })[0];
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
}): Promise<ImageVisualization | null> {
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

function imageFrame(message: McapDecodedMessage): ImageVisualization | null {
  const visualization = message.decoded.output.visualization;
  return visualization?.kind === VISUALIZATION_KIND.ENCODED_IMAGE ||
    visualization?.kind === VISUALIZATION_KIND.ENCODED_VIDEO ||
    visualization?.kind === VISUALIZATION_KIND.RAW_IMAGE
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
  if (visualization?.kind !== VISUALIZATION_KIND.POINT_CLOUD) {
    return null;
  }

  return compactGridPointCloud(visualization);
}

/**
 * Returns the major retained binary allocation size for one grid frame.
 */
export function mcapGridPreviewFrameRetainedBytes(
  frame: McapGridPreviewFrame | null,
): number {
  if (!frame) {
    return 0;
  }

  const buffers = new Set<ArrayBufferLike>();
  collectArrayBuffers(frame, buffers, new Set<object>());
  let total = 0;
  for (const buffer of buffers) {
    total += buffer.byteLength;
  }
  return total;
}

function collectArrayBuffers(
  value: unknown,
  buffers: Set<ArrayBufferLike>,
  visited: Set<object>,
): void {
  if (ArrayBuffer.isView(value)) {
    buffers.add(value.buffer);
    return;
  }
  if (!value || typeof value !== "object" || visited.has(value)) {
    return;
  }

  visited.add(value);
  for (const child of Object.values(value)) {
    collectArrayBuffers(child, buffers, visited);
  }
}

function compactGridPointCloud(
  frame: PointCloudVisualization,
): PointCloudVisualization {
  const sourcePayload =
    frame.renderPayload ??
    buildPointCloudRenderPayload({
      colors: frame.colors,
      positions: frame.positions,
      scalarFields: frame.scalarFields,
    });
  const renderPayload = compactGridRenderPayload(sourcePayload);
  const scalarFields = renderPayload.scalarFields.map(({ name, values }) => ({
    name,
    values,
  }));

  return {
    ...frame,
    colors: renderPayload.colors,
    pointCount: renderPayload.sampledPointCount,
    positions: renderPayload.positions,
    renderPayload,
    scalarFields: scalarFields.length > 0 ? scalarFields : undefined,
  };
}

function compactGridRenderPayload(
  source: PointCloudRenderPayload,
): PointCloudRenderPayload {
  const sampledPointCount = Math.min(
    source.sampledPointCount,
    MCAP_GRID_PREVIEW_MAX_POINTS,
  );
  const capacity = Math.max(1, sampledPointCount);
  const positions = new Float32Array(capacity * POINT_COMPONENT_COUNT);
  const colors = source.colors
    ? new Float32Array(capacity * COLOR_COMPONENT_COUNT)
    : undefined;
  const sourceIndices = new Uint32Array(capacity);
  const scalarFields = source.scalarFields.map((field) => ({
    ...field,
    values: new Float32Array(capacity),
  }));

  for (let targetIndex = 0; targetIndex < sampledPointCount; targetIndex++) {
    const sourceIndex = evenlySampledIndex(
      targetIndex,
      sampledPointCount,
      source.sampledPointCount,
    );
    const targetOffset = targetIndex * POINT_COMPONENT_COUNT;
    const sourceOffset = sourceIndex * POINT_COMPONENT_COUNT;
    positions[targetOffset] = source.positions[sourceOffset];
    positions[targetOffset + 1] = source.positions[sourceOffset + 1];
    positions[targetOffset + 2] = source.positions[sourceOffset + 2];
    if (colors && source.colors) {
      const targetColorOffset = targetIndex * COLOR_COMPONENT_COUNT;
      const sourceColorOffset = sourceIndex * COLOR_COMPONENT_COUNT;
      colors[targetColorOffset] = source.colors[sourceColorOffset];
      colors[targetColorOffset + 1] = source.colors[sourceColorOffset + 1];
      colors[targetColorOffset + 2] = source.colors[sourceColorOffset + 2];
    }
    for (let fieldIndex = 0; fieldIndex < scalarFields.length; fieldIndex++) {
      scalarFields[fieldIndex].values[targetIndex] =
        source.scalarFields[fieldIndex].values[sourceIndex];
    }
    // The grid discards the full decoded arrays, so indices now address the
    // compact arrays instead of the worker's original message payload.
    sourceIndices[targetIndex] = targetIndex;
  }

  return {
    bounds: source.bounds,
    capacity,
    ...(colors ? { colors } : {}),
    finitePointCount: source.finitePointCount,
    heightRange: source.heightRange,
    positions,
    sampledPointCount,
    scalarFields,
    sourceIndices,
  };
}

function evenlySampledIndex(
  targetIndex: number,
  targetCount: number,
  sourceCount: number,
): number {
  if (targetCount <= 1 || sourceCount <= 1) {
    return 0;
  }
  return Math.floor((targetIndex * (sourceCount - 1)) / (targetCount - 1));
}
