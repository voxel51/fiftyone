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
import type { SampleStore } from "../useSpotlightPager";

export type Renderer = ReturnType<typeof useRenderer>["renderer"];

/** What every lazily mounted strip in a Lanes or Matrix layout shares. */
export interface Strips {
  aspectRatio?: number;
  environment: IEnvironment;
  limit: Limiter;
  records: Records;
  /** Tracks an inner instance so looker option updates reach it. */
  register: (spotlight: Spotlight<number, fos.Sample>) => () => void;
  renderer: MutableRefObject<Renderer>;
  reset: string;
  root: HTMLElement | null;
  spacing: number;
  store: SampleStore;
  /** The grid's page variables narrowed to samples where each path equals its value. */
  variables: (matches: [string, FieldValue][]) => PageVariables;
}

export const StripsContext = createContext<Strips | null>(null);
