import {
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import type { EpisodeSession } from "../../ports";
import { createExtensionRegistry } from "../host/registry";

/** Optional session augmentation and UI mounted in the viewer's contexts. */
export interface EpisodeSessionContribution {
  readonly session: EpisodeSession | null;
  readonly headerActions?: ReactNode;
  readonly emptyState?: ReactNode;
}

export interface EpisodeSessionExtensionProps {
  readonly session: EpisodeSession | null;
  readonly datasetId?: string;
  readonly children: (contribution: EpisodeSessionContribution) => ReactNode;
}

const registry = createExtensionRegistry<{
  readonly id: string;
  readonly order: number;
  readonly Component: ComponentType<EpisodeSessionExtensionProps>;
}>(Symbol.for("@fiftyone/multimodal:episode-session"), "episode session", {
  duplicateIdPolicy: "replace",
});

/** The host installs one session provider; disposal restores ordinary playback. */
export function registerEpisodeSessionExtension(
  Component: ComponentType<EpisodeSessionExtensionProps>,
): () => void {
  return registry.register({ id: "session", order: 0, Component });
}

/** An unextended viewer passes the original session through without side effects. */
export function useEpisodeSessionExtension():
  | ComponentType<EpisodeSessionExtensionProps>
  | undefined {
  return useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getSnapshot,
  )[0]?.Component;
}
