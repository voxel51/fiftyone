import type {
  DecodeContext,
  Decoder,
  PointCloudChannelProjectionRequest,
} from "../../../../decoders/index";
import type {
  DecodedOutput,
  PayloadDescriptor,
  PointCloudRenderChannelPayload,
} from "../../../../ir/index";
import { decodeRosMessage } from "./common";

type RosMapper = (
  record: Record<string, unknown>,
  context: DecodeContext,
  bytes: Uint8Array,
) => DecodedOutput;

type RosPointCloudChannelProjector = (
  record: Record<string, unknown>,
  context: DecodeContext,
  request: PointCloudChannelProjectionRequest,
) => PointCloudRenderChannelPayload;

/**
 * Builds one ROS decoder per supported payload descriptor for a message family.
 */
export function rosDecodersForPayloads({
  id,
  map,
  payloads,
  projectPointCloudChannel,
}: {
  readonly id: string;
  readonly map: RosMapper;
  readonly payloads: readonly PayloadDescriptor[];
  readonly projectPointCloudChannel?: RosPointCloudChannelProjector;
}): readonly Decoder[] {
  return payloads.map((payload) => ({
    id: `${id}.${payload.schemaEncoding ?? "unknown"}`,
    payload,
    version: "1",
    decode(bytes, context) {
      return map(decodeRosMessage(bytes, payload, context), context, bytes);
    },
    ...(projectPointCloudChannel
      ? {
          projectPointCloudChannel(
            bytes: Uint8Array,
            context: DecodeContext,
            request: PointCloudChannelProjectionRequest,
          ) {
            return projectPointCloudChannel(
              decodeRosMessage(bytes, payload, context),
              context,
              request,
            );
          },
        }
      : {}),
  }));
}
