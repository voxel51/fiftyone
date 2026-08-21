import { describe, expect, it } from "vitest";
import { VISUALIZATION_KIND } from "../../../ir/index";
import { foxgloveCameraCalibrationDecoder } from "./foxglove/index";
import { CAMERA_CALIBRATION_FIXTURE } from "./foxglove.test-fixtures";
import {
  concatProtobufFields,
  protobufBytesField,
  protobufDoubleField,
  protobufFixed32Field,
} from "./foxglove.test-helpers";

describe("Foxglove camera calibration decoders", () => {
  it("decodes protobuf camera calibration payloads", () => {
    // foxglove.CameraCalibration field numbers: width=2, height=3,
    // distortion_model=4, D=5, K=6, R=7, P=8, frame_id=9.
    const output = foxgloveCameraCalibrationDecoder.decode(
      concatProtobufFields(
        protobufFixed32Field(2, 1600),
        protobufFixed32Field(3, 900),
        ...[1252.8, 0, 826.6, 0, 1252.8, 469.9, 0, 0, 1].map((value) =>
          protobufDoubleField(6, value),
        ),
        protobufBytesField(9, new TextEncoder().encode("CAM_FRONT")),
      ),
      {
        schemaData: CAMERA_CALIBRATION_FIXTURE.schemaData,
        sourceTimestamps: {
          captureTime: 10n,
          receiveTime: 11n,
        },
        streamId: "/CAM_FRONT/camera_info",
        timeRangeStartKey: "captureTime",
      },
    );

    expect(output.visualization?.kind).toBe(
      VISUALIZATION_KIND.CAMERA_CALIBRATION,
    );
    if (output.visualization?.kind !== VISUALIZATION_KIND.CAMERA_CALIBRATION) {
      throw new Error("Expected camera calibration visualization");
    }
    expect(output.visualization).toMatchObject({
      coordinateFrameId: "CAM_FRONT",
      height: 900,
      width: 1600,
    });
    expect(output.visualization.K).toEqual([
      1252.8, 0, 826.6, 0, 1252.8, 469.9, 0, 0, 1,
    ]);
    expect(output.visualization.R).toBeUndefined();
    expect(output.timing?.timeRange?.startNs).toBe(10n);
  });
});
