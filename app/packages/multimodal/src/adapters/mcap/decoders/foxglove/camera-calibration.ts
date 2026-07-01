import type {
  CameraCalibrationVisualization,
  DecodedAttributeValue,
  Decoder,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import { decodeProtobufMessage } from "./protobuf";
import { FOXGLOVE_CAMERA_CALIBRATION_PAYLOAD } from "./protobuf/payloads";
import {
  optionalRecord,
  optionalString,
  requiredNumber,
} from "./protobuf/records";
import { timingFromContext, timestampNs } from "./protobuf/timing";

const INTRINSIC_MATRIX_LENGTH = 9;
const RECTIFICATION_MATRIX_LENGTH = 9;
const PROJECTION_MATRIX_LENGTH = 12;

/**
 * Decoder for Foxglove CameraCalibration protobuf messages. Emits camera
 * intrinsics for image-stream association and 3D frustum rendering. `K`
 * is required and validated; `R`/`P`/distortion are kept only when they
 * carry well-formed data, since exporters routinely omit them.
 */
export const foxgloveCameraCalibrationDecoder: Decoder = {
  id: "foxglove.camera-calibration",
  payload: FOXGLOVE_CAMERA_CALIBRATION_PAYLOAD,
  version: "1",

  decode(bytes, context) {
    const message = decodeProtobufMessage(
      bytes,
      FOXGLOVE_CAMERA_CALIBRATION_PAYLOAD,
      context,
    );
    const width = requiredNumber(message, "width");
    const height = requiredNumber(message, "height");
    const frameId = optionalString(message, "frameId", "frame_id");
    const distortionModel = optionalString(
      message,
      "distortionModel",
      "distortion_model",
    );
    const messageTimestamp = timestampNs(optionalRecord(message, "timestamp"));

    if (!Number.isInteger(width) || width <= 0) {
      throw new Error(`Invalid camera calibration width ${width}`);
    }
    if (!Number.isInteger(height) || height <= 0) {
      throw new Error(`Invalid camera calibration height ${height}`);
    }

    const K = numberArray(message, "K");
    if (K.length !== INTRINSIC_MATRIX_LENGTH) {
      throw new Error(
        `Camera calibration K must have ${INTRINSIC_MATRIX_LENGTH} values, got ${K.length}`,
      );
    }
    const R = matrixOrUndefined(message, "R", RECTIFICATION_MATRIX_LENGTH);
    const P = matrixOrUndefined(message, "P", PROJECTION_MATRIX_LENGTH);
    const D = numberArray(message, "D");

    const attributes: Record<string, DecodedAttributeValue> = {
      height,
      width,
    };
    if (frameId) {
      attributes.frameId = frameId;
    }
    if (distortionModel) {
      attributes.distortionModel = distortionModel;
    }

    const visualization: CameraCalibrationVisualization = {
      ...(frameId ? { coordinateFrameId: frameId } : {}),
      ...(D.length > 0 ? { D } : {}),
      ...(distortionModel ? { distortionModel } : {}),
      height,
      K,
      kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
      ...(P ? { P } : {}),
      ...(R ? { R } : {}),
      ...(messageTimestamp !== undefined
        ? { timestampNs: messageTimestamp }
        : {}),
      width,
    };

    return {
      attributes,
      timing: timingFromContext(context, messageTimestamp),
      visualization,
    };
  },
};

function matrixOrUndefined(
  record: Record<string, unknown>,
  field: string,
  expectedLength: number,
): readonly number[] | undefined {
  const values = numberArray(record, field);
  return values.length === expectedLength ? values : undefined;
}

function numberArray(
  record: Record<string, unknown>,
  field: string,
): readonly number[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === "number") return entry;
      if (typeof entry === "bigint") return Number(entry);
      return Number.NaN;
    })
    .filter((entry) => Number.isFinite(entry));
}
