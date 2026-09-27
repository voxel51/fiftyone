/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import gridStyles from "../Grid.module.css";
import styles from "./Strips.module.css";

import clsx from "clsx";
import type { CSSProperties } from "react";
import type { PageVariables } from "../samplePages";
import useStrip from "./useStrip";

/** Maps the [-15, -1] zoom setting to a strip height in pixels. */
export const trackHeight = (zoom: number, min: number, step: number) =>
  Math.round(min + (Math.min(Math.max(zoom, -15), -1) + 15) * step);

/** A horizontal strip of the samples `variables` pages through. */
export default function StripTrack({
  className,
  recordBase,
  style,
  variables,
}: {
  className?: string;
  recordBase?: number;
  style?: CSSProperties;
  variables: PageVariables;
}) {
  const { count, host } = useStrip(variables, recordBase);

  return (
    <div className={clsx(styles.track, className)} style={style}>
      {count === null && <div className={gridStyles.swimlaneShimmer} />}
      {count === 0 && (
        <div className={styles.empty} title="No samples">
          –
        </div>
      )}
      <div ref={host} className={styles.host} />
    </div>
  );
}
