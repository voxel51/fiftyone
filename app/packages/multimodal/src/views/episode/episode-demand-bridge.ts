import {
  startDemandBridge,
  useDemandRegistry,
  type DemandBridgeFillContext,
  type DemandBridgeOptions,
  type DemandBridgeRuntime,
  type DemandHandlers,
  type DemandRegistry,
} from "../../runtime";
import { shouldDeferEpisodeIdleWorkForStore } from "./episode-network-health";
import type { EpisodeDataStream } from "./episode-data-stream-context";

/** @deprecated Use the format-neutral `DemandHandlers`. */
export type EpisodeDemandHandlers = DemandHandlers;
/** @deprecated Use the format-neutral `DemandRegistry`. */
export type EpisodeDemandRegistry<THandlers extends EpisodeDemandHandlers> =
  DemandRegistry<THandlers>;
/** @deprecated Use the format-neutral `DemandBridgeRuntime`. */
export type EpisodeDemandBridgeRuntime = DemandBridgeRuntime;
/** @deprecated Use the format-neutral `DemandBridgeFillContext`. */
export type EpisodeDemandBridgeFillContext = DemandBridgeFillContext;
/** @deprecated Use the format-neutral `DemandBridgeOptions`. */
export type EpisodeDemandBridgeOptions<
  THandlers extends EpisodeDemandHandlers,
> = Omit<
  DemandBridgeOptions<THandlers, EpisodeDataStream>,
  "shouldDeferIdleWork"
>;

/** @deprecated Use `useDemandRegistry` from the shared runtime. */
export function useEpisodeDemandRegistry<
  THandlers extends EpisodeDemandHandlers,
>(): EpisodeDemandRegistry<THandlers> {
  return useDemandRegistry<THandlers>();
}

/** @deprecated Use `startDemandBridge` from the shared runtime. */
export function startEpisodeDemandBridge<
  THandlers extends EpisodeDemandHandlers,
>(options: EpisodeDemandBridgeOptions<THandlers>): () => void {
  return startDemandBridge({
    ...options,
    shouldDeferIdleWork: (store) =>
      shouldDeferEpisodeIdleWorkForStore(store, null),
  });
}
