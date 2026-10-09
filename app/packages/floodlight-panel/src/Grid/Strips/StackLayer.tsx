/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import gridStyles from "../Grid.module.css";
import styles from "./Strips.module.css";

import type { ID } from "@fiftyone/floodlight";
import type * as fos from "@fiftyone/state";
import {
  type CSSProperties,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { StripsContext } from "./context";
import { reducedMotion } from "./flip";
import { createLayerSlot } from "./stackHandoff";
import {
  type Box,
  css,
  depthTransform,
  flyTransform,
  layerDim,
  MOTION_MS,
} from "./stackLayout";
import { STACK_DEPTH } from "./stackModel";

export type Enter = "front" | "back" | null;

export interface StackLayerProps {
  /** This item's rect at its native aspect ratio, before the depth transform. */
  rect: Box;
  /** Distance behind the front, or `null` while flying out toward the viewer. */
  depth: number | null;
  enter: Enter;
  /** Mid-flight: reattach at the looker's last size rather than resize it. */
  flying?: boolean;
  /** Whether this layer shows its looker (not while the grid has it). */
  holding: boolean;
  id: ID;
  register: (description: string, element: HTMLDivElement | null) => void;
  step: number;
}

const restingStyle = (
  rect: Box,
  depth: number | null,
  step: number,
): CSSProperties => ({
  left: rect.left,
  top: rect.top,
  width: rect.width,
  height: rect.height,
  opacity: depth === null ? 0 : 1,
  transform: css(
    depth === null ? flyTransform(rect) : depthTransform(depth, rect, step),
  ),
  zIndex: depth === null ? STACK_DEPTH + 1 : STACK_DEPTH - depth,
  ["--dim" as string]: layerDim(depth ?? 0),
  // the leaving item flies at the viewer, so its shadow grows past the front's
  ["--d" as string]: depth ?? -1,
});

const StackLayer = ({
  rect,
  depth,
  enter,
  flying = false,
  holding,
  id,
  register,
  step,
}: StackLayerProps) => {
  const strips = useContext(StripsContext)!;
  const ref = useRef<HTMLDivElement | null>(null);
  const slot = useMemo(
    () =>
      createLayerSlot<fos.Sample>(
        {
          detachItem: (item) => strips.renderer.current.detachItem(item),
          hideItem: (item) => strips.renderer.current.hideItem(item),
          showItem: (item) => strips.renderer.current.showItem(item),
        },
        strips.ownership,
        {
          has: strips.hasItem,
          shimmer: (element) => element.classList.add(gridStyles.tileShimmer),
          sizes: strips.lastSizes,
        },
      ),
    [strips],
  );
  const shows = holding && depth !== null;
  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      ref.current = element;
      register(id.description, element);
    },
    [id, register],
  );

  useEffect(() => {
    const element = ref.current;
    if (!shows || !element || !rect.width || !rect.height) return undefined;
    // shimmer until the looker loads; the size promise resolves at its load
    element.classList.add(gridStyles.tileShimmer);
    const loaded = () => element.classList.remove(gridStyles.tileShimmer);
    slot
      .show(id, element, [rect.width, rect.height], flying)
      .then((shown) => shown && loaded(), loaded);
    return () => {
      loaded();
      slot.suspend();
    };
  }, [flying, rect.height, rect.width, id, shows, slot]);

  useEffect(() => () => slot.release(id), [id, slot]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !enter || depth === null || reducedMotion()) return;
    const rest = css(depthTransform(depth, rect, step));
    const from =
      enter === "front"
        ? css(flyTransform(rect))
        : css(depthTransform(depth + 1, rect, step));
    element.animate?.(
      [
        { opacity: 0, transform: from },
        { opacity: 1, transform: rest },
      ],
      { duration: MOTION_MS, easing: "ease-out" },
    );
    // only a newly mounted layer enters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={setRef}
      className={styles.layer}
      data-front={depth === 0 || undefined}
      style={restingStyle(rect, depth, step)}
    />
  );
};

export default memo(StackLayer);
