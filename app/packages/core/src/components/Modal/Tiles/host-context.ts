import { createContext, useContext } from "react";

/**
 * What the sample tiling host takes over from the content it hosts. The
 * dynamic-group paginator moves from inside the group tree to the host's
 * footer, so the tree must not render its own.
 */
export interface SampleTilesHostValue {
  readonly hostsPaginator: boolean;
}

export const SampleTilesHostContext = createContext<SampleTilesHostValue>({
  hostsPaginator: false,
});

/** True when a surrounding tiling host renders the dynamic-group paginator. */
export function useHostsPaginator(): boolean {
  return useContext(SampleTilesHostContext).hostsPaginator;
}
