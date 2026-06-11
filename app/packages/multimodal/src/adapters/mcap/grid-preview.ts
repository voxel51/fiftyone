import type {
  EncodedImageVisualization,
  ImageAnnotationsVisualization,
} from "../../decoders";
import type { ByteSourceDescriptor } from "../../query/bytes";
import { PlaybackSyncMode, type StreamInventory } from "../../schemas/v1";
import { VISUALIZATION_KIND } from "../../visualization";
import type {
  McapDecodedMessage,
  McapResourceClient,
  McapStreamSyncPolicy,
} from "./types";

// Note: we only support compressed image topics for preview now
const COMPRESSED_IMAGE_PATTERN = /compressedimage/i;
const IMAGE_ANNOTATIONS_PATTERN = /imageannotations/i;
const IMAGE_SYNC_TOLERANCE_NS = 120_000_000n;
const NEXT_FRAME_STEP_NS = 1n;

const IMAGE_SYNC_POLICY: McapStreamSyncPolicy = {
  mode: PlaybackSyncMode.NEAREST,
  toleranceAfterNs: IMAGE_SYNC_TOLERANCE_NS,
  toleranceBeforeNs: IMAGE_SYNC_TOLERANCE_NS,
} as const;

// Drop generic topic words before scoring image/annotation topic similarity so
// camera-identifying tokens like "front" or "left" decide the best match.
const IGNORED_TOPIC_TOKENS = new Set([
  "annotation",
  "annotations",
  "cam",
  "camera",
  "compressed",
  "image",
  "rect",
]);

// Strip image-format suffix segments when deriving the camera topic prefix, so
// "/camera/front/image_rect_compressed" pairs with "/camera/front/annotations".
const IMAGE_TOPIC_SUFFIX_TOKENS = new Set([
  "compressed",
  "compressedimage",
  "image",
  "raw",
  "rect",
]);

/**
 * Default playback speed for animated MCAP grid previews.
 */
export const DEFAULT_MCAP_GRID_PREVIEW_PLAYBACK_RATE = 1.5;

/**
 * Default cadence for image-only MCAP grid preview playback.
 */
export const MCAP_GRID_PREVIEW_IMAGE_FRAME_DELAY_MS = 83;

/**
 * Default cadence for annotated MCAP grid preview playback.
 */
export const MCAP_GRID_PREVIEW_ANNOTATION_FRAME_DELAY_MS = 500;

/**
 * Camera and annotation topic buckets used by grid preview selection.
 */
export interface McapGridTopics {
  readonly annotations: readonly string[];
  readonly image: readonly string[];
}

/**
 * Selected camera image topic plus its best matching annotation topic.
 */
export interface McapGridCameraSelection {
  readonly annotationTopic: string | null;
  readonly imageTopic: string;
}

/**
 * Render-ready image preview frame, optionally paired with annotations.
 */
export interface McapGridPreviewFrame {
  readonly annotations: ImageAnnotationsVisualization | null;
  readonly image: EncodedImageVisualization;
}

/**
 * Status values used by the MCAP grid preview renderer.
 */
export type McapGridPreviewStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error";

/**
 * Render state for one lightweight MCAP camera preview in the grid.
 */
export interface McapGridPreviewSnapshot {
  readonly error: string | null;
  readonly frame: McapGridPreviewFrame | null;
  readonly hasImageTopics: boolean;
  readonly imageTopic: string | null;
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
  selection?: McapGridCameraSelection | null;
}

/**
 * High-level grid preview decode request handled inside the shared worker pool.
 */
export interface McapGridPreviewDecodeRequest {
  readonly source: ByteSourceDescriptor;
  readonly startTimeNs?: bigint;
}

/**
 * Ensures a cached source camera selection and reads one render-ready preview.
 */
export async function decodeGridPreview(
  entry: McapGridPreviewEntry,
  { source, startTimeNs }: McapGridPreviewDecodeRequest
): Promise<McapGridPreviewResult> {
  if (entry.selection === undefined) {
    const topics = streamTopics(await entry.client.readTopics({ source }));
    entry.selection = chooseCameraSelection(topics);
  }

  const selection = entry.selection;
  if (!selection) {
    return {
      state: {
        error: null,
        frame: null,
        hasImageTopics: false,
        imageTopic: null,
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
        hasImageTopics: true,
        imageTopic: selection.imageTopic,
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
      hasImageTopics: true,
      imageTopic: selection.imageTopic,
      status: "ready",
    },
  };
}

/**
 * Picks the first camera stream and its best matching annotation topic.
 * Deterministic so a sample keeps the same preview camera across renders.
 */
export function chooseCameraSelection(
  topics: McapGridTopics
): McapGridCameraSelection | null {
  const imageTopic = topics.image[0];
  if (!imageTopic) {
    return null;
  }

  return {
    annotationTopic: chooseAnnotationTopic(imageTopic, topics.annotations),
    imageTopic,
  };
}

interface ReadPreviewFrameRequest {
  readonly client: McapResourceClient;
  readonly selection: McapGridCameraSelection;
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
  request: ReadPreviewFrameRequest
): Promise<McapGridPreviewReadResult | null> {
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
  const imageMessage = await readNextMessage({
    client,
    source,
    startTimeNs,
    topic: selection.imageTopic,
  });
  const image = imageMessage ? imageFrame(imageMessage) : null;

  if (!imageMessage || !image) {
    return null;
  }

  return {
    delayMs: MCAP_GRID_PREVIEW_IMAGE_FRAME_DELAY_MS,
    frame: { annotations: null, image },
    nextStartTimeNs: imageMessage.timelineTimeNs + NEXT_FRAME_STEP_NS,
  };
}

async function readNextAnnotatedPreviewFrame({
  client,
  selection,
  source,
  startTimeNs,
}: ReadPreviewFrameRequest): Promise<McapGridPreviewReadResult | null> {
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
      topic: selection.imageTopic,
    })) ??
    (await readNextMessage({
      client,
      source,
      startTimeNs: annotationMessage.timelineTimeNs,
      topic: selection.imageTopic,
    }).then((message) => (message ? imageFrame(message) : null)));

  if (!image) {
    return null;
  }

  return {
    delayMs: MCAP_GRID_PREVIEW_ANNOTATION_FRAME_DELAY_MS,
    frame: { annotations, image },
    nextStartTimeNs: annotationMessage.timelineTimeNs + NEXT_FRAME_STEP_NS,
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
  message: McapDecodedMessage
): EncodedImageVisualization | null {
  const visualization = message.decoded.output.visualization;
  return visualization?.kind === VISUALIZATION_KIND.ENCODED_IMAGE
    ? visualization
    : null;
}

function annotationsFrame(
  message: McapDecodedMessage
): ImageAnnotationsVisualization | null {
  const visualization = message.decoded.output.visualization;
  return visualization?.kind === VISUALIZATION_KIND.IMAGE_ANNOTATIONS
    ? visualization
    : null;
}

/**
 * Splits stream inventory into image and annotation topics.
 */
export function streamTopics(
  topics: readonly StreamInventory[]
): McapGridTopics {
  const image: string[] = [];
  const annotations: string[] = [];

  for (const topic of topics) {
    const name = topicName(topic);
    if (!name) {
      continue;
    }

    if (isCompressedImageStream(topic)) {
      image.push(name);
    } else if (isImageAnnotationsStream(topic)) {
      annotations.push(name);
    }
  }

  return { annotations, image };
}

function topicName(topic: StreamInventory): string {
  return topic.metadata["mcap.topic"] ?? topic.displayName ?? "";
}

function schemaIdentity(topic: StreamInventory): string {
  return [topic.payload?.schema, topic.metadata["mcap.schema_name"]].join(" ");
}

function isCompressedImageStream(topic: StreamInventory): boolean {
  if (COMPRESSED_IMAGE_PATTERN.test(schemaIdentity(topic))) {
    return true;
  }

  return false;
}

function isImageAnnotationsStream(topic: StreamInventory): boolean {
  const identity = schemaIdentity(topic);
  if (IMAGE_ANNOTATIONS_PATTERN.test(identity)) {
    return true;
  }

  return false;
}

/**
 * Chooses the annotation topic that best matches a selected camera topic.
 * Prefers the exact `<camera prefix>/annotations` sibling, then falls back
 * to the highest shared-token score.
 */
export function chooseAnnotationTopic(
  imageTopic: string,
  annotationTopics: readonly string[]
): string | null {
  if (annotationTopics.length === 0) {
    return null;
  }

  const cameraPrefix = topicPrefix(imageTopic);
  const exactTopic = cameraPrefix ? `${cameraPrefix}/annotations` : "";
  const exact = annotationTopics.find((topic) => topic === exactTopic);
  if (exact) {
    return exact;
  }

  let bestTopic: string | null = null;
  let bestScore = 0;
  const imageTokens = topicTokens(imageTopic);

  for (const annotationTopic of annotationTopics) {
    const annotationTokens = topicTokens(annotationTopic);
    let score =
      cameraPrefix && isTopicAtOrBelowPrefix(annotationTopic, cameraPrefix)
        ? 10
        : 0;
    for (const token of imageTokens) {
      if (annotationTokens.has(token)) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestTopic = annotationTopic;
    }
  }

  return bestTopic;
}

function topicPrefix(topic: string): string {
  const normalized = topic.replace(/\/+$/, "");
  const hasLeadingSlash = normalized.startsWith("/");
  const parts = normalized.split("/").filter(Boolean);

  while (parts.length > 0 && isImageTopicSuffix(parts[parts.length - 1])) {
    parts.pop();
  }

  return parts.length > 0
    ? `${hasLeadingSlash ? "/" : ""}${parts.join("/")}`
    : "";
}

function isTopicAtOrBelowPrefix(topic: string, prefix: string): boolean {
  return topic === prefix || topic.startsWith(`${prefix}/`);
}

function isImageTopicSuffix(segment: string): boolean {
  const tokens = segment
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  return (
    tokens.length > 0 &&
    tokens.every((token) => IMAGE_TOPIC_SUFFIX_TOKENS.has(token))
  );
}

function topicTokens(topic: string): Set<string> {
  return new Set(
    topic
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token && !IGNORED_TOPIC_TOKENS.has(token))
  );
}
