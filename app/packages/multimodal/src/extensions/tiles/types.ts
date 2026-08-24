import type { IconProps } from "@voxel51/voodo";
import type React from "react";

/** Namespaced identity required for a build-time tile contribution. */
export type EpisodeTileExtensionId = `${string}:${string}`;

/** Format-neutral facts exposed to tile availability predicates. */
export interface EpisodeTileAvailability {
  readonly hasNumericSeries: boolean;
  readonly hasRawRecords: boolean;
  readonly hasTransformTopology: boolean;
  readonly sourceTypes: readonly string[];
}

/** Props supplied by the episode host to every tile body. */
export interface EpisodeTileProps {
  readonly initialSourceId?: string;
  /** Present only when restoring a tile whose extension is not in this build. */
  readonly unavailableType?: string;
}

/** One tile kind contributed by code included in the current build. */
export interface EpisodeTileExtension {
  readonly icon: React.ComponentType<IconProps>;
  readonly id: EpisodeTileExtensionId;
  readonly isAvailable: (facts: EpisodeTileAvailability) => boolean;
  readonly order: number;
  readonly Tile: React.ComponentType<EpisodeTileProps>;
  readonly typeLabel: string;
}
