/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import gridStyles from "../Grid.module.css";
import styles from "./Strips.module.css";

import clsx from "clsx";
import { useContext, useMemo } from "react";
import { offsetRanks } from "../../rail/jump";
import RankRail from "../../rail/RankRail";
import useRail from "../../rail/useRail";
import { PAGE_SIZE } from "../useSpotlightPager";
import { StripsContext } from "./context";
import useStrip from "./useStrip";
import type { StripSource } from "./useStripSource";

/**
 * A strip whose scrollbar is a rank rail over its own samples; a jump
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
  const ranks = useMemo(
    () => offsetRanks(strips.records, recordBase, span),
    [recordBase, span, strips.records],
  );
  const rail = useRail({
    container: ref,
    horizontal: true,
    host,
    instance,
    pageSize: PAGE_SIZE,
    ranks,
  });

  return (
    <>
      <div ref={ref} className={clsx(styles.host, gridStyles.railOn)} />
      <div className={className}>
        <RankRail
          aria-label="Lane rail"
          anchorRank={rail.anchorRank}
          onJump={(position) => rail.jump(position, total)}
          orientation="horizontal"
          total={total}
          visible={rail.visible}
        />
      </div>
    </>
  );
}
