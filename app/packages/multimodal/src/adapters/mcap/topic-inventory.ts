import type { SceneSource } from "../../scene-inventory";
import type { StreamInventory } from "../../schemas/v1";
import {
  MCAP_SOURCE_TYPE,
  mcapSourceTypeForTopic,
  type McapSourceType,
} from "./scene-sources";
import {
  isFrameTransformStream,
  isImageAnnotationsStream,
  isLogStream,
  isSceneUpdateStream,
  topicName,
} from "./stream-topics";

export const MCAP_TOPIC_CATEGORY = {
  SENSORS: "sensors",
  ANNOTATIONS_PLANNING: "annotations-planning",
  TRANSFORMS_POSES: "transforms-poses",
  DIAGNOSTICS: "diagnostics",
  TELEMETRY: "telemetry",
  CUSTOM: "custom",
} as const;

export type McapTopicCategory =
  (typeof MCAP_TOPIC_CATEGORY)[keyof typeof MCAP_TOPIC_CATEGORY];

export const MCAP_TOPIC_CATEGORY_ORDER: readonly McapTopicCategory[] = [
  MCAP_TOPIC_CATEGORY.SENSORS,
  MCAP_TOPIC_CATEGORY.ANNOTATIONS_PLANNING,
  MCAP_TOPIC_CATEGORY.TRANSFORMS_POSES,
  MCAP_TOPIC_CATEGORY.DIAGNOSTICS,
  MCAP_TOPIC_CATEGORY.TELEMETRY,
  MCAP_TOPIC_CATEGORY.CUSTOM,
];

export const MCAP_TOPIC_CATEGORY_LABEL: Record<McapTopicCategory, string> = {
  [MCAP_TOPIC_CATEGORY.SENSORS]: "Sensors",
  [MCAP_TOPIC_CATEGORY.ANNOTATIONS_PLANNING]: "Annotations & Planning",
  [MCAP_TOPIC_CATEGORY.TRANSFORMS_POSES]: "Transforms & Poses",
  [MCAP_TOPIC_CATEGORY.DIAGNOSTICS]: "Diagnostics",
  [MCAP_TOPIC_CATEGORY.TELEMETRY]: "Telemetry",
  [MCAP_TOPIC_CATEGORY.CUSTOM]: "Custom / Unknown",
};

export const MCAP_TOPIC_CAPABILITY = {
  IMAGE: "image",
  LOGS: "logs",
  PLOT: "plot",
  RAW: "raw",
  THREE_D: "three-d",
} as const;

export type McapTopicCapability =
  (typeof MCAP_TOPIC_CAPABILITY)[keyof typeof MCAP_TOPIC_CAPABILITY];

export const MCAP_TOPIC_CAPABILITY_LABEL: Record<McapTopicCapability, string> =
  {
    [MCAP_TOPIC_CAPABILITY.IMAGE]: "Image",
    [MCAP_TOPIC_CAPABILITY.LOGS]: "Logs",
    [MCAP_TOPIC_CAPABILITY.PLOT]: "Plot",
    [MCAP_TOPIC_CAPABILITY.RAW]: "Raw",
    [MCAP_TOPIC_CAPABILITY.THREE_D]: "3D",
  };

export type McapTopicSupportStatus =
  | "encoding-unsupported"
  | "inspectable"
  | "no-decoder"
  | "renderable"
  | "schema-unavailable";

export const MCAP_TOPIC_SUPPORT_LABEL: Record<McapTopicSupportStatus, string> =
  {
    "encoding-unsupported": "Encoding unsupported",
    inspectable: "Inspectable",
    "no-decoder": "No decoder",
    renderable: "Supported",
    "schema-unavailable": "Schema unavailable",
  };

export interface McapTopicInventoryRow {
  readonly canInspect: boolean;
  readonly capabilities: readonly McapTopicCapability[];
  readonly category: McapTopicCategory;
  readonly countLabel: string;
  readonly encoding: string;
  readonly recordCount: number | null;
  readonly schemaName: string;
  readonly sourceType: McapSourceType | null;
  readonly supportStatus: McapTopicSupportStatus;
  readonly topic: string;
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
 * Builds the customer-facing topic inventory for the MCAP sidebar. The result
 * is static and schema-derived: `renderable` means the adapter knows how the
 * topic participates in a panel, not that the topic is currently visible.
 */
export function buildMcapTopicInventoryRows({
  sceneSources,
  topics,
}: {
  readonly sceneSources: readonly SceneSource[];
  readonly topics: readonly StreamInventory[];
}): readonly McapTopicInventoryRow[] {
  const sceneSourceTypes = new Map(
    sceneSources.map((source) => [source.id, source.type]),
  );

  return topics
    .map((stream) => {
      const name = topicName(stream);
      if (!name) {
        return null;
      }

      const sourceType =
        mcapSourceTypeForTopic(stream) ??
        knownMcapSourceType(sceneSourceTypes.get(name));
      const frameTransform = isFrameTransformStream(stream);
      const decodeStatus = genericDecodeStatus(
        stream.metadata["mcap.generic_decode_status"],
      );
      const canInspect = decodeStatus === "decodable";
      const schemaName = schemaNameFor(stream);
      const telemetry = isTelemetrySchema(schemaName);

      return {
        canInspect,
        capabilities: capabilitiesForTopic({
          canInspect,
          frameTransform,
          sourceType,
          telemetry,
        }),
        category: categoryForTopic({
          frameTransform,
          sourceType,
          stream,
          telemetry,
          topic: name,
        }),
        countLabel: messageCountLabel(stream.recordCount),
        encoding: encodingFor(stream),
        recordCount: recordCountFor(stream.recordCount),
        schemaName,
        sourceType,
        supportStatus: supportStatusFor({
          decodeStatus,
          frameTransform,
          sourceType,
        }),
        topic: name,
      };
    })
    .filter((row): row is McapTopicInventoryRow => row !== null)
    .sort(compareTopicRows);
}

export function filterMcapTopicInventoryRows(
  rows: readonly McapTopicInventoryRow[],
  search: string,
): readonly McapTopicInventoryRow[] {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return rows;
  }

  return rows.filter((row) =>
    [
      row.topic,
      row.schemaName,
      row.encoding,
      MCAP_TOPIC_CATEGORY_LABEL[row.category],
      MCAP_TOPIC_SUPPORT_LABEL[row.supportStatus],
      ...row.capabilities.map(
        (capability) => MCAP_TOPIC_CAPABILITY_LABEL[capability],
      ),
    ].some((value) => value.toLowerCase().includes(needle)),
  );
}

export function messageCountLabel(recordCount: string | undefined): string {
  const count = recordCountFor(recordCount);
  if (count === null) {
    return "unknown msgs";
  }
  return `${count.toLocaleString()} ${count === 1 ? "msg" : "msgs"}`;
}

function categoryForTopic({
  frameTransform,
  sourceType,
  stream,
  telemetry,
  topic,
}: {
  readonly frameTransform: boolean;
  readonly sourceType: McapSourceType | null;
  readonly stream: StreamInventory;
  readonly telemetry: boolean;
  readonly topic: string;
}): McapTopicCategory {
  if (topic.toLowerCase().includes("imu")) {
    return MCAP_TOPIC_CATEGORY.SENSORS;
  }
  if (sourceType === MCAP_SOURCE_TYPE.LOG || isLogStream(stream)) {
    return MCAP_TOPIC_CATEGORY.DIAGNOSTICS;
  }
  if (
    sourceType === MCAP_SOURCE_TYPE.IMAGE_ANNOTATION ||
    sourceType === MCAP_SOURCE_TYPE.SCENE_ANNOTATION ||
    isImageAnnotationsStream(stream) ||
    isSceneUpdateStream(stream)
  ) {
    return MCAP_TOPIC_CATEGORY.ANNOTATIONS_PLANNING;
  }
  if (sourceType === MCAP_SOURCE_TYPE.POSE || frameTransform) {
    return MCAP_TOPIC_CATEGORY.TRANSFORMS_POSES;
  }
  if (sourceType !== null) {
    return MCAP_TOPIC_CATEGORY.SENSORS;
  }
  if (telemetry) {
    return MCAP_TOPIC_CATEGORY.TELEMETRY;
  }
  return MCAP_TOPIC_CATEGORY.CUSTOM;
}

function capabilitiesForTopic({
  canInspect,
  frameTransform,
  sourceType,
  telemetry,
}: {
  readonly canInspect: boolean;
  readonly frameTransform: boolean;
  readonly sourceType: McapSourceType | null;
  readonly telemetry: boolean;
}): readonly McapTopicCapability[] {
  const capabilities: McapTopicCapability[] = [];

  if (
    sourceType === MCAP_SOURCE_TYPE.IMAGE ||
    sourceType === MCAP_SOURCE_TYPE.IMAGE_ANNOTATION ||
    sourceType === MCAP_SOURCE_TYPE.CAMERA_CALIBRATION
  ) {
    capabilities.push(MCAP_TOPIC_CAPABILITY.IMAGE);
  }

  if (
    frameTransform ||
    sourceType === MCAP_SOURCE_TYPE.CAMERA_CALIBRATION ||
    sourceType === MCAP_SOURCE_TYPE.LOCATION ||
    sourceType === MCAP_SOURCE_TYPE.MAP_LAYER ||
    sourceType === MCAP_SOURCE_TYPE.POINT_CLOUD ||
    sourceType === MCAP_SOURCE_TYPE.POSE ||
    sourceType === MCAP_SOURCE_TYPE.SCENE_ANNOTATION
  ) {
    capabilities.push(MCAP_TOPIC_CAPABILITY.THREE_D);
  }

  if (sourceType === MCAP_SOURCE_TYPE.LOG) {
    capabilities.push(MCAP_TOPIC_CAPABILITY.LOGS);
  }

  if (telemetry) {
    capabilities.push(MCAP_TOPIC_CAPABILITY.PLOT);
  }

  if (canInspect) {
    capabilities.push(MCAP_TOPIC_CAPABILITY.RAW);
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
  readonly sourceType: McapSourceType | null;
}): McapTopicSupportStatus {
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

function compareTopicRows(
  left: McapTopicInventoryRow,
  right: McapTopicInventoryRow,
): number {
  const categoryDelta =
    MCAP_TOPIC_CATEGORY_ORDER.indexOf(left.category) -
    MCAP_TOPIC_CATEGORY_ORDER.indexOf(right.category);
  return categoryDelta || left.topic.localeCompare(right.topic);
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

function schemaNameFor(topic: StreamInventory): string {
  return (
    topic.metadata["mcap.schema_name"] ?? topic.payload?.schema ?? "no schema"
  );
}

function encodingFor(topic: StreamInventory): string {
  return (
    topic.metadata["mcap.message_encoding"] ??
    topic.payload?.encoding ??
    "unknown"
  );
}

function recordCountFor(recordCount: string | undefined): number | null {
  const count = recordCount === undefined ? Number.NaN : Number(recordCount);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

function knownMcapSourceType(type: string | undefined): McapSourceType | null {
  return type !== undefined &&
    (Object.values(MCAP_SOURCE_TYPE) as readonly string[]).includes(type)
    ? (type as McapSourceType)
    : null;
}
