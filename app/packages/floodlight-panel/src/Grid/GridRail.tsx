/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Panel adapter for the rank rail: reads the view's sample count from app
 * state and hands it to the rail.
 */

import * as fos from "@fiftyone/state";
import { useReverbValue } from "@fiftyone/reverb";
import React from "react";
import RankRail from "../rail/RankRail";
import type { Rail } from "../rail/useRail";

const COUNT = { extended: false, path: "", modal: false, lightning: true };

interface GridRailProps {
  rail: Rail;
  horizontal?: boolean;
}

const GridRailContent = ({ horizontal, rail }: GridRailProps) => {
  const total = useReverbValue(fos.count(COUNT));
  if (typeof total !== "number" || total <= 0) return null;

  return (
    <RankRail
      total={total}
      anchorRank={rail.anchorRank}
      visible={rail.visible}
      orientation={horizontal ? "horizontal" : "vertical"}
      onJump={(position) => rail.jump(position, total)}
    />
  );
};

const GridRail = ({
  visible,
  ...props
}: GridRailProps & { visible: boolean }) =>
  visible ? <GridRailContent {...props} /> : null;

export default React.memo(GridRail);
