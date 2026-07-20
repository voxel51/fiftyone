import {
  createNetworkTransportMeter,
  type LaneTransportSnapshot,
  type NetworkTransportSnapshot,
  type TransportLane,
} from "../../../query/bytes";

/**
 * Worker lane a transport snapshot came from. Kept structural here so the
 * resource-client contract can reference it without importing worker internals.
 */
export type McapTransportLane = TransportLane;

/**
 * One lane's cumulative transport counters, forwarded to health listeners.
 */
export type McapLaneTransportSnapshot = LaneTransportSnapshot;

export type McapTransportSnapshot = NetworkTransportSnapshot;

export const createMcapTransportMeter = createNetworkTransportMeter;
