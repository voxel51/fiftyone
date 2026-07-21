import type { DecodeContext } from "../../../../decoders";
import type {
  CameraCalibrationVisualization,
  DecodedAttributeValue,
  DecodedDiagnostic,
  DecodedOutput,
} from "../../../../ir";
import { VISUALIZATION_KIND } from "../../../../ir";
import {
  finiteNumberArrayField,
  numberArrayField,
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
  const width = requiredCameraDimension(message, "width");
  const height = requiredCameraDimension(message, "height");
  const zeroDimensions = width === 0 && height === 0;
  const validDimensions = width > 0 && height > 0;
  if (!zeroDimensions && !validDimensions) {
    throw new Error(`Invalid camera info dimensions ${width}x${height}`);
  }

  const K = requiredMatrix(message, "K", "k", INTRINSIC_MATRIX_LENGTH);
  const kShape = calibrationMatrixShape(K, 0, 4);
  const pMatrix = optionalMatrix(
    message,
    "P",
    "p",
    PROJECTION_MATRIX_LENGTH,
    0,
    5,
  );
  const rMatrix = optionalMatrix(
    message,
    "R",
    "r",
    RECTIFICATION_MATRIX_LENGTH,
  );
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

  if (zeroDimensions) {
    if (
      kShape !== "zero" ||
      (pMatrix.shape !== "absent" && pMatrix.shape !== "zero") ||
      (rMatrix.shape !== "absent" && rMatrix.shape !== "zero")
    ) {
      throw new Error(
        "Zero-sized camera info must contain only all-zero calibration matrices",
      );
    }
    return unavailableCalibrationOutput({
      attributes,
      context,
      header,
      message:
        "Camera calibration is explicitly unavailable (zero dimensions and matrices)",
    });
  }

  if (kShape === "malformed") {
    throw new Error(
      "Camera info K must contain finite values with non-zero horizontal and vertical focal terms",
    );
  }
  if (kShape === "zero") {
    if (pMatrix.shape === "malformed") {
      throw new Error("Camera info P is malformed and K is unavailable");
    }
    return unavailableCalibrationOutput({
      attributes,
      context,
      header,
      message:
        pMatrix.shape === "usable"
          ? "P-only camera calibration is not supported"
          : "Camera calibration is explicitly unavailable (all-zero K)",
    });
  }

  const malformedRectificationMatrices = [
    ...(pMatrix.shape === "malformed" ? ["P"] : []),
    ...(rMatrix.shape === "malformed" ? ["R"] : []),
  ];
  const diagnostics: DecodedDiagnostic[] =
    malformedRectificationMatrices.length > 0
      ? [
          {
            capability: "camera-rectification",
            code: "camera-rectification-unavailable",
            message: `Camera rectification is unavailable because ${malformedRectificationMatrices.join(
              " and ",
            )} is malformed`,
            severity: "warning",
          },
        ]
      : [];

  const visualization: CameraCalibrationVisualization = {
    ...(frameId ? { coordinateFrameId: frameId } : {}),
    binningX,
    binningY,
    ...(D.length > 0 ? { D } : {}),
    ...(distortionModel ? { distortionModel } : {}),
    height,
    K,
    kind: VISUALIZATION_KIND.CAMERA_CALIBRATION,
    ...(pMatrix.shape === "usable" ? { P: pMatrix.values } : {}),
    ...(rMatrix.shape === "usable" ? { R: rMatrix.values } : {}),
    ...(roi ? { roi } : {}),
    ...(messageTimestamp !== undefined
      ? { timestampNs: messageTimestamp }
      : {}),
    width,
  };

  return {
    attributes,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    timing: timingFromRosHeader(context, header),
    visualization,
  };
}

function unavailableCalibrationOutput({
  attributes,
  context,
  header,
  message,
}: {
  readonly attributes: Record<string, DecodedAttributeValue>;
  readonly context: DecodeContext;
  readonly header: Record<string, unknown> | undefined;
  readonly message: string;
}): DecodedOutput {
  return {
    attributes: { ...attributes, calibrationStatus: "unavailable" },
    diagnostics: [
      {
        capability: "camera-calibration",
        code: "camera-calibration-unavailable",
        message,
        severity: "warning",
      },
    ],
    timing: timingFromRosHeader(context, header),
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

type MatrixShape = "absent" | "malformed" | "usable" | "zero";

function requiredCameraDimension(
  record: Record<string, unknown>,
  field: string,
): number {
  const value = numberField(record, field, undefined, Number.NaN);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid camera info ${field} ${value}`);
  }
  return value;
}

function requiredMatrix(
  record: Record<string, unknown>,
  field: string,
  fallbackField: string,
  expectedLength: number,
): readonly number[] {
  const values = numberArrayField(record, field, fallbackField);
  if (
    values.length !== expectedLength ||
    values.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(
      `Camera info ${field} must have ${expectedLength} finite values, got ${values.length}`,
    );
  }
  return values;
}

function optionalMatrix(
  record: Record<string, unknown>,
  field: string,
  fallbackField: string,
  expectedLength: number,
  firstFocalIndex?: number,
  secondFocalIndex?: number,
): { readonly shape: MatrixShape; readonly values: readonly number[] } {
  const supplied =
    record[field] !== undefined || record[fallbackField] !== undefined;
  if (!supplied) return { shape: "absent", values: [] };
  const values = numberArrayField(record, field, fallbackField);
  if (
    values.length !== expectedLength ||
    values.some((value) => !Number.isFinite(value))
  ) {
    return { shape: "malformed", values };
  }
  if (values.every((value) => value === 0)) {
    return { shape: "zero", values };
  }
  if (
    firstFocalIndex !== undefined &&
    secondFocalIndex !== undefined &&
    (values[firstFocalIndex] === 0 || values[secondFocalIndex] === 0)
  ) {
    return { shape: "malformed", values };
  }
  return { shape: "usable", values };
}

function calibrationMatrixShape(
  values: readonly number[],
  firstFocalIndex: number,
  secondFocalIndex: number,
): Exclude<MatrixShape, "absent"> {
  if (values.every((value) => value === 0)) return "zero";
  return values[firstFocalIndex] !== 0 && values[secondFocalIndex] !== 0
    ? "usable"
    : "malformed";
}
