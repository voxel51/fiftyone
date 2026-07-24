import {
  buildPointCloudRenderPayload,
  createPointCloudChannelArray,
} from "../../../ir/index";
import type {
  PointCloudRenderPayload,
  ImageVisualization,
  PointCloudVisualization,
} from "../../../ir/index";
import type { ByteSourceDescriptor } from "../../../query/bytes/index";
import type { StreamInventory } from "../../../schemas/v1/index";
import { VISUALIZATION_KIND } from "../../../ir/index";
import { filterDefaultStreamEquivalents } from "../../../stream-selection/index";
import { streamTopics, type McapPreviewTopics } from "./stream-topics";
import type {
  McapDecodedMessage,
  McapResourceClient,
  McapTimelineRange,
} from "../contracts/index";

const NEXT_FRAME_STEP_NS = 1n;
const NANOSECONDS_PER_MILLISECOND = 1_000_000;
const POINT_COMPONENT_COUNT = 3;
const COLOR_COMPONENT_COUNT = 3;

/** Maximum point count retained by one MCAP grid preview frame. */
export const MCAP_GRID_PREVIEW_MAX_POINTS = 120_000;

/** Re-exported stream classifier used by MCAP preview consumers. */
export { streamTopics } from "./stream-topics";

/** Maximum rendered frame rate for local and remote MCAP grid previews. */
export const MCAP_GRID_PREVIEW_MAX_FPS = 12;

const MCAP_GRID_PREVIEW_MIN_FRAME_DELAY_MS = 1_000 / MCAP_GRID_PREVIEW_MAX_FPS;

/**
 * Returns the remaining wall-clock delay before presenting an MCAP grid frame.
 * Returns `null` when the frame should be skipped to preserve 1x playback
 * without exceeding {@link MCAP_GRID_PREVIEW_MAX_FPS}.
 */
export function mcapGridPreviewPlaybackDelayMs(
  previousFrameTimeNs: undefined,
  frameTimeNs: undefined,
  elapsedMs?: number,
): number;
export function mcapGridPreviewPlaybackDelayMs(
  previousFrameTimeNs: bigint | undefined,
  frameTimeNs: bigint | undefined,
  elapsedMs?: number,
): number | null;
export function mcapGridPreviewPlaybackDelayMs(
  previousFrameTimeNs: bigint | undefined,
  frameTimeNs: bigint | undefined,
  elapsedMs = 0,
): number | null {
  const timelineDelayMs =
    previousFrameTimeNs !== undefined &&
    frameTimeNs !== undefined &&
    frameTimeNs > previousFrameTimeNs
      ? Number(frameTimeNs - previousFrameTimeNs) / NANOSECONDS_PER_MILLISECOND
      : 0;

  if (
    timelineDelayMs > 0 &&
    timelineDelayMs < MCAP_GRID_PREVIEW_MIN_FRAME_DELAY_MS
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.max(MCAP_GRID_PREVIEW_MIN_FRAME_DELAY_MS, timelineDelayMs) - elapsedMs,
  );
}

/**
 * Supported stream topic buckets used by grid preview selection.
 */
export type McapGridTopics = McapPreviewTopics;

/**
 * Selected camera image topic.
 */
export interface McapGridCameraSelection {
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
 * Render-ready image preview frame.
 */
export interface McapGridImagePreviewFrame {
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
  /** Full recording bounds, handed off on initial grid reads for overlays. */
  readonly bootstrapTimelineRange?: McapTimelineRange;
  /** Full source inventory, handed off on initial grid reads for modal reuse. */
  readonly bootstrapTopics?: readonly StreamInventory[];
  /** Timeline timestamp of the decoded frame, used for 1x hover playback. */
  readonly frameTimeNs?: bigint;
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
  timelineRange?: McapTimelineRange | null;
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
    const [inventory, timelineRange] = await Promise.all([
      entry.client.readTopics({ source }),
      readGridTimelineRange(entry.client, source),
    ]);
    entry.inventory = inventory;
    entry.timelineRange = timelineRange;
    entry.topics = streamTopics(entry.inventory);
  } else if (entry.timelineRange === undefined) {
    entry.timelineRange = await readGridTimelineRange(entry.client, source);
  }

  const topics = entry.topics;
  const bootstrapTimelineRange =
    startTimeNs === undefined ? (entry.timelineRange ?? undefined) : undefined;
  const bootstrapTopics =
    startTimeNs === undefined ? entry.inventory : undefined;
  const previewTopics = topics.previewable;
  const selection = chooseSelection(entry, topics, selectedStreamTopic);

  if (selectedStreamTopic && !selection) {
    return {
      bootstrapTimelineRange,
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
      bootstrapTimelineRange,
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
      bootstrapTimelineRange,
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
    bootstrapTimelineRange,
    bootstrapTopics,
    frameTimeNs: result.frameTimeNs,
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

async function readGridTimelineRange(
  client: McapResourceClient,
  source: ByteSourceDescriptor,
): Promise<McapTimelineRange | null> {
  try {
    return await client.readTimelineRange({ source });
  } catch {
    // A preview remains useful for unusual MCAPs without indexed bounds; the
    // temporal-tag overlay will fall back to its prior tag-derived domain.
    return null;
  }
}

function chooseSelection(
  entry: McapGridPreviewEntry,
  topics: McapGridTopics,
  selectedStreamTopic: string | null | undefined,
): McapGridPreviewSelection | null {
  if (selectedStreamTopic) {
    if (topics.image.includes(selectedStreamTopic)) {
      return {
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
 * Picks the first camera stream. Deterministic so a sample keeps the same
 * preview camera across renders.
 */
export function chooseCameraSelection(
  topics: McapGridTopics,
): McapGridCameraSelection | null {
  const imageTopic = filterDefaultStreamEquivalents(topics.image, {
    getKind: () => "image",
    getSourceName: (topic) => topic,
  })[0];
  if (!imageTopic) {
    return null;
  }

  return {
    kind: "image",
    streamTopic: imageTopic,
  };
}

function choosePointCloudSelection(
  topics: McapGridTopics,
): McapGridPointCloudSelection | null {
  const pointCloudTopic = filterDefaultStreamEquivalents(topics.pointCloud, {
    getKind: () => "point-cloud",
    getSourceName: (topic) => topic,
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
 * One decoded preview frame plus its timeline position.
 */
interface McapGridPreviewReadResult {
  readonly frame: McapGridPreviewFrame;
  readonly frameTimeNs: bigint;
  readonly nextStartTimeNs: bigint;
}

async function readNextPreviewFrame(
  request: ReadPreviewFrameRequest,
): Promise<McapGridPreviewReadResult | null> {
  if (request.selection.kind === "point-cloud") {
    return readNextPointCloudPreviewFrame(request);
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
    frame: { image, kind: "image" },
    frameTimeNs: imageMessage.timelineTimeNs,
    nextStartTimeNs: imageMessage.timelineTimeNs + NEXT_FRAME_STEP_NS,
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
    frame: { kind: "point-cloud", pointCloud },
    frameTimeNs: pointCloudMessage.timelineTimeNs,
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

function imageFrame(message: McapDecodedMessage): ImageVisualization | null {
  const visualization = message.decoded.output.visualization;
  return visualization?.kind === VISUALIZATION_KIND.ENCODED_IMAGE ||
    visualization?.kind === VISUALIZATION_KIND.ENCODED_VIDEO ||
    visualization?.kind === VISUALIZATION_KIND.RAW_IMAGE
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
  const sampledPointCount =
    frame.renderPayload?.sampledPointCount ?? frame.pointCount;
  if (sampledPointCount <= MCAP_GRID_PREVIEW_MAX_POINTS) {
    return frame;
  }
  const sourcePayload =
    frame.renderPayload ??
    buildPointCloudRenderPayload({
      colors: frame.colors,
      positions: frame.positions,
      scalarFields: frame.scalarFields,
    });
  const renderPayload = compactGridRenderPayload(sourcePayload);

  return {
    ...frame,
    pointCount: renderPayload.sampledPointCount,
    positions: renderPayload.positions,
    renderPayload,
    colors: undefined,
    scalarFields: undefined,
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
  const rgb = source.rgb
    ? {
        encoding: source.rgb.encoding,
        values: new Uint8Array(capacity * COLOR_COMPONENT_COUNT),
      }
    : undefined;
  const sourceIndices = new Uint32Array(capacity);
  const scalarFields = source.scalarFields.map((field) => ({
    ...field,
    values: createPointCloudChannelArray(field.encoding, capacity),
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
    if (rgb && source.rgb) {
      const targetColorOffset = targetIndex * COLOR_COMPONENT_COUNT;
      const sourceColorOffset = sourceIndex * COLOR_COMPONENT_COUNT;
      rgb.values[targetColorOffset] = source.rgb.values[sourceColorOffset];
      rgb.values[targetColorOffset + 1] =
        source.rgb.values[sourceColorOffset + 1];
      rgb.values[targetColorOffset + 2] =
        source.rgb.values[sourceColorOffset + 2];
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
    finitePointCount: source.finitePointCount,
    heightRange: source.heightRange,
    positions,
    ...(rgb ? { rgb } : {}),
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
