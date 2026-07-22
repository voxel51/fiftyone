import {
  SCENE_SOURCE_METADATA,
  SCENE_SOURCE_TYPE,
  STREAM_METADATA,
  type SceneSource,
  type SceneSourceType,
  type StreamDescriptor,
} from "../../../ir/index";

export const EPISODE_STREAM_CATEGORY = {
  SENSORS: "sensors",
  ANNOTATIONS_PLANNING: "annotations-planning",
  TRANSFORMS_POSES: "transforms-poses",
  DIAGNOSTICS: "diagnostics",
  TELEMETRY: "telemetry",
  CUSTOM: "custom",
} as const;

export type EpisodeStreamCategory =
  (typeof EPISODE_STREAM_CATEGORY)[keyof typeof EPISODE_STREAM_CATEGORY];

export const EPISODE_STREAM_CATEGORY_ORDER: readonly EpisodeStreamCategory[] = [
  EPISODE_STREAM_CATEGORY.SENSORS,
  EPISODE_STREAM_CATEGORY.ANNOTATIONS_PLANNING,
  EPISODE_STREAM_CATEGORY.TRANSFORMS_POSES,
  EPISODE_STREAM_CATEGORY.DIAGNOSTICS,
  EPISODE_STREAM_CATEGORY.TELEMETRY,
  EPISODE_STREAM_CATEGORY.CUSTOM,
];

export const EPISODE_STREAM_CATEGORY_LABEL: Record<
  EpisodeStreamCategory,
  string
> = {
  [EPISODE_STREAM_CATEGORY.SENSORS]: "Sensors",
  [EPISODE_STREAM_CATEGORY.ANNOTATIONS_PLANNING]: "Annotations & Planning",
  [EPISODE_STREAM_CATEGORY.TRANSFORMS_POSES]: "Transforms & Poses",
  [EPISODE_STREAM_CATEGORY.DIAGNOSTICS]: "Diagnostics",
  [EPISODE_STREAM_CATEGORY.TELEMETRY]: "Telemetry",
  [EPISODE_STREAM_CATEGORY.CUSTOM]: "Custom / Unknown",
};

export const EPISODE_STREAM_CAPABILITY = {
  IMAGE: "image",
  LOGS: "logs",
  MAP: "map",
  PLOT: "plot",
  RAW: "raw",
  THREE_D: "three-d",
} as const;

export type EpisodeStreamCapability =
  (typeof EPISODE_STREAM_CAPABILITY)[keyof typeof EPISODE_STREAM_CAPABILITY];

export const EPISODE_STREAM_CAPABILITY_LABEL: Record<
  EpisodeStreamCapability,
  string
> = {
  [EPISODE_STREAM_CAPABILITY.IMAGE]: "Image",
  [EPISODE_STREAM_CAPABILITY.LOGS]: "Logs",
  [EPISODE_STREAM_CAPABILITY.MAP]: "Map",
  [EPISODE_STREAM_CAPABILITY.PLOT]: "Plot",
  [EPISODE_STREAM_CAPABILITY.RAW]: "Raw",
  [EPISODE_STREAM_CAPABILITY.THREE_D]: "3D",
};

export type EpisodeStreamSupportStatus =
  | "encoding-unsupported"
  | "inspectable"
  | "no-decoder"
  | "renderable"
  | "schema-unavailable";

export const EPISODE_STREAM_SUPPORT_LABEL: Record<
  EpisodeStreamSupportStatus,
  string
> = {
  "encoding-unsupported": "Encoding unsupported",
  inspectable: "Inspectable",
  "no-decoder": "No decoder",
  renderable: "Supported",
  "schema-unavailable": "Schema unavailable",
};

export interface EpisodeStreamInventoryRow {
  readonly canInspect: boolean;
  readonly capabilities: readonly EpisodeStreamCapability[];
  readonly category: EpisodeStreamCategory;
  readonly countLabel: string;
  readonly encoding: string;
  readonly recordCount: number | null;
  readonly schemaName: string;
  readonly sourceType: SceneSourceType | null;
  readonly supportStatus: EpisodeStreamSupportStatus;
  readonly stream: string;
}

type GenericDecodeStatus =
  | "decodable"
  | "schema-unavailable"
  | "unsupported-encoding"
  | "unknown";

const TELEMETRY_SCHEMAS: ReadonlySet<string> = new Set([
  "ackermann_msgs/AckermannDrive",
  "ackermann_msgs/AckermannDriveStamped",
  "ackermann_msgs/msg/AckermannDrive",
  "ackermann_msgs/msg/AckermannDriveStamped",
  "geometry_msgs/Twist",
  "geometry_msgs/TwistStamped",
  "geometry_msgs/msg/Twist",
  "geometry_msgs/msg/TwistStamped",
  "sensor_msgs/BatteryState",
  "sensor_msgs/FluidPressure",
  "sensor_msgs/Imu",
  "sensor_msgs/JointState",
  "sensor_msgs/MagneticField",
  "sensor_msgs/Temperature",
  "sensor_msgs/msg/BatteryState",
  "sensor_msgs/msg/FluidPressure",
  "sensor_msgs/msg/Imu",
  "sensor_msgs/msg/JointState",
  "sensor_msgs/msg/MagneticField",
  "sensor_msgs/msg/Temperature",
]);

/**
 * Builds the customer-facing stream inventory for the episode sidebar. The result
 * is static and schema-derived: `renderable` means the adapter knows how the
 * stream participates in a panel, not that the stream is currently visible.
 */
export function buildEpisodeStreamInventoryRows({
  sceneSources,
  streams,
}: {
  readonly sceneSources: readonly SceneSource[];
  readonly streams: readonly StreamDescriptor[];
}): readonly EpisodeStreamInventoryRow[] {
  const sceneSourceTypes = new Map(
    sceneSources.map((source) => [source.id, source.type]),
  );

  return streams
    .map((stream) => {
      const name = streamName(stream);
      if (!name) {
        return null;
      }

      const sourceType =
        knownSceneSourceType(stream.metadata?.[SCENE_SOURCE_METADATA.TYPE]) ??
        knownSceneSourceType(sceneSourceTypes.get(name));
      const frameTransform = isFrameTransformStream(stream);
      const decodeStatus = genericDecodeStatus(
        stream.metadata?.[STREAM_METADATA.DECODE_STATUS],
      );
      const canInspect = decodeStatus === "decodable";
      const schemaName = schemaNameFor(stream);
      const telemetry = isTelemetrySchema(schemaName);

      return {
        canInspect,
        capabilities: capabilitiesForStream({
          canInspect,
          frameTransform,
          sourceType,
          telemetry,
        }),
        category: categoryForStream({
          frameTransform,
          sourceType,
          telemetry,
          stream: name,
        }),
        countLabel: messageCountLabel(stream.count),
        encoding: encodingFor(stream),
        recordCount: recordCountFor(stream.count),
        schemaName,
        sourceType,
        supportStatus: supportStatusFor({
          decodeStatus,
          frameTransform,
          sourceType,
        }),
        stream: name,
      };
    })
    .filter((row): row is EpisodeStreamInventoryRow => row !== null)
    .sort(compareStreamRows);
}

export function filterEpisodeStreamInventoryRows(
  rows: readonly EpisodeStreamInventoryRow[],
  search: string,
): readonly EpisodeStreamInventoryRow[] {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return rows;
  }

  return rows.filter((row) =>
    [
      row.stream,
      row.schemaName,
      row.encoding,
      EPISODE_STREAM_CATEGORY_LABEL[row.category],
      EPISODE_STREAM_SUPPORT_LABEL[row.supportStatus],
      ...row.capabilities.map(
        (capability) => EPISODE_STREAM_CAPABILITY_LABEL[capability],
      ),
    ].some((value) => value.toLowerCase().includes(needle)),
  );
}

export function messageCountLabel(recordCount: number | undefined): string {
  const count = recordCountFor(recordCount);
  if (count === null) {
    return "unknown msgs";
  }
  return `${count.toLocaleString()} ${count === 1 ? "msg" : "msgs"}`;
}

function categoryForStream({
  frameTransform,
  sourceType,
  telemetry,
  stream,
}: {
  readonly frameTransform: boolean;
  readonly sourceType: SceneSourceType | null;
  readonly telemetry: boolean;
  readonly stream: string;
}): EpisodeStreamCategory {
  if (/(?:^|\/)imu(?:\/|$)/i.test(stream)) {
    return EPISODE_STREAM_CATEGORY.SENSORS;
  }
  if (sourceType === SCENE_SOURCE_TYPE.LOG) {
    return EPISODE_STREAM_CATEGORY.DIAGNOSTICS;
  }
  if (
    sourceType === SCENE_SOURCE_TYPE.IMAGE_ANNOTATION ||
    sourceType === SCENE_SOURCE_TYPE.SCENE_ANNOTATION
  ) {
    return EPISODE_STREAM_CATEGORY.ANNOTATIONS_PLANNING;
  }
  if (sourceType === SCENE_SOURCE_TYPE.POSE || frameTransform) {
    return EPISODE_STREAM_CATEGORY.TRANSFORMS_POSES;
  }
  if (sourceType !== null) {
    return EPISODE_STREAM_CATEGORY.SENSORS;
  }
  if (telemetry) {
    return EPISODE_STREAM_CATEGORY.TELEMETRY;
  }
  return EPISODE_STREAM_CATEGORY.CUSTOM;
}

function capabilitiesForStream({
  canInspect,
  frameTransform,
  sourceType,
  telemetry,
}: {
  readonly canInspect: boolean;
  readonly frameTransform: boolean;
  readonly sourceType: SceneSourceType | null;
  readonly telemetry: boolean;
}): readonly EpisodeStreamCapability[] {
  const capabilities: EpisodeStreamCapability[] = [];

  if (
    sourceType === SCENE_SOURCE_TYPE.IMAGE ||
    sourceType === SCENE_SOURCE_TYPE.IMAGE_ANNOTATION ||
    sourceType === SCENE_SOURCE_TYPE.CAMERA_CALIBRATION
  ) {
    capabilities.push(EPISODE_STREAM_CAPABILITY.IMAGE);
  }

  if (
    frameTransform ||
    sourceType === SCENE_SOURCE_TYPE.CAMERA_CALIBRATION ||
    sourceType === SCENE_SOURCE_TYPE.MAP_LAYER ||
    sourceType === SCENE_SOURCE_TYPE.POINT_CLOUD ||
    sourceType === SCENE_SOURCE_TYPE.POSE ||
    sourceType === SCENE_SOURCE_TYPE.SCENE_ANNOTATION
  ) {
    capabilities.push(EPISODE_STREAM_CAPABILITY.THREE_D);
  }

  if (sourceType === SCENE_SOURCE_TYPE.LOCATION) {
    capabilities.push(EPISODE_STREAM_CAPABILITY.MAP);
  }

  if (sourceType === SCENE_SOURCE_TYPE.LOG) {
    capabilities.push(EPISODE_STREAM_CAPABILITY.LOGS);
  }

  if (telemetry) {
    capabilities.push(EPISODE_STREAM_CAPABILITY.PLOT);
  }

  if (canInspect) {
    capabilities.push(EPISODE_STREAM_CAPABILITY.RAW);
  }

  return Array.from(new Set(capabilities));
}

function supportStatusFor({
  decodeStatus,
  frameTransform,
  sourceType,
}: {
  readonly decodeStatus: GenericDecodeStatus;
  readonly frameTransform: boolean;
  readonly sourceType: SceneSourceType | null;
}): EpisodeStreamSupportStatus {
  if (sourceType !== null || frameTransform) {
    return "renderable";
  }
  if (decodeStatus === "decodable") {
    return "inspectable";
  }
  if (decodeStatus === "schema-unavailable") {
    return "schema-unavailable";
  }
  if (decodeStatus === "unsupported-encoding") {
    return "encoding-unsupported";
  }
  return "no-decoder";
}

function compareStreamRows(
  left: EpisodeStreamInventoryRow,
  right: EpisodeStreamInventoryRow,
): number {
  const categoryDelta =
    EPISODE_STREAM_CATEGORY_ORDER.indexOf(left.category) -
    EPISODE_STREAM_CATEGORY_ORDER.indexOf(right.category);
  return categoryDelta || left.stream.localeCompare(right.stream);
}

function isTelemetrySchema(schemaName: string): boolean {
  return TELEMETRY_SCHEMAS.has(schemaName);
}

function genericDecodeStatus(status: string | undefined): GenericDecodeStatus {
  switch (status) {
    case "decodable":
    case "schema-unavailable":
    case "unsupported-encoding":
      return status;
    default:
      return "unknown";
  }
}

function schemaNameFor(stream: StreamDescriptor): string {
  return (
    stream.metadata?.[STREAM_METADATA.SCHEMA_NAME] ??
    stream.payload.schema ??
    "no schema"
  );
}

function encodingFor(stream: StreamDescriptor): string {
  return (
    stream.metadata?.[STREAM_METADATA.ENCODING] ??
    stream.payload.encoding ??
    "unknown"
  );
}

function streamName(stream: StreamDescriptor): string {
  return (
    stream.metadata?.[SCENE_SOURCE_METADATA.SOURCE_NAME] ??
    stream.sourceName ??
    stream.id
  );
}

function isFrameTransformStream(stream: StreamDescriptor): boolean {
  const identity = `${stream.payload.schema ?? ""} ${stream.payload.encoding}`;
  return /(?:^|[./_])(?:tf2?_msgs|transform(?:stamped|s)?)(?:$|[./_])/i.test(
    identity,
  );
}

function recordCountFor(recordCount: number | undefined): number | null {
  return recordCount !== undefined &&
    Number.isFinite(recordCount) &&
    recordCount >= 0
    ? recordCount
    : null;
}

function knownSceneSourceType(
  type: string | undefined,
): SceneSourceType | null {
  return type !== undefined &&
    (Object.values(SCENE_SOURCE_TYPE) as readonly string[]).includes(type)
    ? (type as SceneSourceType)
    : null;
}
