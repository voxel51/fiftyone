/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import gridStyles from "../Grid.module.css";
import styles from "./Strips.module.css";

import clsx from "clsx";
import { type CSSProperties, useContext, useRef } from "react";
import type { PageVariables } from "../samplePages";
import { StripsContext } from "./context";
import useStrip, { useNearViewport } from "./useStrip";
import useStripSource, { type StripSource } from "./useStripSource";
import RailedStripHost from "./RailedStripHost";

/** Maps the [-15, -1] zoom setting to a strip height in pixels. */
export const trackHeight = (zoom: number, min: number, step: number) =>
  Math.round(min + (Math.min(Math.max(zoom, -15), -1) + 15) * step);

const StripHost = ({ source }: { source: StripSource }) => (
  <div ref={useStrip(source).ref} className={styles.host} />
);

/**
 * A horizontal strip of the samples `variables` pages through. Its instances
 * exist only while it is near the scroller's viewport.
 */
export default function StripTrack({
  className,
  rail,
  recordBase = 0,
  style,
  variables,
}: {
  className?: string;
  recordBase?: number;
  style?: CSSProperties;
  variables: PageVariables;
  /** A rank rail over the strip's `total` samples, in place of its scrollbar. */
  rail?: { total: number; span: number; className?: string };
}) {
  const strips = useContext(StripsContext);
  const track = useRef<HTMLDivElement>(null);
  const near = useNearViewport(track, strips?.root ?? null);
  const { count, source } = useStripSource(variables, recordBase);

  return (
    <div ref={track} className={clsx(styles.track, className)} style={style}>
      {count === null && <div className={gridStyles.swimlaneShimmer} />}
      {count === 0 && (
        <div className={styles.empty} title="No samples">
          –
        </div>
      )}
      {near &&
        count !== 0 &&
        (rail ? (
          <RailedStripHost
            className={rail.className}
            recordBase={recordBase}
            source={source}
            span={rail.span}
            total={rail.total}
          />
        ) : (
          <StripHost source={source} />
        ))}
    </div>
  );
}
