import {
  createNetworkTransportMeter,
  type NetworkTransportSnapshot,
} from "../../../network-meter";

/**
 * Worker lane a transport snapshot came from. Kept structural here so the
 * resource-client contract can reference it without importing worker internals.
 */
export type McapTransportLane = "foreground" | "idle" | "bulk";

/**
 * One lane's cumulative transport counters, forwarded to health listeners.
 */
export interface McapLaneTransportSnapshot {
  readonly lane: McapTransportLane;
  readonly snapshot: McapTransportSnapshot;
}

export type McapTransportSnapshot = NetworkTransportSnapshot;

export const createMcapTransportMeter = createNetworkTransportMeter;
