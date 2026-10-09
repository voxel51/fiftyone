/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Which rail a grid order gets. SMALL orders rail over offsets ("n of N");
 * INDEXED orders with a scale rail over sort values; INDEXED orders of
 * strings or booleans jump by value only; SCROLL orders, and views the
 * server cannot order, get a plain scrollbar and are never sought.
 */

import type { Anchor } from "../host/createHost";
import {
  fractionJump,
  type JumpPlan,
  type Offsets,
  offsetAnchor,
} from "../rail/jump";
import {
  offsetLabel,
  positionToOffset,
  type RailTick,
  thumbPosition,
  thumbSpan,
} from "../rail/model";
import { scaleEnds, valueAt, valueLabel } from "../rail/values";
import type { OpenedOrder, OrderBounds } from "../order/order";

/** The thumb's least share of the track. */
export const MIN_SPAN = 0.03;
/** A value rail has no count to size its thumb by. */
export const VALUE_SPAN = 0.04;

export interface RailedMode {
  kind: "offset" | "value";
  ticks: RailTick[];
  /** The fraction one item spans, when counted */
  perItem?: number;
  span: (visible?: number) => number;
  /** The thumb's place for the top item's fraction */
  position: (fraction: number, visible?: number) => number;
  label: (position: number, visible?: number) => string;
  jump: (
    position: number,
    visible: number | undefined,
    loaded: { sequences: Offsets; fractions: Offsets },
    pageSize: number,
  ) => JumpPlan;
}

export type GridRailMode =
  | RailedMode
  | { kind: "values"; bounds: OrderBounds }
  | { kind: "none" };

const NONE = { kind: "none" } as const;

export const gridRailMode = (
  order: OpenedOrder | undefined,
  paged: boolean,
): GridRailMode => {
  if (order?.kind !== "order" || paged) return NONE;
  const ticks = order.ticks.map(({ fraction, label }) => ({
    position: fraction,
    label,
  }));

  if (order.mode === "SMALL") {
    const total = order.total ?? 0;
    if (total <= 0) return NONE;
    const offsetAt = (position: number, visible?: number) =>
      positionToOffset(position, total, visible);
    return {
      kind: "offset",
      ticks,
      perItem: 1 / total,
      span: (visible) => thumbSpan(visible, total, MIN_SPAN),
      position: (fraction, visible) =>
        thumbPosition(Math.round(fraction * total), total, visible),
      label: (position, visible) =>
        offsetLabel(offsetAt(position, visible), total),
      jump: (position, visible, { sequences }, pageSize) => ({
        anchor: offsetAnchor(offsetAt(position, visible), pageSize, sequences),
      }),
    };
  }

  if (order.mode !== "INDEXED" || !order.bounds) return NONE;
  const ends = scaleEnds(order.bounds, order.desc);
  if (!ends) return { kind: "values", bounds: order.bounds };

  return {
    kind: "value",
    ticks,
    span: () => VALUE_SPAN,
    position: (fraction) => fraction,
    label: (position) => valueLabel(valueAt(position, ends), ends),
    jump: (position, _visible, { fractions, sequences }, pageSize) =>
      fractionJump(position, pageSize, sequences, fractions),
  };
};

export const isRailed = (mode: GridRailMode): mode is RailedMode =>
  mode.kind === "offset" || mode.kind === "value";

export type { Anchor };
