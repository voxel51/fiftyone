/**
 * Data-plane facade for timeline extension implementations.
 *
 * Extensions sometimes need the active MCAP stream, demand bridge, or
 * playback store. Keeping those adapter imports here gives extension code one
 * narrow dependency boundary without adding lower-level runtime APIs to the
 * extension registration barrel in `index.ts`.
 */
import {
  startMcapDemandBridge,
  useMcapDemandRegistry,
} from "../../adapters/mcap/react/mcap-demand-bridge";
import {
  McapDataStreamProvider,
  useMcapDataStream,
  useSetMcapDataStream,
} from "../../adapters/mcap/react/mcap-data-stream-context";
import { createMcapTimelineIndex } from "../../adapters/mcap/react/mcap-timeline-index";
import { MCAP_ACTIVE_TIMELINE } from "../../adapters/mcap/types";

export {
  createMcapTimelineIndex,
  MCAP_ACTIVE_TIMELINE,
  McapDataStreamProvider,
  startMcapDemandBridge,
  useMcapDataStream,
  useMcapDemandRegistry,
  useSetMcapDataStream,
};
export {
  McapExtensionPlaybackStoreProvider,
  useMcapExtensionPlaybackStore,
} from "./playback-store";
export type { McapDataStream } from "../../adapters/mcap/react/mcap-data-stream-context";
export type {
  McapDemandBridgeFillContext,
  McapDemandBridgeOptions,
  McapDemandHandlers,
  McapDemandRegistry,
} from "../../adapters/mcap/react/mcap-demand-bridge";
export type { McapTimelineIndex } from "../../adapters/mcap/react/mcap-timeline-index";
export type {
  McapDecodedMessage,
  McapReadDecodedMessagesRequest,
  McapResourceClient,
} from "../../adapters/mcap/types";
export {
  addCoveredRange,
  removeCoveredRange,
  subtractCoveredRanges,
} from "../../adapters/mcap/react/numeric-series-window";
export type { NsRange } from "../../adapters/mcap/react/numeric-series-window";
