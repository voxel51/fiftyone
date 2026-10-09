/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Panel adapter for the rank rail: reads the view's sample count from app
 * state and hands it to the rail.
 */

import * as fos from "@fiftyone/state";
import { useReverbValueLoadable } from "@fiftyone/reverb";
import React, { useRef } from "react";
import RankRail from "../rail/RankRail";
import type { Rail } from "../rail/useRail";

const COUNT = { extended: false, path: "", modal: false, lightning: true };

interface GridRailProps {
  rail: Rail;
  horizontal?: boolean;
  loading?: boolean;
}

const GridRailContent = ({ horizontal, loading, rail }: GridRailProps) => {
  // a filter recounts asynchronously; reading the count must not suspend the
  // panel, so the rail keeps the last total until the new one arrives
  const count = useReverbValueLoadable(fos.count(COUNT));
  const last = useRef<number>();
  if (count.state === "hasValue" && typeof count.contents === "number") {
    last.current = count.contents;
  }
  const total = last.current;
  if (total === undefined || total <= 0) return null;

  return (
    <RankRail
      total={total}
      anchorRank={rail.anchorRank}
      visible={rail.visible}
      orientation={horizontal ? "horizontal" : "vertical"}
      onJump={(position) => rail.jump(position, total)}
      follow={rail.follow}
      loading={loading}
    />
  );
};

const GridRail = ({
  visible,
  ...props
}: GridRailProps & { visible: boolean }) =>
  visible ? <GridRailContent {...props} /> : null;

export default React.memo(GridRail);
