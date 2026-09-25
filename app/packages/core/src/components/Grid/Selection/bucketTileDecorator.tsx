import {
  selectionBucketGesture,
  selectionBucketTitle,
  useSelectionBuckets,
  useSelectionMembership,
  type SelectionUnit,
} from "@fiftyone/state/src/selection";
import { useEffect } from "react";
import { useIsTileSelectionHovered } from "../gridTileRegistry";
import type { GridSelectionClick } from "../useGridSelectionClick";
import {
  registerTileDecorator,
  unregisterTileDecorator,
  type TileDecoratorSample,
} from "../tileDecorators";
import BucketAvatar from "./BucketAvatar";
import { gestureLabel, useHeldGesture } from "./bucketGestures";
import styles from "./SelectionTray.module.css";
import { trayTheme } from "./theme";

const DECORATOR_ID = "fo-selection-buckets";

/** What tile chips need from the grid: identity and a selection handler. */
export interface TileBucketController {
  readonly datasetId: string;
  readonly domainId: string;
  readonly unit: SelectionUnit;
  readonly select: GridSelectionClick;
}

// The grid publishes its controller here for chips rendered elsewhere in
// the tree. Reactive state (layout, membership, hover) comes from atoms and
// the tile registry; only the imperative selection handler rides along.
const bridge: { current: TileBucketController | null } = { current: null };

function sampleIdOf(sample: TileDecoratorSample): string | null {
  const id = sample._id ?? sample.id;
  return typeof id === "string" ? id : null;
}

/**
 * The per-tile alternative to modifier clicks: one chip per bucket at the
 * tile's top-left corner. Chips for buckets holding the tile stay visible,
 * so a tile in several buckets shows several marks; the others appear on
 * hover over the top 40% so any bucket is one click away. Holding a
 * modifier lights the chip its click would reach.
 */
export function BucketTileChips({
  sampleId,
  datasetId,
  domainId,
  unit,
}: {
  sampleId: string;
  datasetId: string;
  domainId: string;
  unit: SelectionUnit;
}) {
  const buckets = useSelectionBuckets(datasetId);
  const membership = useSelectionMembership(domainId);
  const hovered = useIsTileSelectionHovered(sampleId);
  const held = useHeldGesture();
  if (buckets.length < 2) return null;
  const mine = new Set(membership.get(sampleId) ?? []);
  if (!mine.size && !hovered) return null;
  const armed =
    held === "command" ? buckets[1] : held === "option" ? buckets[2] : null;
  return (
    <div
      className={styles.tileChips}
      style={trayTheme}
      role="group"
      aria-label={`Selection buckets for this ${unit.one}`}
    >
      {buckets.map((bucket, index) => {
        const member = mine.has(bucket.id);
        if (!member && !hovered) return null;
        const title = selectionBucketTitle(bucket, index);
        const verb = member ? "Remove from" : "Add to";
        return (
          <button
            key={bucket.id}
            type="button"
            className={styles.tileChip}
            data-member={member || undefined}
            data-armed={(hovered && armed?.id === bucket.id) || undefined}
            aria-pressed={member}
            aria-label={`${verb} ${title}`}
            title={`${verb} ${title} (${gestureLabel(
              selectionBucketGesture(index),
            )}); Shift-click to select a range`}
            // Capture-phase handlers run before Spotlight's own click
            // listener on the tile, so stopping here keeps a chip click from
            // opening the sample; a right-click on a chip is likewise not a
            // tile activation.
            onClickCapture={(event) => {
              event.stopPropagation();
              event.preventDefault();
              void bridge.current?.select(sampleId, bucket.id, event.shiftKey);
            }}
            onContextMenuCapture={(event) => {
              event.stopPropagation();
              event.preventDefault();
            }}
          >
            <BucketAvatar bucket={bucket} index={index} size="xs" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Registers the tile chips while the grid uses several buckets, and keeps
 * the controller the chips call current. Nothing is registered for the
 * single-bucket tray, so browse mode pays nothing for the feature.
 */
export function useBucketTileDecorator(
  enabled: boolean,
  controller: TileBucketController,
) {
  bridge.current = controller;
  // This effect publishes the decorator to the tile registry for the life of
  // the multi-bucket tray, and withdraws it when the tray narrows or unmounts.
  useEffect(() => {
    if (!enabled) return undefined;
    registerTileDecorator({
      id: DECORATOR_ID,
      priority: 5,
      render: (sample) => {
        const current = bridge.current;
        const sampleId = sampleIdOf(sample);
        if (!current || !sampleId) return null;
        return (
          <BucketTileChips
            sampleId={sampleId}
            datasetId={current.datasetId}
            domainId={current.domainId}
            unit={current.unit}
          />
        );
      },
    });
    return () => unregisterTileDecorator(DECORATOR_ID);
  }, [enabled]);
  // This effect forgets the controller when the grid unmounts.
  useEffect(
    () => () => {
      bridge.current = null;
    },
    [],
  );
}
