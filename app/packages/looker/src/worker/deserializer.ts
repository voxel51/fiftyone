import { deserialize } from "../numpy";

export const DeserializerFactory = {
  Detection: (label, buffers) => {
    if (typeof label.mask === "string") {
      const data = deserialize(label.mask);
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
    labels.detections.forEach((label) =>
      DeserializerFactory[label._cls](label, buffers)
    );
  },
  Heatmap: (label, buffers) => {
    if (typeof label.map === "string") {
      const data = deserialize(label.map);
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
    if (typeof label.mask === "string") {
      const data = deserialize(label.mask);
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
