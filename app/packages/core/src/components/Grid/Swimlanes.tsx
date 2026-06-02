/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Multi-lane grid view: one horizontal {@link Lane} per group slice.
 * Stacked vertically; each lane has its own horizontal scrollbar so
 * users can traverse a single slice's samples independently. The
 * container itself scrolls vertically when total lane height exceeds
 * the available space.
 *
 * Test target: quickstart-groups, three slices per group, sorted by an
 * indexed `index` field — picks up server-side sort and (eventually)
 * scrubber alignment across lanes.
 */

import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import styles from "./Grid.module.css";
import Lane from "./Lane";
import { maxGridItemsSizeBytes } from "./recoil";

const Swimlanes: React.FC = () => {
  const slices = useRecoilValue(fos.groupSlices);
  const maxBytes = useRecoilValue(maxGridItemsSizeBytes);

  // Equal byte share per lane. Once we have per-lane density signals
  // (number of samples, average size) we can weight this — but equal
  // shares are a reasonable default and avoid one lane starving the
  // others.
  const byteShare = slices.length > 0 ? 1 / slices.length : 1;

  return (
    <div className={styles.swimlanes}>
      {slices.map((slice) => (
        <Lane
          key={slice}
          slice={slice}
          byteShare={byteShare}
          maxBytes={maxBytes}
        />
      ))}
    </div>
  );
};

export default React.memo(Swimlanes);
