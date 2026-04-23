import type { Scene3dFrame } from "./archetypes";
import {
  decodeCompressedImageInWorker,
  disposeCompressedImageWorkerClient,
} from "./compressed-image-worker-client";
import { decodeFoxgloveCompressedImagePayload } from "./foxglove-compressed-image-decoder";
import { decodeFoxgloveFrameTransformPayload } from "./foxglove-frame-transform-decoder";
import { decodeFoxglovePointCloudPayload } from "./foxglove-pointcloud-decoder";
import { decodeLaserScanPayload } from "./laserscan-decoder";
import { decodeMarkerArrayPayload } from "./markerarray-decoder";
import {
  decodePointCloud2InWorker,
  disposePointCloud2WorkerClient,
} from "./pointcloud2-worker-client";
import {
  decodeNavSatFixPayload,
  decodeOdometryPayload,
  decodePoseStampedPayload,
  decodePoseWithCovarianceStampedPayload,
  decodeTfMessagePayload,
  type DecodedNavSatFixSample,
  type DecodedPoseSample,
  type DecodedTransform,
} from "./ros-decoder";
import type { MultimodalRawMessage } from "./types";

export type DecodedLocationSample = DecodedPoseSample | DecodedNavSatFixSample;
export type DecodedImagePayload = {
  format: string;
  frameId: string;
  compressedBytes: Uint8Array;
};
export type DecodedScene3dPayload = {
  frame: Scene3dFrame;
};

type ImageCodec = {
  decode(message: MultimodalRawMessage): Promise<DecodedImagePayload>;
  dispose?: () => void;
};

type Scene3dCodec = {
  decode(message: MultimodalRawMessage): Promise<DecodedScene3dPayload>;
  dispose?: () => void;
};

type LocationCodec = {
  decode(payload: Uint8Array): DecodedLocationSample | null;
};

type TransformCodec = {
  decode(payload: Uint8Array): DecodedTransform[];
};

function copyPayloadBuffer(payload: Uint8Array) {
  return Uint8Array.from(payload).buffer;
}

class SchemaCodecRegistry {
  private readonly imageCodecs = new Map<string, ImageCodec>();
  private readonly scene3dCodecs = new Map<string, Scene3dCodec>();
  private readonly locationCodecs = new Map<string, LocationCodec>();
  private readonly transformCodecs = new Map<string, TransformCodec>();

  registerImage(schemaName: string, codec: ImageCodec) {
    this.imageCodecs.set(schemaName, codec);
  }

  registerScene3d(schemaName: string, codec: Scene3dCodec) {
    this.scene3dCodecs.set(schemaName, codec);
  }

  registerLocation(schemaName: string, codec: LocationCodec) {
    this.locationCodecs.set(schemaName, codec);
  }

  registerTransform(schemaName: string, codec: TransformCodec) {
    this.transformCodecs.set(schemaName, codec);
  }

  decodeImageMessage(schemaName: string, message: MultimodalRawMessage) {
    const codec = this.imageCodecs.get(schemaName);
    if (!codec) {
      throw new Error(`No image codec is registered for ${schemaName}`);
    }

    return codec.decode(message);
  }

  decodeScene3dMessage(schemaName: string, message: MultimodalRawMessage) {
    const codec = this.scene3dCodecs.get(schemaName);
    if (!codec) {
      throw new Error(`No 3D codec is registered for ${schemaName}`);
    }

    return codec.decode(message);
  }

  decodeLocationPayload(schemaName: string, payload: Uint8Array) {
    return this.locationCodecs.get(schemaName)?.decode(payload) ?? null;
  }

  decodeTransformPayload(schemaName: string, payload: Uint8Array) {
    return this.transformCodecs.get(schemaName)?.decode(payload) ?? [];
  }

  disposeImageResources(schemaName: string) {
    this.imageCodecs.get(schemaName)?.dispose?.();
  }

  disposeScene3dResources(schemaName: string) {
    this.scene3dCodecs.get(schemaName)?.dispose?.();
  }
}

function createBuiltinSchemaCodecRegistry() {
  const registry = new SchemaCodecRegistry();

  registry.registerImage("sensor_msgs/msg/CompressedImage", {
    async decode(message) {
      const decoded = await decodeCompressedImageInWorker({
        messageId: message.messageId,
        payload: copyPayloadBuffer(message.payload),
      });

      return {
        format: decoded.format,
        frameId: decoded.frameId,
        compressedBytes: decoded.compressedBytes,
      };
    },
    dispose: disposeCompressedImageWorkerClient,
  });
  registry.registerImage("foxglove.CompressedImage", {
    async decode(message) {
      const decoded = decodeFoxgloveCompressedImagePayload(message.payload);

      return {
        format: decoded.format,
        frameId: decoded.frameId,
        compressedBytes: decoded.compressedBytes,
      };
    },
  });

  registry.registerScene3d("sensor_msgs/msg/PointCloud2", {
    async decode(message) {
      const decoded = await decodePointCloud2InWorker({
        messageId: message.messageId,
        payload: copyPayloadBuffer(message.payload),
      });

      return {
        frame: decoded.frame,
      };
    },
    dispose: disposePointCloud2WorkerClient,
  });
  registry.registerScene3d("foxglove.PointCloud", {
    async decode(message) {
      const decoded = decodeFoxglovePointCloudPayload(message.payload);

      return {
        frame: decoded.frame,
      };
    },
  });
  registry.registerScene3d("sensor_msgs/msg/LaserScan", {
    async decode(message) {
      const decoded = await decodeLaserScanPayload(message.payload);
      return {
        frame: decoded.frame,
      };
    },
  });
  registry.registerScene3d("visualization_msgs/msg/MarkerArray", {
    async decode(message) {
      const decoded = await decodeMarkerArrayPayload(message.payload);
      return {
        frame: decoded.frame,
      };
    },
  });

  registry.registerLocation("nav_msgs/msg/Odometry", {
    decode(payload) {
      const decoded = decodeOdometryPayload(payload);
      return {
        frameId: decoded.frameId,
        position: decoded.position,
        orientation: decoded.orientation,
      };
    },
  });
  registry.registerLocation("geometry_msgs/msg/PoseStamped", {
    decode: decodePoseStampedPayload,
  });
  registry.registerLocation("geometry_msgs/msg/PoseWithCovarianceStamped", {
    decode: decodePoseWithCovarianceStampedPayload,
  });
  registry.registerLocation("sensor_msgs/msg/NavSatFix", {
    decode: decodeNavSatFixPayload,
  });

  registry.registerTransform("tf2_msgs/msg/TFMessage", {
    decode: decodeTfMessagePayload,
  });
  registry.registerTransform("foxglove.FrameTransform", {
    decode: decodeFoxgloveFrameTransformPayload,
  });

  return registry;
}

/** Built-in multimodal codec registry shared by the workspace runtime. */
export const BUILTIN_SCHEMA_CODEC_REGISTRY = createBuiltinSchemaCodecRegistry();
