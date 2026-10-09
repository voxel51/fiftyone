/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * One matrix cell's samples as a vertical Floodlight grid over the dimmed
 * matrix. The stack's layers fly out to their tiles on open, and the tiles
 * fly back into the stack, at the grid's top item, on the way back. As in
 * the main grid's resize, lookers keep their last size while moving (the
 * opening build and interim builds) and resize once in the content build.
 */

import gridStyles from "../Grid.module.css";
import styles from "./Strips.module.css";

import Spotlight from "@fiftyone/floodlight";
import type * as fos from "@fiftyone/state";
import { Button, IconName, Size, Variant } from "@voxel51/voodo";
import {
  type KeyboardEvent,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import type { Scoped } from "../../host/ownership";
import useHost from "../../host/useHost";
import useZoomSetting from "../useZoomSetting";
import { instanceGet } from "./cellSource";
import { StripsContext } from "./context";
import { type Expansion, ExpanderContext } from "./expansion";
import { fadeIn, flipFrom, type Rects, reducedMotion } from "./flip";
import { sizedRenderer, takeoverRenderer } from "./stackHandoff";
import { FLIP_MS } from "./stackLayout";

type Instance = Spotlight<number, fos.Sample>;

const flyIn = (from: Rects, tiles: Map<string, HTMLDivElement>) => {
  for (const [id, tile] of tiles) {
    if (!tile.isConnected) continue;
    const rect = from.get(id);
    rect ? flipFrom(tile, rect) : fadeIn(tile);
  }
};

export default function ExpandedCell({ expansion }: { expansion: Expansion }) {
  const strips = useContext(StripsContext)!;
  const expander = useContext(ExpanderContext)!;
  const zoom = useZoomSetting();
  const element = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const tiles = useRef(new Map<string, HTMLDivElement>());
  const registrations = useRef(new Map<Instance, () => void>());
  const scopes = useRef(new WeakMap<Instance, Scoped<number, fos.Sample>>());
  const settle = useRef<ReturnType<typeof setTimeout>>();
  const hostRef = useRef<{ instance?: Instance; rebuild: () => void }>();
  const opened = useRef(false);
  const closing = useRef(false);

  const { host } = useHost<number, Instance>({
    ref: element,
    axis: "width",
    build: (anchor, context) => {
      const start = anchor ?? expansion.anchor;
      const interim = context?.interim ?? false;
      const opening = !opened.current;
      opened.current = true;
      const scoped = takeoverRenderer<fos.Sample>(
        sizedRenderer(
          {
            detachItem: (id) => strips.renderer.current.detachItem(id),
            hideItem: (item) => strips.renderer.current.hideItem(item),
            showItem: (item) => strips.renderer.current.showItem(item),
          },
          {
            has: strips.hasItem,
            shimmer: (tile) => tile.classList.add(gridStyles.tileShimmer),
            sizes: strips.lastSizes,
          },
          interim || opening,
        ),
        strips.ownership,
      );
      // the visible instance keeps its lookers until the swap hands them over
      hostRef.current?.instance && scoped.defer();
      const spotlight = new Spotlight<number, fos.Sample>({
        ...scoped,
        at: start.at,
        get: instanceGet(expansion.source),
        key: start.key,
        offset: 0,
        rowAspectRatioThreshold: zoom,
        scrollbar: true,
        showItem: (item) => {
          tiles.current.set(item.id.description, item.element);
          return scoped.showItem(item);
        },
        spacing: strips.spacing,
      });
      scopes.current.set(spotlight, scoped);
      if (opening) {
        // added before the host's own listener, so tiles fly before paint
        const onLoad = () => {
          spotlight.removeEventListener("load", onLoad);
          flyIn(expansion.from, tiles.current);
          expander.land();
          // the flight over, a content build draws each looker at its size
          settle.current = setTimeout(
            () => hostRef.current?.rebuild(),
            reducedMotion() ? 0 : FLIP_MS,
          );
        };
        spotlight.addEventListener("load", onLoad);
      }
      interim ||
        registrations.current.set(spotlight, strips.register(spotlight));
      return spotlight;
    },
    onSwap: (next, previous) => {
      previous && scopes.current.get(previous)?.retire();
      scopes.current.get(next)?.flush();
    },
    onDispose: (instance) => {
      registrations.current.get(instance)?.();
      registrations.current.delete(instance);
    },
  });
  hostRef.current = host;
  useEffect(() => () => clearTimeout(settle.current), []);

  useEffect(() => {
    host?.rebuild(expansion.anchor);
    panel.current?.focus({ preventScroll: true });
    // the host rebuilds itself on resize; the anchor is only the start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);

  const settings = useRef({ spacing: strips.spacing, zoom });
  useEffect(() => {
    const last = settings.current;
    settings.current = { spacing: strips.spacing, zoom };
    if (last.spacing !== strips.spacing || last.zoom !== zoom) host?.rebuild();
  }, [host, strips.spacing, zoom]);

  const back = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    const anchor = host?.anchor ?? expansion.anchor;
    const top = anchor.at?.description ?? expansion.anchor.at?.description;
    const ids = top ? await expansion.seek(top, anchor.key) : [];
    const from: Rects = new Map();
    for (const id of ids) {
      const tile = tiles.current.get(id);
      tile?.isConnected && from.set(id, tile.getBoundingClientRect());
    }
    expander.collapse(from);
  }, [expander, expansion, host]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    back();
  };

  return (
    <div className={styles.expansion}>
      <div className={styles.scrim} onClick={back} />
      <div
        ref={panel}
        aria-label={expansion.title}
        className={styles.expanded}
        onKeyDown={onKeyDown}
        role="dialog"
        tabIndex={-1}
      >
        <div className={styles.expandedHeader}>
          <Button
            leadingIcon={IconName.ArrowLeft}
            onClick={back}
            size={Size.Sm}
            title="Back to the matrix (Esc)"
            variant={Variant.Secondary}
          >
            Back
          </Button>
          <button className={styles.expandedTitle} onClick={back} type="button">
            {expansion.title}
          </button>
        </div>
        <div ref={element} className={styles.expandedGrid} />
      </div>
    </div>
  );
}
