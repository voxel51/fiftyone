/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The rail for the grid's order: offsets or values on a rail, a value box
 * for a string or boolean sort, and nothing for an order that only scrolls.
 */

import * as fos from "@fiftyone/state";
import React from "react";
import Rail from "../rail/Rail";
import ValueJump from "../rail/ValueJump";
import { isRailed } from "./railModes";
import type { GridRailState } from "./useGridRail";

interface GridRailProps {
  rail: GridRailState;
  horizontal?: boolean;
  loading?: boolean;
}

const GridRail = ({ horizontal, loading, rail }: GridRailProps) => {
  const field = fos.useGridOrderInput().sortBy;
  const { mode } = rail;

  if (mode.kind === "values" && field) {
    return (
      <ValueJump bounds={mode.bounds} field={field} onSeek={rail.seekValue} />
    );
  }
  if (!isRailed(mode)) return null;

  return (
    <Rail
      follow={rail.follow}
      label={(position) => mode.label(position, rail.visible)}
      loading={loading}
      onJump={rail.jump}
      orientation={horizontal ? "horizontal" : "vertical"}
      position={rail.position}
      span={mode.span(rail.visible)}
      ticks={mode.ticks}
    />
  );
};

export default React.memo(GridRail);
