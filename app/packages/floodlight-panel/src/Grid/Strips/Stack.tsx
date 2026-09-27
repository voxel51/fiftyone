/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * A matrix cell's samples as a depth stack: the front item at full size
 * and the next ones layered behind it. Option/Alt + wheel, pinch, or the
 * arrow and bracket keys (focused or hovered) move through depth; a click
 * expands the cell. A mounted stack is in view, since the matrix windows
 * its rows and columns.
 */

import gridStyles from "../Grid.module.css";
import styles from "./Strips.module.css";

import clsx from "clsx";
import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type { CellSource } from "./cellSource";
import { StripsContext } from "./context";
import { ExpanderContext } from "./expansion";
import { play, type Rects, reducedMotion } from "./flip";
import { HoverKeysContext } from "./hoverKeys";
import StackLayer, { type Enter } from "./StackLayer";
import {
  css,
  depthTransform,
  FLIP_MS,
  frontBox,
  invert,
  layerRect,
  layerStep,
} from "./stackLayout";
import { positionLabel, visibleLayers } from "./stackModel";
import { keyStep } from "./stackWheel";
import useElementSize, { type Size } from "./useElementSize";
import useLeavingLayers from "./useLeavingLayers";
import useStack from "./useStack";
import useStackGesture from "./useStackGesture";

const enterOf = (direction: number, depth: number): Enter =>
  direction > 0 ? "back" : direction < 0 ? (depth ? "back" : "front") : null;

export default function Stack({
  cell,
  className,
  holding = true,
  recordBase,
  size: given,
  source,
  style,
  title,
}: {
  cell: string;
  className?: string;
  /** Whether the layers show lookers; off for cells mounted ahead of view. */
  holding?: boolean;
  recordBase: number;
  /** The cell's content size; measured when not given. */
  size?: Size;
  source: CellSource;
  style?: CSSProperties;
  title: string;
}) {
  const strips = useContext(StripsContext)!;
  const expander = useContext(ExpanderContext)!;
  const hoverKeys = useContext(HoverKeysContext);
  const ref = useRef<HTMLDivElement>(null);
  const measured = useElementSize(ref, !given);
  const size = given ?? measured ?? { width: 0, height: 0 };
  const { seek, state, step } = useStack(source, true);
  useStackGesture(ref, step);

  const layers = visibleLayers(state);
  const ids = layers.map((entry) => entry.item.id.description);
  const track = useLeavingLayers(ids, state.position);
  const byId = useMemo(
    () =>
      new Map(state.entries.map((entry) => [entry.item.id.description, entry])),
    [state.entries],
  );

  const held = useRef(layers);
  held.current = holding && !expander.expanded ? layers : [];
  useEffect(
    () =>
      strips.register({
        updateItems: (updater) =>
          held.current.forEach((entry) => updater(entry.item.id)),
      }),
    [strips],
  );

  const elements = useRef(new Map<string, HTMLDivElement>());
  const register = useCallback(
    (id: string, element: HTMLDivElement | null) =>
      element ? elements.current.set(id, element) : elements.current.delete(id),
    [],
  );

  const box = useMemo(
    () =>
      size.width > 0 && size.height > 0
        ? frontBox(size.width, size.height)
        : null,
    [size.height, size.width],
  );
  const gap = layerStep(size.height);

  const hover = useRef({ step }).current;
  hover.step = step;
  useEffect(() => () => hoverKeys?.leave(hover), [hover, hoverKeys]);
  const expanded = expander.expanded?.cell === cell ? expander.expanded : null;

  const open = () => {
    const front = layers[0];
    if (!front || expander.expanded) return;
    const from: Rects = new Map();
    for (const id of ids) {
      const element = elements.current.get(id);
      element && from.set(id, element.getBoundingClientRect());
    }
    expander.expand({
      anchor: {
        key: front.page,
        at: { description: front.item.id.description },
      },
      cell,
      from,
      recordBase,
      seek: async (description, page) => {
        const next = await seek(description, page);
        return next
          ? visibleLayers(next).map((entry) => entry.item.id.description)
          : [];
      },
      source,
      title,
    });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const delta = keyStep(event.key);
    if (delta) {
      event.preventDefault();
      step(delta);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  };

  const returning = expander.returning;
  // mid-flight the layers keep the tiles' looker sizes; they resize once after
  const flying = returning?.cell === cell;
  useLayoutEffect(() => {
    if (returning?.cell !== cell) return undefined;
    const stack = ref.current;
    if (stack && box) {
      const { left, top } = stack.getBoundingClientRect();
      layers.forEach((entry, depth) => {
        const element = elements.current.get(entry.item.id.description);
        const from = returning.from.get(entry.item.id.description);
        if (!element || !from) return;
        const rect = layerRect(box, entry.item.aspectRatio);
        const base = { ...rect, left: left + rect.left, top: top + rect.top };
        play(
          element,
          invert(from, base),
          css(depthTransform(depth, rect, gap)),
        );
      });
    }
    const landed = setTimeout(expander.returned, reducedMotion() ? 0 : FLIP_MS);
    return () => clearTimeout(landed);
    // the layers fly back once, when this cell's return arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returning]);

  const loading = !state.entries.length && state.next !== null;
  const empty = !state.entries.length && state.next === null;

  return (
    <div
      ref={ref}
      aria-label={`${title}, ${positionLabel(state)}`}
      className={clsx(
        styles.stack,
        className,
        expanded?.landed && styles.stackAway,
        !state.entries.length && styles.stackIdle,
      )}
      onClick={open}
      onKeyDown={onKeyDown}
      onPointerEnter={() => hoverKeys?.enter(hover)}
      onPointerLeave={() => hoverKeys?.leave(hover)}
      role="button"
      style={style}
      tabIndex={empty ? -1 : 0}
      title={title}
    >
      {loading && <div className={gridStyles.swimlaneShimmer} />}
      {empty && (
        <div className={styles.empty} title="No samples">
          –
        </div>
      )}
      {box &&
        [
          ...track.leaving.flatMap((id) => {
            const entry = byId.get(id);
            return entry ? [{ entry, depth: null }] : [];
          }),
          ...layers.map((entry, depth) => ({ entry, depth })),
        ].map(({ entry, depth }) => (
          <StackLayer
            key={entry.item.id.description}
            rect={layerRect(box, entry.item.aspectRatio)}
            depth={depth}
            enter={depth === null ? null : enterOf(track.direction, depth)}
            flying={flying}
            holding={holding && !expanded}
            id={entry.item.id}
            register={register}
            step={gap}
          />
        ))}
      {state.entries.length > 0 && (
        <span className={styles.stackCount}>{positionLabel(state)}</span>
      )}
    </div>
  );
}
