import type { MultimodalCompressedImageDecodeResponse } from "./compressed-image-decoder";
import { decodeFoxgloveCompressedImageMessage } from "./foxglove-protobuf";

/** Decodes one Foxglove protobuf `CompressedImage` payload. */
export function decodeFoxgloveCompressedImagePayload(
  payload: Uint8Array
): MultimodalCompressedImageDecodeResponse {
  const message = decodeFoxgloveCompressedImageMessage(payload);

  return {
    messageId: "",
    format: message.format,
    frameId: message.frameId,
    compressedBytes: message.data,
  };
}
