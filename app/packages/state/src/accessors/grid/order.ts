/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * @module accessors/grid/order
 */

import { useReverbValue } from "@fiftyone/reverb";
import { gridLargeCollection } from "../../atoms/grid";
import { gridOrderInput, type OrderInput } from "../../atoms/order";

export type { OrderInput };

/** The order the grid pages: its view, filters and sort. */
export const useGridOrderInput = (): OrderInput =>
  useReverbValue(gridOrderInput);

/**
 * Whether the dataset is above the size a grid addresses by offset: such a
 * grid never counts or skips, and sorts only by indexed fields.
 */
export const useGridLargeCollection = (): boolean =>
  useReverbValue(gridLargeCollection);
