import { decodeFoxgloveCameraCalibrationMessage } from "./foxglove-protobuf";

export type DecodedFoxgloveCameraCalibration = {
  timestampNs: number | null;
  frameId: string;
  width: number;
  height: number;
  distortionModel: string;
  d: number[];
  k: number[];
  r: number[];
  p: number[];
};

function decodeTimestampNs(
  timestamp:
    | { seconds?: number | null; nanos?: number | null }
    | null
    | undefined
) {
  if (!timestamp) {
    return null;
  }

  return (
    Number(timestamp.seconds ?? 0) * 1_000_000_000 +
    Number(timestamp.nanos ?? 0)
  );
}

export function decodeFoxgloveCameraCalibrationPayload(
  payload: Uint8Array
): DecodedFoxgloveCameraCalibration {
  const message = decodeFoxgloveCameraCalibrationMessage(payload);

  return {
    timestampNs: decodeTimestampNs(message.timestamp),
    frameId: message.frameId,
    width: message.width,
    height: message.height,
    distortionModel: message.distortionModel,
    d: message.d,
    k: message.k,
    r: message.r,
    p: message.p,
  };
}
