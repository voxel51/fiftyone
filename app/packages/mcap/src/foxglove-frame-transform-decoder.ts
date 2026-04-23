import type { DecodedTransform } from "./ros-decoder";
import { decodeFoxgloveFrameTransformMessage } from "./foxglove-protobuf";

function normalizeQuaternion(
  rotation: ReturnType<typeof decodeFoxgloveFrameTransformMessage>["rotation"]
) {
  const x = rotation?.x ?? 0;
  const y = rotation?.y ?? 0;
  const z = rotation?.z ?? 0;
  const w = rotation?.w ?? 1;
  const magnitudeSquared = x * x + y * y + z * z + w * w;

  if (!magnitudeSquared) {
    return [0, 0, 0, 1] as [number, number, number, number];
  }

  const inverseMagnitude = 1 / Math.sqrt(magnitudeSquared);
  return [
    x * inverseMagnitude,
    y * inverseMagnitude,
    z * inverseMagnitude,
    w * inverseMagnitude,
  ] as [number, number, number, number];
}

/** Decodes one Foxglove protobuf `FrameTransform` payload. */
export function decodeFoxgloveFrameTransformPayload(
  payload: Uint8Array
): DecodedTransform[] {
  const message = decodeFoxgloveFrameTransformMessage(payload);

  return [
    {
      parentFrameId: message.parentFrameId,
      childFrameId: message.childFrameId,
      translation: [
        message.translation?.x ?? 0,
        message.translation?.y ?? 0,
        message.translation?.z ?? 0,
      ],
      rotation: normalizeQuaternion(message.rotation),
    },
  ];
}
