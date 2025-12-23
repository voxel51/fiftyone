import { DetectionLabel } from "@fiftyone/looker";

export const METADATA_FIELDS = [
  { name: "Size (bytes)", key: "size_bytes" },
  { name: "Type", key: "mime_type" },
  { name: "Media type", key: "_media_type" },
  {
    name: "Dimensions",
    value: (metadata) => {
      if (!isNaN(metadata.width) && !isNaN(metadata.height)) {
        return `${metadata.width} x ${metadata.height}`;
      }
    },
  },
  { name: "Channels", key: "num_channels" },
];

export const stringify = (value) => {
  if (typeof value == "number") {
    value = Number(value.toFixed(3));
  }
  return String(value);
};

export const formatMetadata = (metadata) => {
  if (!metadata) {
    return [];
  }
  return METADATA_FIELDS.map((field) => ({
    name: field.name,
    value: field.value ? field.value(metadata) : metadata[field.key],
  })).filter(({ value }) => value !== undefined);
};

/**
 * Checks if the label is a 3D detection with valid location and dimensions.
 * @param label - The label to check.
 * @returns True if the label is a 3D detection, false otherwise.
 */
export const isDetection3d = (label: DetectionLabel): boolean => {
  return (
    "location" in label &&
    Array.isArray(label["location"]) &&
    label["location"].length > 0 &&
    "dimensions" in label &&
    Array.isArray(label["dimensions"]) &&
    label["dimensions"].length > 0
  );
};
