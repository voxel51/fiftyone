import { deserialize } from "../numpy";

export const DeserializerFactory = {
  Detection: (label, buffers) => {
    let serializedMask: string;
    if (typeof label?.mask === "string") {
      serializedMask = label.mask;
    } else if (typeof label?.mask?.$binary?.base64 === "string") {
      serializedMask = label.mask.$binary.base64;
    }

    if (serializedMask) {
      const data = deserialize(serializedMask);
      const [height, width] = data.shape;
      label.mask = {
        data,
        image: new ArrayBuffer(width * height * 4),
      };
      buffers.push(data.buffer);
      buffers.push(label.mask.image);
    }
  },
  Detections: (labels, buffers) => {
    const list = labels?.detections || [];
    for (const label of list) {
      DeserializerFactory.Detection(label, buffers);
    }
  },
  Heatmap: (label, buffers) => {
    let serializedMask: string;
    if (typeof label?.map === "string") {
      serializedMask = label.map;
    } else if (typeof label?.map?.$binary?.base64 === "string") {
      serializedMask = label.map.$binary.base64;
    }

    if (serializedMask) {
      const data = deserialize(serializedMask);
      const [height, width] = data.shape;

      label.map = {
        data,
        image: new ArrayBuffer(width * height * 4),
      };

      buffers.push(data.buffer);
      buffers.push(label.map.image);
    }
  },
  Segmentation: (label, buffers) => {
    let serializedMask: string;
    if (typeof label?.mask === "string") {
      serializedMask = label.mask;
    } else if (typeof label?.mask?.$binary?.base64 === "string") {
      serializedMask = label.mask.$binary.base64;
    }

    if (serializedMask) {
      const data = deserialize(serializedMask);
      const [height, width] = data.shape;

      label.mask = {
        data,
        image: new ArrayBuffer(width * height * 4),
      };

      buffers.push(data.buffer);
      buffers.push(label.mask.image);
    }
  },
};
