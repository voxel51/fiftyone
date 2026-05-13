import type { IconName } from "@voxel51/voodo";
import type { ComponentType } from "react";
import type { PlaybackStream } from "../../../lib/playback/types";

/** Discriminator for the mock factories we ship. */
export type MockStreamType = "camera" | "lidar" | "scene" | "graph" | "json";

/**
 * The complete description of a mock stream + the tile that renders it.
 *
 * Factories under `stories/utils/` return one of these so the demo
 * stories can:
 *   - register `stream` with the playback engine
 *   - derive the timeline's duration/step from the registered streams
 *     (the engine already does this for `duration`; step can follow
 *     once the provider drops its `stepInterval` prop)
 *   - populate the "add tile" menu from the registered bundles, so the
 *     menu reflects what data is actually available
 *
 * Keep the bundle thin — anything domain-specific (sample data, fetch
 * logic, fixtures) lives in the factory module that produces it.
 */
export interface MockStreamBundle {
  /** Stream id — must be unique within a single PlaybackProvider. */
  id: string;
  /** Mock type — drives default coloring on the timeline tracks. */
  type: MockStreamType;
  /** Menu label for the type ("Camera", "3D Scene", …). */
  typeLabel: string;
  /** Human-readable title shown on the add-tile menu and the tile chrome. */
  title: string;
  /** Icon used for the add-tile menu entry. */
  icon: IconName;
  /** Stream object passed to `registerStream`. */
  stream: PlaybackStream;
  /** Tile body component. Mount as `<bundle.Tile />`. */
  Tile: ComponentType;
}

/**
 * Common shape for mock-stream factory options. Individual factories
 * may extend this with their own fields (sample rate, point count,
 * etc.).
 */
export interface MockStreamFactoryOptions {
  /** Stream id. Required so two streams of the same kind can coexist. */
  id: string;
  /** Defaults to `id`. */
  title?: string;
  /** Total stream length in seconds. @default 10 */
  duration?: number;
}
