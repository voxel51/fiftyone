import type {
  CameraCalibrationVisualization,
  DecodedAttributeValue,
} from "../../../../decoders";
import { VISUALIZATION_KIND } from "../../../../visualization";
import {
  finiteNumberArrayField,
  numberField,
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
  map(message, context) {
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
      timing: timingFromRosHeader(context, header),
      visualization,
    };
  },
  payloads: ROS_CAMERA_INFO_PAYLOADS,
});

function matrixOrUndefined(
  record: Record<string, unknown>,
  field: string,
  fallbackField: string,
  expectedLength: number,
): readonly number[] | undefined {
  const values = finiteNumberArrayField(record, field, fallbackField);
  return values.length === expectedLength ? values : undefined;
}
