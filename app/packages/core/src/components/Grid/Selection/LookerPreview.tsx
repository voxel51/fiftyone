import type { ThreeDLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import type { GridSampleNode } from "@fiftyone/state/src/selection";
import { useEffect, useMemo, useRef } from "react";
import styles from "./SelectionTray.module.css";
import { CARD_PREVIEW_HEIGHT } from "./theme";

/** Reuses the grid's 3D thumbnail, including projections and label overlays. */
export default function LookerPreview({
  node,
  width,
}: {
  node: GridSampleNode;
  width: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const looker = useRef<ThreeDLooker>();
  const gridOptions = fos.useLookerOptions(false);
  const mediaField = fos.useSelectedMediaFieldGrid();
  const options = useMemo(
    () => ({
      ...gridOptions,
      selected: false,
      inSelectionMode: false,
      showControls: false,
      showTooltip: false,
      shouldHandleKeyEvents: false,
    }),
    [gridOptions],
  );
  const createLooker = fos.useCreateLooker<ThreeDLooker>(false, true, options);

  // Attach the imperative grid renderer only while this preview is mounted.
  useEffect(() => {
    if (!host.current) return undefined;
    host.current.setAttribute("inert", "");
    const instance = createLooker.current({
      ...node,
      urls: node.urls,
      frameNumber: undefined,
      frameRate: undefined,
      symbol: undefined,
    });
    looker.current = instance;
    instance.attach(host.current);
    return () => {
      instance.destroy();
      looker.current = undefined;
    };
  }, [createLooker, node, mediaField]);

  // Track grid label visibility and coloring without rebuilding the preview.
  useEffect(() => {
    looker.current?.updateOptions(options);
  }, [options, node, mediaField]);

  // Thumbnail lookers accept dimensions explicitly instead of observing size.
  useEffect(() => {
    looker.current?.resize([width, CARD_PREVIEW_HEIGHT]);
  }, [width, node, mediaField]);

  return <div ref={host} className={styles.lookerHost} aria-hidden="true" />;
}
