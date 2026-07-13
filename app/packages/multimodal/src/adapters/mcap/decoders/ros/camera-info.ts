import type {
  CameraCalibrationVisualization,
  DecodeContext,
  DecodedAttributeValue,
  DecodedOutput,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import {
  finiteNumberArrayField,
  numberField,
  recordField,
  rosHeader,
  rosHeaderAttributes,
  rosHeaderFrameId,
  rosHeaderTimestampNs,
  stringField,
  timingFromRosHeader,
} from "./common";
import { rosDecodersForPayloads } from "./factory";
import { ROS_CAMERA_INFO_PAYLOADS } from "./payloads";

const INTRINSIC_MATRIX_LENGTH = 9;
const RECTIFICATION_MATRIX_LENGTH = 9;
const PROJECTION_MATRIX_LENGTH = 12;

/**
 * Decoders for ROS CameraInfo messages.
 */
export const rosCameraInfoDecoders = rosDecodersForPayloads({
  id: "ros.camera-info",
  map: decodeRosCameraInfoRecord,
  payloads: ROS_CAMERA_INFO_PAYLOADS,
});

/**
 * Normalizes a decoded ROS CameraInfo record into a camera calibration output.
 */
export function decodeRosCameraInfoRecord(
  message: Record<string, unknown>,
  context: DecodeContext,
): DecodedOutput {
  const header = rosHeader(message);
  const frameId = rosHeaderFrameId(header);
  const messageTimestamp = rosHeaderTimestampNs(header);
  const width = numberField(message, "width");
  const height = numberField(message, "height");
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error(`Invalid camera info width ${width}`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(`Invalid camera info height ${height}`);
  }

  const K = finiteNumberArrayField(message, "K", "k");
  if (K.length !== INTRINSIC_MATRIX_LENGTH) {
    throw new Error(
      `Camera info K must have ${INTRINSIC_MATRIX_LENGTH} values, got ${K.length}`,
    );
  }

  const R = matrixOrUndefined(message, "R", "r", RECTIFICATION_MATRIX_LENGTH);
  const P = matrixOrUndefined(message, "P", "p", PROJECTION_MATRIX_LENGTH);
  const D = finiteNumberArrayField(message, "D", "d");
  const binningX = nonnegativeIntegerField(message, "binning_x", "binningX");
  const binningY = nonnegativeIntegerField(message, "binning_y", "binningY");
  const roi = cameraInfoRoi(recordField(message, "roi"));
  const distortionModel = stringField(
    message,
    "distortion_model",
    stringField(message, "distortionModel"),
  );

  const attributes: Record<string, DecodedAttributeValue> = {
    ...rosHeaderAttributes(header),
    height,
    width,
  };
  if (distortionModel) {
    attributes.distortionModel = distortionModel;
  }

  const visualization: CameraCalibrationVisualization = {
    ...(frameId ? { coordinateFrameId: frameId } : {}),
    binningX,
    binningY,
    ...(D.length > 0 ? { D } : {}),
    ...(distortionModel ? { distortionModel } : {}),
    height,
    K,
    kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
    ...(P ? { P } : {}),
    ...(R ? { R } : {}),
    ...(roi ? { roi } : {}),
    ...(messageTimestamp !== undefined
      ? { timestampNs: messageTimestamp }
      : {}),
    width,
  };

  return {
    attributes,
    timing: timingFromRosHeader(context, header),
    visualization,
  };
}

function nonnegativeIntegerField(
  record: Record<string, unknown>,
  field: string,
  fallbackField: string,
): number {
  const value = numberField(record, field, fallbackField, 0);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Camera info ${field} must be a nonnegative integer`);
  }
  return value;
}

function cameraInfoRoi(
  record: Record<string, unknown> | undefined,
): CameraCalibrationVisualization["roi"] {
  if (!record) {
    return undefined;
  }
  const xOffset = nonnegativeIntegerField(record, "x_offset", "xOffset");
  const yOffset = nonnegativeIntegerField(record, "y_offset", "yOffset");
  const width = nonnegativeIntegerField(record, "width", "width");
  const height = nonnegativeIntegerField(record, "height", "height");
  const doRectifyValue = record.do_rectify ?? record.doRectify;
  return {
    doRectify: doRectifyValue === true,
    height,
    width,
    xOffset,
    yOffset,
  };
}

function matrixOrUndefined(
  record: Record<string, unknown>,
  field: string,
  fallbackField: string,
  expectedLength: number,
): readonly number[] | undefined {
  const values = finiteNumberArrayField(record, field, fallbackField);
  return values.length === expectedLength ? values : undefined;
}
