import {
  SCENE_SOURCE_METADATA,
  SCENE_SOURCE_TYPE,
  STREAM_METADATA,
  type SceneSource,
  type SceneSourceType,
  type StreamDescriptor,
  type StreamKind,
  type StreamId,
} from "../../../ir/index";

export const STREAM_CATEGORY = {
  ACTIONS: "actions",
  SENSORS: "sensors",
  ANNOTATIONS_PLANNING: "annotations-planning",
  INSTRUCTIONS: "instructions",
  OBSERVATIONS: "observations",
  TRANSFORMS_POSES: "transforms-poses",
  DIAGNOSTICS: "diagnostics",
  TELEMETRY: "telemetry",
  CUSTOM: "custom",
} as const;

export type StreamCategory =
  (typeof STREAM_CATEGORY)[keyof typeof STREAM_CATEGORY];

export const STREAM_CATEGORY_ORDER: readonly StreamCategory[] = [
  STREAM_CATEGORY.OBSERVATIONS,
  STREAM_CATEGORY.ACTIONS,
  STREAM_CATEGORY.INSTRUCTIONS,
  STREAM_CATEGORY.SENSORS,
  STREAM_CATEGORY.ANNOTATIONS_PLANNING,
  STREAM_CATEGORY.TRANSFORMS_POSES,
  STREAM_CATEGORY.DIAGNOSTICS,
  STREAM_CATEGORY.TELEMETRY,
  STREAM_CATEGORY.CUSTOM,
];

export const STREAM_CATEGORY_LABEL: Record<StreamCategory, string> = {
  [STREAM_CATEGORY.ACTIONS]: "Actions",
  [STREAM_CATEGORY.SENSORS]: "Sensors",
  [STREAM_CATEGORY.ANNOTATIONS_PLANNING]: "Annotations & Planning",
  [STREAM_CATEGORY.INSTRUCTIONS]: "Instructions",
  [STREAM_CATEGORY.OBSERVATIONS]: "Observations",
  [STREAM_CATEGORY.TRANSFORMS_POSES]: "Transforms & Poses",
  [STREAM_CATEGORY.DIAGNOSTICS]: "Diagnostics",
  [STREAM_CATEGORY.TELEMETRY]: "Telemetry",
  [STREAM_CATEGORY.CUSTOM]: "Custom / Unknown",
};

export const STREAM_CAPABILITY = {
  IMAGE: "image",
  LOGS: "logs",
  MAP: "map",
  PLOT: "plot",
  RAW: "raw",
  THREE_D: "three-d",
} as const;

export type StreamCapability =
  (typeof STREAM_CAPABILITY)[keyof typeof STREAM_CAPABILITY];

export const STREAM_CAPABILITY_LABEL: Record<StreamCapability, string> = {
  [STREAM_CAPABILITY.IMAGE]: "Image",
  [STREAM_CAPABILITY.LOGS]: "Logs",
  [STREAM_CAPABILITY.MAP]: "Map",
  [STREAM_CAPABILITY.PLOT]: "Plot",
  [STREAM_CAPABILITY.RAW]: "Raw",
  [STREAM_CAPABILITY.THREE_D]: "3D",
};

export type StreamSupportStatus =
  | "encoding-unsupported"
  | "inspectable"
  | "no-decoder"
  | "renderable"
  | "schema-unavailable";

export const STREAM_SUPPORT_LABEL: Record<StreamSupportStatus, string> = {
  "encoding-unsupported": "Encoding unsupported",
  inspectable: "Inspectable",
  "no-decoder": "No decoder",
  renderable: "Supported",
  "schema-unavailable": "Schema unavailable",
};

export interface StreamInventoryRow {
  readonly canInspect: boolean;
  readonly capabilities: readonly StreamCapability[];
  readonly category: StreamCategory;
  readonly countLabel: string | null;
  readonly encoding: string;
  readonly rateHz: number | null;
  readonly rateLabel: string | null;
  readonly recordCount: number | null;
  readonly kind: StreamKind;
  readonly schemaName: string;
  readonly sourceName: string;
  readonly sourceType: SceneSourceType | null;
  readonly streamId: StreamId;
  readonly supportStatus: StreamSupportStatus;
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
export function buildStreamInventoryRows({
  sceneSources,
  streams,
}: {
  readonly sceneSources: readonly SceneSource[];
  readonly streams: readonly StreamDescriptor[];
}): readonly StreamInventoryRow[] {
  const sceneSourceTypes = new Map(
    sceneSources.map((source) => [source.id, source.type]),
  );

  return streams
    .map((stream) => {
      const sourceName = sourceNameFor(stream);
      if (!sourceName) {
        return null;
      }

      const sourceType =
        knownSceneSourceType(stream.metadata?.[SCENE_SOURCE_METADATA.TYPE]) ??
        knownSceneSourceType(sceneSourceTypes.get(stream.id));
      const frameTransform = isFrameTransformStream(stream);
      const decodeStatus = genericDecodeStatus(
        stream.metadata?.[STREAM_METADATA.DECODE_STATUS],
      );
      const canInspect =
        stream.metadata?.[STREAM_METADATA.INSPECTABLE] === "true";
      const schemaName = schemaNameFor(stream);
      const telemetry = isTelemetrySchema(schemaName);
      const rateHz = messageRateHz(stream.approxRateHz);

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
          sourceName,
          sourceType,
          stream,
          telemetry,
        }),
        countLabel: countLabelFor(stream),
        encoding: encodingFor(stream),
        rateHz,
        rateLabel: messageRateLabel(rateHz),
        recordCount: recordCountFor(stream.count),
        kind: stream.kind,
        schemaName,
        sourceName,
        sourceType,
        streamId: stream.id,
        supportStatus: supportStatusFor({
          decodeStatus,
          frameTransform,
          sourceType,
        }),
      };
    })
    .filter((row): row is StreamInventoryRow => row !== null)
    .sort(compareStreamRows);
}

export function filterStreamInventoryRows(
  rows: readonly StreamInventoryRow[],
  search: string,
): readonly StreamInventoryRow[] {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return rows;
  }

  return rows.filter((row) =>
    [
      row.sourceName,
      row.schemaName,
      row.encoding,
      STREAM_CATEGORY_LABEL[row.category],
      STREAM_SUPPORT_LABEL[row.supportStatus],
      ...row.capabilities.map(
        (capability) => STREAM_CAPABILITY_LABEL[capability],
      ),
    ].some((value) => value.toLowerCase().includes(needle)),
  );
}

function countLabelFor(stream: StreamDescriptor): string | null {
  const count = recordCountFor(stream.count);
  if (count === null) return null;
  const noun =
    stream.metadata?.[STREAM_METADATA.COUNT_NOUN] ?? countNoun(stream.kind);
  return `${count.toLocaleString()} ${count === 1 ? singularNoun(noun) : noun}`;
}

function countNoun(kind: StreamKind): string {
  switch (kind) {
    case "image":
    case "video":
      return "frames";
    case "audio":
    case "scalar":
      return "samples";
    default:
      return "messages";
  }
}

function singularNoun(noun: string): string {
  if (noun === "messages") return "message";
  if (noun === "frames") return "frame";
  if (noun === "samples") return "sample";
  return noun;
}

function messageRateLabel(
  approximateRateHz: number | null | undefined,
): string | null {
  const rateHz = messageRateHz(approximateRateHz);
  if (rateHz === null) {
    return null;
  }
  if (rateHz > 0 && rateHz < 0.01) {
    return "<0.01 Hz";
  }
  return `${rateHz.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} Hz`;
}

function categoryForStream({
  frameTransform,
  sourceName,
  sourceType,
  stream,
  telemetry,
}: {
  readonly frameTransform: boolean;
  readonly sourceName: string;
  readonly sourceType: SceneSourceType | null;
  readonly stream: StreamDescriptor;
  readonly telemetry: boolean;
}): StreamCategory {
  const adapterCategory = stream.metadata?.[STREAM_METADATA.CATEGORY];
  if (
    adapterCategory &&
    Object.values(STREAM_CATEGORY).includes(adapterCategory as StreamCategory)
  ) {
    return adapterCategory as StreamCategory;
  }
  if (/(?:^|\/)imu(?:\/|$)/i.test(sourceName)) {
    return STREAM_CATEGORY.SENSORS;
  }
  if (sourceType === SCENE_SOURCE_TYPE.LOG) {
    return STREAM_CATEGORY.DIAGNOSTICS;
  }
  if (
    sourceType === SCENE_SOURCE_TYPE.IMAGE_ANNOTATION ||
    sourceType === SCENE_SOURCE_TYPE.SCENE_ANNOTATION
  ) {
    return STREAM_CATEGORY.ANNOTATIONS_PLANNING;
  }
  if (sourceType === SCENE_SOURCE_TYPE.POSE || frameTransform) {
    return STREAM_CATEGORY.TRANSFORMS_POSES;
  }
  if (sourceType !== null) {
    return STREAM_CATEGORY.SENSORS;
  }
  if (telemetry) {
    return STREAM_CATEGORY.TELEMETRY;
  }
  return STREAM_CATEGORY.CUSTOM;
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
}): readonly StreamCapability[] {
  const capabilities: StreamCapability[] = [];

  if (
    sourceType === SCENE_SOURCE_TYPE.IMAGE ||
    sourceType === SCENE_SOURCE_TYPE.IMAGE_ANNOTATION ||
    sourceType === SCENE_SOURCE_TYPE.CAMERA_CALIBRATION
  ) {
    capabilities.push(STREAM_CAPABILITY.IMAGE);
  }

  if (
    frameTransform ||
    sourceType === SCENE_SOURCE_TYPE.CAMERA_CALIBRATION ||
    sourceType === SCENE_SOURCE_TYPE.MAP_LAYER ||
    sourceType === SCENE_SOURCE_TYPE.POINT_CLOUD ||
    sourceType === SCENE_SOURCE_TYPE.POSE ||
    sourceType === SCENE_SOURCE_TYPE.SCENE_ANNOTATION
  ) {
    capabilities.push(STREAM_CAPABILITY.THREE_D);
  }

  if (sourceType === SCENE_SOURCE_TYPE.LOCATION) {
    capabilities.push(STREAM_CAPABILITY.MAP);
  }

  if (sourceType === SCENE_SOURCE_TYPE.LOG) {
    capabilities.push(STREAM_CAPABILITY.LOGS);
  }

  if (telemetry) {
    capabilities.push(STREAM_CAPABILITY.PLOT);
  }

  if (canInspect) {
    capabilities.push(STREAM_CAPABILITY.RAW);
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
}): StreamSupportStatus {
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
  left: StreamInventoryRow,
  right: StreamInventoryRow,
): number {
  const categoryDelta =
    STREAM_CATEGORY_ORDER.indexOf(left.category) -
    STREAM_CATEGORY_ORDER.indexOf(right.category);
  return categoryDelta || left.sourceName.localeCompare(right.sourceName);
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

function sourceNameFor(stream: StreamDescriptor): string {
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

function messageRateHz(
  approximateRateHz: number | null | undefined,
): number | null {
  if (
    approximateRateHz === null ||
    approximateRateHz === undefined ||
    !Number.isFinite(approximateRateHz) ||
    approximateRateHz < 0
  ) {
    return null;
  }
  return approximateRateHz === 0 ? 0 : approximateRateHz;
}

function knownSceneSourceType(
  type: string | undefined,
): SceneSourceType | null {
  return type !== undefined &&
    (Object.values(SCENE_SOURCE_TYPE) as readonly string[]).includes(type)
    ? (type as SceneSourceType)
    : null;
}
