/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type Spotlight from "@fiftyone/floodlight";
import type * as fos from "@fiftyone/state";
import { createContext, type MutableRefObject } from "react";
import type { IEnvironment } from "relay-runtime";
import type { FieldValue } from "../categorical";
import type { Limiter, PageVariables } from "../samplePages";
import type useRenderer from "../useRenderer";
import type { Records } from "../useRecords";
import type { Ownership } from "../../host/ownership";
import type { SampleStore } from "../useSpotlightPager";

export type Renderer = ReturnType<typeof useRenderer>["renderer"];

/** What looker option updates reach: an inner instance or a stack. */
export type Updatable = Pick<Spotlight<number, fos.Sample>, "updateItems">;

/** What every lazily mounted strip in a Lanes or Matrix layout shares. */
export interface Strips {
  aspectRatio?: number;
  /** Held still while a rebuilt strip takes its lookers over. */
  cache: { freeze(): void; unfreeze(): void };
  environment: IEnvironment;
  /** Whether the item cache holds a looker for this sample id. */
  hasItem: (key: string) => boolean;
  /** The dimensions each looker was last shown at, for moving it unresized. */
  lastSizes: Map<string, [number, number]>;
  limit: Limiter;
  /** Which strip owns each looker; shared by every strip in the layout. */
  ownership: Ownership;
  records: Records;
  /** Tracks an inner instance so looker option updates reach it. */
  register: (instance: Updatable) => () => void;
  renderer: MutableRefObject<Renderer>;
  reset: string;
  root: HTMLElement | null;
  spacing: number;
  store: SampleStore;
  /** The grid's page variables narrowed to samples where each path equals its value. */
  variables: (matches: [string, FieldValue][]) => PageVariables;
}

export const StripsContext = createContext<Strips | null>(null);
