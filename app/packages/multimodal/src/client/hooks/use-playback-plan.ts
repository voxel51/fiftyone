import { useMemo } from "react";
import type { PlaybackPlan } from "../../schemas/v1";
import {
  defaultMultimodalQueryClient,
  type MultimodalQueryClient,
  type PlaybackPlanRequest,
} from "../queries";
import type { MultimodalQueryState } from "./types";
import { useMultimodalQuery } from "./use-multimodal-query";

/**
 * Loads the playback plan for a resolved inventory artifact.
 */
export function usePlaybackPlan(
  request: PlaybackPlanRequest | null | undefined,
  client: MultimodalQueryClient = defaultMultimodalQueryClient
): MultimodalQueryState<PlaybackPlan> {
  const inventoryId = request?.inventoryId;

  const load = useMemo(() => {
    if (!inventoryId) {
      return null;
    }

    return () => client.getPlaybackPlan({ inventoryId });
  }, [client, inventoryId]);

  return useMultimodalQuery(load);
}
