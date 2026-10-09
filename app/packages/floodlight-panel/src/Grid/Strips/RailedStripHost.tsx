/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import gridStyles from "../Grid.module.css";
import styles from "./Strips.module.css";

import clsx from "clsx";
import { useCallback, useContext, useMemo } from "react";
import { laneOffsets, offsetAnchor } from "../../rail/jump";
import {
  offsetLabel,
  offsetTicks,
  positionToOffset,
  thumbPosition,
  thumbSpan,
} from "../../rail/model";
import Rail from "../../rail/Rail";
import useRail from "../../rail/useRail";
import { MIN_SPAN } from "../railModes";
import { STRIP_PAGE_SIZE } from "../samplePages";
import { StripsContext } from "./context";
import useStrip from "./useStrip";
import type { StripSource } from "./useStripSource";

const TICKS = 5;

/**
 * A strip whose scrollbar is an offset rail over its own samples; a jump
 * rebuilds this strip's host at the target page.
 */
export default function RailedStripHost({
  className,
  recordBase,
  source,
  span,
  total,
}: {
  className?: string;
  recordBase: number;
  source: StripSource;
  span: number;
  total: number;
}) {
  const strips = useContext(StripsContext)!;
  const { host, instance, ref } = useStrip(source, false);
  const offsets = useMemo(
    () => laneOffsets(strips.records, recordBase, span),
    [recordBase, span, strips.records],
  );
  const fractionOf = useCallback(
    (id: string) => {
      const offset = offsets.get(id);
      return offset === undefined || total <= 0 ? undefined : offset / total;
    },
    [offsets, total],
  );
  const rail = useRail({ fractionOf, host, instance, perItem: 1 / total });
  const ticks = useMemo(() => offsetTicks(total, TICKS), [total]);
  const toPosition = (fraction: number) =>
    thumbPosition(Math.round(fraction * total), total, rail.visible);
  const follow = useCallback(
    (listener: (position: number) => void) =>
      rail.follow((fraction) =>
        listener(
          thumbPosition(Math.round(fraction * total), total, rail.visible),
        ),
      ),
    [rail, total],
  );

  return (
    <>
      <div ref={ref} className={clsx(styles.host, gridStyles.railOn)} />
      <div className={className}>
        <Rail
          aria-label="Lane rail"
          follow={follow}
          label={(position) =>
            offsetLabel(positionToOffset(position, total, rail.visible), total)
          }
          onJump={(position) =>
            host?.rebuild(
              offsetAnchor(
                positionToOffset(position, total, rail.visible),
                STRIP_PAGE_SIZE,
                offsets,
              ),
            )
          }
          orientation="horizontal"
          position={
            rail.fraction === undefined ? undefined : toPosition(rail.fraction)
          }
          span={thumbSpan(rail.visible, total, MIN_SPAN)}
          ticks={ticks}
        />
      </div>
    </>
  );
}
