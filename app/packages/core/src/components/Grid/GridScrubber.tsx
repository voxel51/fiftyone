/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Right-edge vertical scrubber for the Grid. Mounted only when the user
 * has the scrubber toggle on (`useGridScrubber`) — the outer component
 * short-circuits before any selectors run, so the bounds aggregation is
 * not subscribed to until the feature is actually in use.
 *
 * The inner component requires the current sort field's `[min, max]`
 * bounds to have resolved (`useGridSortFieldBounds`). The bounds selector
 * only emits a value for numeric / date sort fields (via
 * `VALID_NUMERIC_TYPES`); string sort fields short-circuit to `null` and
 * the scrubber renders nothing.
 *
 * The seek action (mapping a scrub value back into the grid's pagination
 * cursor) is wired in a separate change; this component currently tracks
 * the scrub value locally so the visual integration can be validated
 * against a real dataset.
 */

import * as fos from "@fiftyone/state";
import { Orientation, Scrubber } from "@voxel51/voodo";
import React, { useCallback, useEffect, useState } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import styles from "./Grid.module.css";
import { gridAt, gridOffset, gridPage } from "./recoil";
import { PAGE_SIZE } from "./useSpotlightPager";

const NUM_TICKS = 10;

/**
 * Pick a precision wide enough to distinguish consecutive ticks. With
 * uniformly spaced ticks of size `step`, two adjacent values differ in
 * roughly `floor(log10(step))`-th place; we round to one extra digit so
 * 0.0–1.0 renders as `0.10, 0.20, …` and not all `0`.
 */
const formatTick = (n: number, step: number): string => {
  const abs = Math.abs(n);

  // Very small (or exactly zero) step → render the number on its own.
  if (!Number.isFinite(step) || step <= 0) {
    return abs >= 1000 ? `${(n / 1000).toPrecision(3)}k` : n.toPrecision(3);
  }

  // Abbreviate large magnitudes (revenue-style: 12.3k, 4.5M, 1.2B).
  if (abs >= 1e9) return `${(n / 1e9).toPrecision(3)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toPrecision(3)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toPrecision(3)}k`;

  // Otherwise compute decimal places from the tick spacing so neighboring
  // ticks remain distinguishable. Clamp to a sane window.
  const digits = Math.max(0, Math.min(6, Math.ceil(-Math.log10(step)) + 1));
  return n.toFixed(digits);
};

const GridScrubberContent = () => {
  const sort = useRecoilValue(fos.gridSortBy);
  const bounds = fos.useGridSortFieldBounds();
  const [scrubbing, setScrubbing] = fos.useGridScrubbing();
  const commitCursor = fos.useCommitGridScrubCursor();
  const page = useRecoilValue(gridPage);
  // Current committed scrub cursor (the value the grid was *seeked to*).
  // Under cursor pagination, `gridPage = 0` means "at the cursor", not
  // "top of the collection" — so the thumb's resting position after a
  // release is the cursor itself, not `min`.
  const dsid = useRecoilValue(fos.datasetId) ?? "";
  const scrubCursor = useRecoilValue(fos.gridScrubCursor(dsid));
  // Total-collection count under the current view/filters. Used as the
  // denominator for converting `gridPage * PAGE_SIZE` into a normalized
  // scroll fraction that drives the scrubber thumb when the user is
  // wheeling the grid (i.e. not actively dragging).
  const total = useRecoilValue(
    fos.count({ extended: false, path: "", modal: false, lightning: true })
  );

  const [value, _setValue] = useState<number>(0);
  const setValue = useCallback((next: number) => _setValue(next), []);

  // Reset the grid's scroll-tracking atoms so the next Spotlight mount
  // (triggered by the cursor change in `useRefreshers`) starts at row 0.
  // Without this, the stale `gridPage` from before the scrub would still
  // be in the atom — the wheel→scrubber effect below would then add that
  // page-fraction on top of the cursor and the thumb would land past the
  // user's release point.
  const resetScrollAtoms = useRecoilCallback(
    ({ reset }) =>
      () => {
        reset(gridAt);
        reset(gridPage);
        reset(gridOffset);
      },
    []
  );

  // Release handler: stop scrubbing AND commit the cursor. Bumping the
  // cursor changes `pageReset` in `useRefreshers`, which remounts
  // Spotlight at the new AT (a `match({sort_field: {$gt|$lt: value}})`
  // server-side seek under `cursor_pagination=true`).
  //
  // Clamp the committed cursor to just inside the upper bound (or lower
  // bound when descending). At an exact boundary, the server's strict
  // inequality (`$gt: max` / `$lt: min`) matches zero rows and the grid
  // breaks. Pulling in by a fraction of the range guarantees the seek
  // always lands at least one sample, giving the user the tail (or
  // head) of the dataset instead of an empty page.
  const commit = useCallback(
    (next: number) => {
      let value = next;
      if (bounds) {
        const [bMin, bMax] = bounds;
        const range = bMax - bMin;
        // Tiny epsilon — small enough not to skew the visual position,
        // large enough to clear floating-point comparison noise.
        const eps = range > 0 ? range * 1e-6 : 0;
        if (sort?.descending) {
          if (value <= bMin) value = bMin + eps;
        } else {
          if (value >= bMax) value = bMax - eps;
        }
      }
      _setValue(value);
      setScrubbing(false);
      resetScrollAtoms();
      commitCursor(String(value));
    },
    [bounds, commitCursor, resetScrollAtoms, setScrubbing, sort?.descending]
  );

  // Wheel → scrubber: when the user is NOT actively scrubbing, follow the
  // grid's current scroll position.
  //
  // Under cursor pagination, `gridPage = 0` corresponds to the committed
  // scrub cursor, not the top of the collection. So the math is:
  //
  //   anchorFraction = cursor ? (cursor − min) / range : 0
  //   pageFraction   = (gridPage * PAGE_SIZE) / total
  //   value          = min + (anchorFraction + pageFraction) * range
  //
  // This way the thumb stays at the released value (cursor) at the moment
  // of remount, and advances as the user wheels further into the seeked
  // region. Descending sort inverts both anchor and advance.
  useEffect(() => {
    if (scrubbing || !bounds) return;
    const denom = typeof total === "number" && total > 0 ? total : null;
    const [min, max] = bounds;
    const range = max - min;

    let anchor: number;
    const cursorValue = scrubCursor !== null ? Number(scrubCursor) : null;
    if (cursorValue !== null && Number.isFinite(cursorValue)) {
      anchor = range === 0 ? 0 : (cursorValue - min) / range;
    } else if (denom === null) {
      _setValue(sort?.descending ? max : min);
      return;
    } else {
      anchor = 0;
    }

    const pageFraction = denom === null ? 0 : (page * PAGE_SIZE) / denom;
    const advance = sort?.descending ? -pageFraction : pageFraction;
    const fraction = Math.min(1, Math.max(0, anchor + advance));
    _setValue(min + fraction * range);
  }, [bounds, page, scrubCursor, scrubbing, sort?.descending, total]);

  // No sort field (toggle should already be hidden) or bounds aggregation
  // hasn't resolved yet → render nothing. The toggle stays visible so the
  // user knows the feature is engaged, but the rail itself only appears
  // once it can be operated meaningfully.
  if (!sort || !bounds) return null;

  const [min, max] = bounds;
  const step = (max - min) / NUM_TICKS;
  const ticks: number[] = [];
  for (let i = 0; i <= NUM_TICKS; i++) ticks.push(min + i * step);

  const renderTick = (n: number) => formatTick(n, step);
  // The active-value label uses a finer "step" so it can read out values
  // between ticks at meaningful precision (e.g. 0.234 between ticks at
  // 0.2 and 0.3).
  const renderActive = (n: number) =>
    `${sort.field}: ${formatTick(n, step / 10)}`;

  return (
    <div className={styles.gridScrubber}>
      <Scrubber
        min={min}
        max={max}
        value={value}
        // While dragging: just update the visual; the falling-pixels
        // overlay is already revealed by `onScrubStart` flipping the
        // `gridScrubbing` atom.
        onScrub={setValue}
        // Pointer-down on the track → reveal falling pixels for the
        // duration of the drag.
        onScrubStart={() => setScrubbing(true)}
        // Safety net for the "no change on release" path (e.g. the user
        // pressed and released without moving). `onChange` may not fire,
        // so clear the scrubbing flag here regardless.
        onScrubEnd={() => setScrubbing(false)}
        // Release with a new value → commit the cursor (drives Spotlight
        // remount) and clear the scrubbing flag. Pixels stay revealed
        // until the new Spotlight fires `load`.
        onChange={commit}
        editable
        ticks={ticks}
        renderTickLabel={renderTick}
        renderLabel={renderActive}
        orientation={Orientation.Column}
        aria-label="Grid scrubber"
      />
    </div>
  );
};

const GridScrubber = () => {
  const [enabled] = fos.useGridScrubber();
  // Gate at the outer component so the bounds aggregation in
  // `GridScrubberContent` is only ever subscribed to when the feature is
  // actually enabled.
  if (!enabled) return null;
  return <GridScrubberContent />;
};

export default React.memo(GridScrubber);
