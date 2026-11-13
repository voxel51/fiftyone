import {
  selectionBucketIcon,
  selectionBucketTitle,
  useActiveSelectionBucket,
  useSelectionBuckets,
  useSelectionMembership,
  type SelectionUnit,
} from "@fiftyone/state/src/selection";
import { useEffect } from "react";
import type { GridSelectionClick } from "../useGridSelectionClick";
import {
  registerTileDecorator,
  unregisterTileDecorator,
  type TileDecoratorSample,
} from "../tileDecorators";
import SectionShape from "./SectionShape";
import styles from "./SelectionTray.module.css";
import { trayTheme } from "./theme";

const DECORATOR_ID = "fo-selection-buckets";

/** What section checkboxes need from the grid: identity and a selection handler. */
export interface TileBucketController {
  readonly datasetId: string;
  readonly domainId: string;
  readonly unit: SelectionUnit;
  readonly select: GridSelectionClick;
}

// The grid publishes its controller here for checkboxes rendered elsewhere in
// the tree. Reactive state (layout, membership) comes from atoms; only the
// imperative selection handler rides along.
const bridge: { current: TileBucketController | null } = { current: null };

function sampleIdOf(sample: TileDecoratorSample): string | null {
  const id = sample._id ?? sample.id;
  return typeof id === "string" ? id : null;
}

/**
 * A split tray's checkbox. Unpicked, a tile shows the shape of the active
 * section, where a pick would land, where its checkbox sits and only while
 * the pointer is over the tile's top; picked, it fills, holding the shape of
 * every section that has the tile. Pressing it works like the checkbox.
 */
export function SectionCheckbox({
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
  const { active } = useActiveSelectionBucket(domainId);
  if (buckets.length < 2) return null;
  const mine = new Set(membership.get(sampleId) ?? []);
  const picked = buckets.some((bucket) => mine.has(bucket.id));
  const shown = buckets
    .map((bucket, index) => ({ bucket, index }))
    .filter(({ bucket }) =>
      picked ? mine.has(bucket.id) : bucket.id === active,
    );
  const names = shown
    .map(({ bucket, index }) => selectionBucketTitle(bucket, index))
    .join(", ");
  const label = picked
    ? `This ${unit.one} is in ${names}`
    : `Pick this ${unit.one} into ${names}`;
  return (
    <button
      type="button"
      className={styles.tileSelect}
      style={trayTheme}
      data-picked={picked || undefined}
      aria-pressed={picked}
      aria-label={label}
      title={label}
      // Capture-phase handlers run before Spotlight's own click listener on
      // the tile, so stopping here keeps a press from opening the sample; a
      // right-click on it is likewise not a tile activation.
      onClickCapture={(event) => {
        event.stopPropagation();
        event.preventDefault();
        void bridge.current?.select(sampleId, event.shiftKey);
      }}
      onContextMenuCapture={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
    >
      {shown.map(({ bucket, index }) => (
        <SectionShape
          key={bucket.id}
          shape={selectionBucketIcon(bucket, index)}
          size={picked ? 14 : 18}
        />
      ))}
    </button>
  );
}

/**
 * Registers the section checkboxes while the tray is split, and keeps the
 * controller they call current. Nothing is registered for one strip,
 * so browse mode pays nothing for the feature.
 */
export function useBucketTileDecorator(
  enabled: boolean,
  controller: TileBucketController,
) {
  bridge.current = controller;
  // This effect publishes the decorator to the tile registry for the life of
  // the split tray, and withdraws it when the tray merges or unmounts.
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
          <SectionCheckbox
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
