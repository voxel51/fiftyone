import type {
  DecodeContext,
  PointCloudChannelProjectionRequest,
} from "../../../../decoders/index";
import type {
  DecodedOutput,
  PointCloudRenderChannelPayload,
} from "../../../../ir/index";
import { bytesField, integerField, stringField } from "./common";
import { decodeCloudiniPointCloud } from "./cloudini";
import { rosDecodersForPayloads } from "./factory";
import { ROS_COMPRESSED_POINT_CLOUD2_PAYLOADS } from "./payloads";
import {
  decodeRosPointCloud2Record,
  projectRosPointCloud2Channel,
} from "./point-cloud2";

/**
 * Decoders for Cloudini-compressed ROS 2 CompressedPointCloud2 messages.
 */
export const rosCompressedPointCloud2Decoders = rosDecodersForPayloads({
  id: "ros.compressed-point-cloud2.cloudini",
  map: decodeRosCompressedPointCloud2Record,
  payloads: ROS_COMPRESSED_POINT_CLOUD2_PAYLOADS,
  projectPointCloudChannel: projectRosCompressedPointCloud2Channel,
});

function decodeRosCompressedPointCloud2Record(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const { cloudiniVersion, pointCloud } = decompressPointCloudRecord(message);
  const output = decodeRosPointCloud2Record(pointCloud, context);
  return {
    ...output,
    attributes: {
      ...output.attributes,
      compressionFormat: "cloudini",
      ...(cloudiniVersion === undefined ? {} : { cloudiniVersion }),
    },
  };
}

function projectRosCompressedPointCloud2Channel(
  message: Record<string, unknown>,
  context: DecodeContext,
  request: PointCloudChannelProjectionRequest,
): PointCloudRenderChannelPayload {
  return projectRosPointCloud2Channel(
    decompressPointCloudRecord(message).pointCloud,
    context,
    request,
  );
}

function decompressPointCloudRecord(message: Record<string, unknown>): {
  readonly cloudiniVersion?: number;
  readonly pointCloud: Record<string, unknown>;
} {
  const format = stringField(message, "format");
  if (format !== "cloudini") {
    throw new Error(
      `Unsupported CompressedPointCloud2 format '${format || "unknown"}'`,
    );
  }

  const height = integerField(message, "height");
  const width = integerField(message, "width");
  const pointStep = integerField(message, "point_step");
  const rowStep = integerField(message, "row_step");
  const compressedData = bytesField(message, "compressed_data");
  if (compressedData.byteLength === 0) {
    if (height * width !== 0) {
      throw new Error("Cloudini data is empty for a non-empty point cloud");
    }
    return {
      pointCloud: { ...message, data: new Uint8Array() },
    };
  }

  const decoded = decodeCloudiniPointCloud(compressedData);
  if (
    decoded.header.height !== height ||
    decoded.header.width !== width ||
    decoded.header.pointStep !== pointStep
  ) {
    throw new Error(
      "Cloudini header layout does not match CompressedPointCloud2 metadata",
    );
  }

  const rowPointBytes = width * pointStep;
  if (rowStep < rowPointBytes) {
    throw new Error(
      `CompressedPointCloud2 row_step ${rowStep} cannot hold ${width} points of stride ${pointStep}`,
    );
  }
  let data = decoded.data;
  if (rowStep !== rowPointBytes) {
    const paddedByteLength = rowStep * height;
    if (!Number.isSafeInteger(paddedByteLength) || paddedByteLength < 0) {
      throw new Error("CompressedPointCloud2 row layout is too large");
    }
    data = new Uint8Array(paddedByteLength);
    for (let row = 0; row < height; row++) {
      data.set(
        decoded.data.subarray(row * rowPointBytes, (row + 1) * rowPointBytes),
        row * rowStep,
      );
    }
  }

  return {
    cloudiniVersion: decoded.header.version,
    pointCloud: { ...message, data },
  };
}
