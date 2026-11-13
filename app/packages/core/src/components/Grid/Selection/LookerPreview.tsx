import {
  VideoLooker,
  type ImageLooker,
  type ThreeDLooker,
} from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import type {
  EpisodeSelection,
  GridSampleNode,
} from "@fiftyone/state/src/selection";
import { useEffect, useMemo, useRef } from "react";
import styles from "./SelectionTray.module.css";
import { CARD_PREVIEW_HEIGHT } from "./theme";

type PreviewLooker = ImageLooker | VideoLooker | ThreeDLooker;
interface PreviewMetadata {
  aspectRatio: number;
  duration?: number;
}

/** A media-only grid Looker with captured crop/time and a card-owned lifetime. */
export default function LookerPreview({
  node,
  width,
  height = CARD_PREVIEW_HEIGHT,
  crop,
  sourceAspect,
  previewStart,
  onMetadata,
  onError,
}: {
  node: GridSampleNode;
  width: number;
  height?: number;
  crop?: EpisodeSelection["crop"];
  sourceAspect?: number;
  previewStart?: number;
  onMetadata?: (metadata: PreviewMetadata) => void;
  onError?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const looker = useRef<PreviewLooker>();
  const callbacks = useRef({ onMetadata, onError });
  callbacks.current = { onMetadata, onError };
  const { mediaFallback } = fos.useLookerOptions(false);
  const mediaField = fos.useSelectedMediaFieldGrid();
  const urls = fos.getNormalizedUrls(node.urls);
  const media = fos.resolveMediaFieldLooker({
    mediaField,
    sample: node.sample,
    urls,
  });
  const src = media.projectionField
    ? urls[`${media.projectionField}.filepath`]
    : media.hasSelectedMediaPath
      ? media.mediaFieldPath
      : mediaFallback
        ? urls.filepath
        : undefined;
  const metadata = node.sample.metadata;
  const frameRate =
    node.frameRate ??
    node.frame_rate ??
    (metadata &&
    typeof metadata === "object" &&
    "frame_rate" in metadata &&
    typeof metadata.frame_rate === "number"
      ? metadata.frame_rate
      : undefined);
  // Availability can return different labels or projected fields for the
  // same media. Those changes must not restart this media-only renderer.
  const mediaKey = JSON.stringify([
    node.id,
    src,
    media.nativeLookerType,
    node.sample.filepath,
    media.projectionField,
    frameRate,
  ]);
  const currentNode = useRef(node);
  currentNode.current = node;
  const sourceRatio =
    sourceAspect && Number.isFinite(sourceAspect) && sourceAspect > 0
      ? sourceAspect
      : crop
        ? 1
        : width / height;
  const aspect = crop ? (sourceRatio * crop[2]) / crop[3] : sourceRatio;
  const previewWidth = Math.min(width, height * aspect);
  const previewHeight = previewWidth / aspect;
  const options = useMemo(() => {
    // Fit the exact captured patch, independent of visible label fields. Pan
    // and zoom keep the canvas thumbnail-sized even for a very small crop.
    const fitWidth = Math.min(previewWidth, previewHeight * sourceRatio);
    const fitHeight = fitWidth / sourceRatio;
    const scale = crop
      ? Math.min(
          previewWidth / (fitWidth * crop[2]),
          previewHeight / (fitHeight * crop[3]),
        )
      : 1;
    return {
      mediaFallback,
      activePaths: [],
      showOverlays: false,
      showPatchLabels: false,
      selected: false,
      inSelectionMode: false,
      showControls: false,
      showTooltip: false,
      shouldHandleKeyEvents: false,
      zoom: false,
      initialViewport: crop
        ? {
            scale,
            panX:
              previewWidth / 2 -
              scale *
                ((previewWidth - fitWidth) / 2 +
                  fitWidth * (crop[0] + crop[2] / 2)),
            panY:
              previewHeight / 2 -
              scale *
                ((previewHeight - fitHeight) / 2 +
                  fitHeight * (crop[1] + crop[3] / 2)),
          }
        : null,
    };
  }, [mediaFallback, crop, sourceRatio, previewWidth, previewHeight]);
  const createLooker = fos.useCreateLooker<PreviewLooker>(false, true, options);
  const start = useRef(previewStart);
  start.current = previewStart;
  const posterStart = useRef<number | null>(null);

  // Each mount owns a separate renderer; leaving the viewport destroys it.
  useEffect(() => {
    if (!host.current) return undefined;
    host.current.setAttribute("inert", "");
    const node = currentNode.current;
    posterStart.current = start.current ?? null;
    const fail = () => callbacks.current.onError?.();
    const instance = createLooker.current(
      {
        ...node,
        urls: node.urls,
        frameNumber: undefined,
        frameRate,
        symbol: undefined,
      },
      {},
      { onError: fail, posterSeconds: start.current },
    );
    looker.current = instance;
    const loaded = () => {
      if (instance.state.error) return;
      const dimensions = instance.state.dimensions;
      if (dimensions?.[0] && dimensions[1]) {
        callbacks.current.onMetadata?.({
          aspectRatio: dimensions[0] / dimensions[1],
          duration:
            instance instanceof VideoLooker
              ? (instance.duration ?? undefined)
              : undefined,
        });
      }
      if (
        instance instanceof VideoLooker &&
        posterStart.current !== (start.current ?? null)
      ) {
        posterStart.current = start.current ?? null;
        instance.posterAt(posterStart.current);
      }
    };
    instance.addEventListener("load", loaded);
    const unsubscribe = instance.subscribeToState("error", (error: unknown) => {
      if (error) fail();
    });
    instance.attach(host.current);
    if (instance.loaded) loaded();
    return () => {
      unsubscribe();
      instance.destroy();
      looker.current = undefined;
    };
  }, [createLooker, mediaKey, mediaField, mediaFallback, frameRate]);

  // Resize before applying the captured viewport so the crop uses this size.
  useEffect(() => {
    looker.current?.resize([previewWidth, previewHeight]);
    // No label fields are active, so geometry changes need no sample reload.
    looker.current?.updateOptions(options, true);
  }, [
    options,
    previewWidth,
    previewHeight,
    mediaKey,
    mediaField,
    mediaFallback,
  ]);

  // Captured times can change without replacing the sample or renderer.
  useEffect(() => {
    if (
      looker.current instanceof VideoLooker &&
      looker.current.loaded &&
      !looker.current.state.error &&
      posterStart.current !== (previewStart ?? null)
    ) {
      posterStart.current = previewStart ?? null;
      looker.current.posterAt(posterStart.current);
    }
  }, [previewStart]);

  return (
    <div
      className={styles.crop}
      style={{ width: previewWidth, height: previewHeight }}
    >
      <div
        ref={host}
        className={`${styles.lookerHost} ${styles.media}`}
        aria-hidden="true"
      />
    </div>
  );
}
