import * as fos from "@fiftyone/state";
import {
  sameSelection,
  type EpisodeSelection,
  type SelectionUnit,
  type useGridSelection,
} from "@fiftyone/state/src/selection";
import { isDirect3dSamplePath } from "@fiftyone/utilities";
import {
  BackgroundColor,
  Button,
  CenterFocusWeakIcon,
  CloseIcon,
  FolderOffIcon,
  ImageIcon,
  Pill,
  PlayArrowIcon,
  SemanticColor,
  Spinner,
  Text,
  ViewInArIcon,
  VisibilityOffIcon,
  WarningAmberIcon,
} from "@voxel51/voodo";
import React, {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { setTileHighlight, useHoveredTile } from "../gridTileRegistry";
import {
  episodeTitle,
  groupDescriptor,
  isFullEpisode,
  listRanges,
  plural,
  segmentsOf,
} from "./format";
import LookerPreview from "./LookerPreview";
import MismatchPopover from "./MismatchPopover";
import { useSelectionCardSize } from "./SelectionCards";
import SelectionTooltip from "./SelectionTooltip";
import { startSectionDrag } from "./sectionDrag";
import styles from "./SelectionTray.module.css";
import { CARD_HEIGHT, cardWidth, MULTIMODAL_CARD_HEIGHT } from "./theme";

// The plugin renderer graph is heavy; only multimodal cards pay for it.
const RendererPreview = lazy(() => import("./RendererPreview"));
const SelectionTileLanes = lazy(() => import("./SelectionTileLanes"));

type Selection = ReturnType<typeof useGridSelection>;
interface Props extends Pick<Selection, "capture" | "remove"> {
  group: EpisodeSelection;
  /** Current match for this parent: a group, null when outside the results, undefined while unknown. */
  candidate?: EpisodeSelection | null;
  /** Dataset media type; decides the preview element. */
  mediaType: string;
  /** Vocabulary for the parent unit in the current view. */
  unit: SelectionUnit;
  /** Display name; defaults to the media file name. */
  title?: string;
  open: (group: EpisodeSelection) => Promise<void>;
  /** Reveals this parent; resolves false only when it is outside the results. */
  locate?: (episodeId: string, signal?: AbortSignal) => Promise<boolean>;
  /** The section a drag takes this card from; unset, the card does not drag. */
  dragFrom?: string;
}

/** Mounts previews only while the card is near the viewport. */
function useNearViewport(ref: RefObject<Element>) {
  const [near, setNear] = useState(false);
  // This effect observes the card so large selections only load visible media.
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setNear(entries.at(-1)?.isIntersecting ?? false);
      },
      { rootMargin: "240px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return near;
}

/**
 * Points the grid at this card's tile while the pointer or focus rests on
 * the card, and lets go when the card leaves the strip mid-hover.
 */
function useTileCorrespondence(episodeId: string) {
  // This effect clears a highlight the card can no longer end itself,
  // because it unmounted (removed, folded away) while hovered or focused.
  useEffect(() => () => setTileHighlight(episodeId, false), [episodeId]);
  return {
    onPointerEnter: () => setTileHighlight(episodeId, true),
    onPointerLeave: () => setTileHighlight(episodeId, false),
    onFocus: () => setTileHighlight(episodeId, true),
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
        setTileHighlight(episodeId, false);
    },
  };
}

/**
 * One parent's captured scope as bare media: the whole sample/episode or,
 * for segments, the media with its ranges drawn along the bottom edge.
 */
export default function SelectionCard({
  group,
  candidate,
  mediaType,
  unit,
  title: titleProp,
  open,
  locate,
  capture,
  remove,
  dragFrom,
}: Props) {
  const root = useRef<HTMLElement>(null);
  const near = useNearViewport(root);
  const correspondence = useTileCorrespondence(group.episodeId);
  const mirrored = useHoveredTile() === group.episodeId;
  // This effect brings a card into the strip's view when its grid tile is
  // hovered, so the correspondence is visible even in a scrolled strip.
  useEffect(() => {
    if (mirrored)
      root.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [mirrored]);
  const mediaField = fos.useSelectedMediaFieldGrid();
  const { mediaFallback } = fos.useLookerOptions(false);
  const urls = fos.getNormalizedUrls(group.node?.urls ?? []);
  const preview = group.node
    ? fos.resolveMediaFieldLooker({
        mediaField,
        sample: group.node.sample,
        urls,
      })
    : null;
  const mediaPath = preview?.hasSelectedMediaPath
    ? preview.mediaFieldPath
    : mediaFallback
      ? urls.filepath
      : undefined;
  const src = mediaPath ? fos.getSampleSrc(mediaPath) : undefined;
  // A new URL (including a renewed signature) can recover a failed preview.
  const [failedSrc, setFailedSrc] = useState<string>();
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string>();
  const locateRequest = useRef<AbortController>();
  // Removing a card also cancels its pending navigation.
  useEffect(() => () => locateRequest.current?.abort(), []);
  // A miss is remembered against the match it was reported for, so fresh
  // results re-enable the control without an effect.
  const [missedFor, setMissedFor] = useState<{
    candidate: Props["candidate"];
  } | null>(null);
  const missed = missedFor !== null && missedFor.candidate === candidate;
  // Media that arrives without a known ratio reports its own once loaded.
  const [measured, setMeasured] = useState<{
    src: string | undefined;
    aspectRatio: number;
  }>();
  const [videoMetadata, setVideoMetadata] = useState<{
    src: string;
    duration: number;
  }>();
  const sourceAspect = [
    measured?.src === src ? measured?.aspectRatio : undefined,
    group.aspectRatio,
    group.node?.aspectRatio,
  ].find((ratio) => ratio !== undefined && Number.isFinite(ratio) && ratio > 0);
  const crop = group.crop;
  const aspect = crop
    ? (sourceAspect ?? 1) * (crop[2] / crop[3])
    : sourceAspect;
  const multimodal = mediaType === "multimodal";
  const threeD =
    mediaType === "3d" ||
    mediaType === "point-cloud" ||
    isDirect3dSamplePath(group.filepath);
  const size = useSelectionCardSize();
  const preferredHeight =
    size?.height ?? (multimodal ? MULTIMODAL_CARD_HEIGHT : CARD_HEIGHT);
  const naturalWidth = multimodal
    ? preferredHeight
    : cardWidth(aspect, preferredHeight);
  const width = Math.min(naturalWidth, size?.width ?? naturalWidth);
  // Narrow buckets shrink both dimensions instead of squeezing the card's
  // width around letterboxed media at the original height.
  const height = multimodal
    ? width
    : aspect && width < naturalWidth
      ? Math.max(0, width - 2) / aspect + 2
      : preferredHeight;
  const previewHeight = height - 2;
  const temporal = unit.temporal;
  const kind = src && src !== failedSrc ? preview?.nativeLookerType : null;
  const hasPreview =
    Boolean(group.node) && (multimodal || threeD || Boolean(kind));
  const full = isFullEpisode(group);
  const segments = segmentsOf(group);
  const title = titleProp ?? episodeTitle(group, unit);
  const dynamicGroup = group.group;
  const descriptor = dynamicGroup
    ? `Group of ${plural(dynamicGroup.size, unit.one, unit.many)}`
    : groupDescriptor(group, unit);
  const unavailable = Boolean(group.unavailable);
  const outside = !unavailable && candidate === null;
  const mismatch = Boolean(candidate && !sameSelection(group, candidate));
  const status = unavailable
    ? "unavailable"
    : outside
      ? "not in view"
      : mismatch
        ? "current matches differ"
        : null;
  const PlaceholderIcon = threeD
    ? ViewInArIcon
    : temporal
      ? PlayArrowIcon
      : ImageIcon;

  return (
    <article
      ref={root}
      className={styles.card}
      style={{ width, height }}
      data-tray-aspect-ratio={aspect ?? 0}
      data-episode-id={group.episodeId}
      data-unavailable={unavailable || undefined}
      data-outside={outside || undefined}
      data-mirrored={mirrored || undefined}
      aria-label={`${title}, ${descriptor}${status ? `, ${status}` : ""}`}
      draggable={dragFrom !== undefined || undefined}
      onDragStart={
        dragFrom === undefined
          ? undefined
          : (event) =>
              startSectionDrag(event, {
                episodeId: group.episodeId,
                from: dragFrom,
              })
      }
      {...correspondence}
    >
      <div
        className={`${styles.preview}${multimodal ? ` ${styles.squarePreview}` : ""}`}
        data-grid-tile=""
      >
        <button
          type="button"
          className={styles.open}
          aria-label={unavailable ? `${title} is unavailable` : `Open ${title}`}
          disabled={unavailable}
          onClick={() => void open(group)}
        >
          {unavailable ? (
            <span className={styles.placeholder}>
              <FolderOffIcon size="lg" color="text-muted" />
            </span>
          ) : near &&
            previewHeight > 0 &&
            width > 2 &&
            hasPreview &&
            group.node ? (
            <Suspense
              fallback={
                <span className={styles.placeholder}>
                  <PlaceholderIcon size="lg" color="text-muted" />
                </span>
              }
            >
              {multimodal ? (
                <RendererPreview
                  node={group.node}
                  fallback={
                    <span className={styles.placeholder}>
                      <PlaceholderIcon size="lg" color="text-muted" />
                    </span>
                  }
                />
              ) : (
                <LookerPreview
                  node={group.node}
                  width={width - 2}
                  height={previewHeight}
                  crop={kind === "image" ? crop : undefined}
                  sourceAspect={sourceAspect ?? undefined}
                  previewStart={group.previewStart}
                  onError={() => setFailedSrc(src)}
                  onMetadata={({ aspectRatio, duration }) => {
                    setMeasured({ src, aspectRatio });
                    if (src && duration !== undefined) {
                      setVideoMetadata({ src, duration });
                    }
                  }}
                />
              )}
            </Suspense>
          ) : (
            <span className={styles.placeholder}>
              <PlaceholderIcon size="lg" color="text-muted" />
            </span>
          )}
        </button>
        {(dynamicGroup || (temporal && !full)) && (
          <span className={styles.kind}>
            <Text variant="label" color="text-foreground">
              {dynamicGroup ? "Group" : descriptor}
            </Text>
          </span>
        )}
        <span className={styles.tools}>
          {locate && (
            <SelectionTooltip
              content={
                <Text variant="body-tertiary">
                  {outside || missed
                    ? "Not in view"
                    : locating
                      ? "Cancel showing in grid"
                      : (locateError ?? "Show in grid")}
                </Text>
              }
            >
              <Button
                variant="icon"
                size="xs"
                className={styles.tool}
                aria-label={
                  locating
                    ? `Cancel showing ${title} in grid`
                    : `Show ${title} in grid`
                }
                title={outside || missed ? "Not in view" : locateError}
                leadingIcon={locating ? undefined : CenterFocusWeakIcon}
                aria-busy={locating || undefined}
                disabled={unavailable || outside || missed}
                data-card-locate=""
                onClick={async () => {
                  if (locateRequest.current) {
                    locateRequest.current.abort();
                    return;
                  }
                  const controller = new AbortController();
                  locateRequest.current = controller;
                  setLocating(true);
                  setLocateError(undefined);
                  try {
                    if (!(await locate(group.episodeId, controller.signal)))
                      setMissedFor({ candidate });
                  } catch (error) {
                    if (
                      !(error instanceof Error && error.name === "AbortError")
                    )
                      setLocateError("Could not show this item. Try again.");
                  } finally {
                    locateRequest.current = undefined;
                    setLocating(false);
                  }
                }}
              >
                {locating && <Spinner size="xs" />}
              </Button>
              <span
                role="status"
                aria-label="Show in grid status"
                className={styles.locateStatus}
              >
                {locateError ?? ""}
              </span>
            </SelectionTooltip>
          )}
          <SelectionTooltip
            content={<Text variant="body-tertiary">Remove from selection</Text>}
          >
            <Button
              variant="icon"
              size="xs"
              className={styles.tool}
              aria-label={`Remove ${title} from selection`}
              leadingIcon={CloseIcon}
              data-card-remove=""
              onClick={() => remove(group.episodeId)}
            />
          </SelectionTooltip>
        </span>
        <div className={styles.footer}>
          {(unavailable || outside || mismatch) && (
            <div className={styles.flags}>
              {mismatch && candidate && (
                <MismatchPopover
                  group={group}
                  candidate={candidate}
                  unit={unit}
                  capture={capture}
                />
              )}
              {unavailable && (
                <Pill
                  size="xs"
                  icon={WarningAmberIcon}
                  backgroundColor={SemanticColor.Warning}
                  color="text-foreground"
                >
                  Unavailable
                </Pill>
              )}
              {outside && (
                <Pill
                  size="xs"
                  icon={VisibilityOffIcon}
                  backgroundColor={BackgroundColor.CardElevated}
                  color="text-secondary"
                >
                  Not in view
                </Pill>
              )}
            </div>
          )}
          {near && temporal && !unavailable && group.node && (
            <div title={listRanges(segments).join("\n")}>
              <Suspense fallback={null}>
                <SelectionTileLanes
                  node={group.node}
                  videoDuration={
                    videoMetadata?.src === src
                      ? videoMetadata?.duration
                      : undefined
                  }
                />
              </Suspense>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
