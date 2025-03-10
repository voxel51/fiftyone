import { deserialize } from "../numpy";
import { RENDER_STATUS_DECODED } from "./shared";

const extractSerializedMask = (
  label: object,
  maskProp: string
): string | undefined => {
  if (typeof label?.[maskProp] === "string") {
    return label[maskProp];
  } else if (typeof label?.[maskProp]?.$binary?.base64 === "string") {
    return label[maskProp].$binary.base64;
  }

  return undefined;
};

export const DeserializerFactory = {
  Detection: (label, buffers) => {
    const serializedMask = extractSerializedMask(label, "mask");

    if (serializedMask) {
      const data = deserialize(serializedMask);
      const [height, width] = data.shape;
      label.mask = {
        data,
        image: new ArrayBuffer(width * height * 4),
      };
      buffers.push(data.buffer);
      label._renderStatus = RENDER_STATUS_DECODED;
    }
  },
  Detections: (labels, buffers) => {
    const list = labels?.detections || [];
    for (const label of list) {
      DeserializerFactory.Detection(label, buffers);
    }

    const allLabelsDecoded =
      list.length > 0 &&
      list.every((label) => label._renderStatus === RENDER_STATUS_DECODED);

    if (allLabelsDecoded) {
      labels._renderStatus = RENDER_STATUS_DECODED;
    }
  },
  Heatmap: (label, buffers) => {
    const serializedMask = extractSerializedMask(label, "map");

    if (serializedMask) {
      const data = deserialize(serializedMask);
      const [height, width] = data.shape;

      label.map = {
        data,
        image: new ArrayBuffer(width * height * 4),
      };

      buffers.push(data.buffer);
      label._renderStatus = RENDER_STATUS_DECODED;
    }
  },
  Segmentation: (label, buffers) => {
    const serializedMask = extractSerializedMask(label, "mask");

    if (serializedMask) {
      const data = deserialize(serializedMask);
      const [height, width] = data.shape;

      label.mask = {
        data,
        image: new ArrayBuffer(width * height * 4),
      };

      buffers.push(data.buffer);
      label._renderStatus = RENDER_STATUS_DECODED;
    }
  },
};
