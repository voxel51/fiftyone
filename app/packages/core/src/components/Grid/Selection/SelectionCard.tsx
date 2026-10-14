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
  OpenInNewIcon,
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
import MismatchPopover from "./MismatchPopover";
import { useSelectionCardHeight } from "./SelectionCards";
import SelectionTooltip from "./SelectionTooltip";
import { startSectionDrag } from "./sectionDrag";
import styles from "./SelectionTray.module.css";
import { CARD_HEIGHT, cardWidth, MULTIMODAL_CARD_HEIGHT } from "./theme";

// The plugin renderer graph is heavy; only multimodal cards pay for it.
const RendererPreview = lazy(() => import("./RendererPreview"));
const LookerPreview = lazy(() => import("./LookerPreview"));
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

/** Defers video and renderer previews; images use native lazy loading. */
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
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
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
  const [measured, setMeasured] = useState<number | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{
    src: string;
    duration: number;
  }>();
  const sourceAspect = group.aspectRatio ?? group.node?.aspectRatio ?? measured;
  const crop = group.crop;
  const aspect = crop
    ? (sourceAspect ?? 1) * (crop[2] / crop[3])
    : sourceAspect;
  const multimodal = mediaType === "multimodal";
  const threeD =
    mediaType === "3d" ||
    mediaType === "point-cloud" ||
    isDirect3dSamplePath(group.filepath);
  const height =
    useSelectionCardHeight() ??
    (multimodal ? MULTIMODAL_CARD_HEIGHT : CARD_HEIGHT);
  const previewHeight = height - 2;
  const width = multimodal ? height : cardWidth(aspect, height);
  const temporal = unit.temporal;
  const kind = src && src !== failedSrc ? preview?.nativeLookerType : null;
  const rendered = (multimodal || threeD) && Boolean(group.node);
  const hasPreview = rendered || Boolean(kind);
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
      ? "not in current results"
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
          ) : near && rendered && group.node ? (
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
                  width={width}
                  height={previewHeight}
                />
              )}
            </Suspense>
          ) : near && kind === "video" && src ? (
            <video
              className={styles.media}
              src={src}
              muted
              playsInline
              preload="metadata"
              onError={() => setFailedSrc(src)}
              onLoadedMetadata={(event) => {
                const { videoWidth, videoHeight } = event.currentTarget;
                if (videoWidth && videoHeight)
                  setMeasured(videoWidth / videoHeight);
                setVideoMetadata({
                  src,
                  duration: event.currentTarget.duration,
                });
                event.currentTarget.currentTime = group.previewStart ?? 0;
              }}
            />
          ) : kind === "image" && src ? (
            <div
              className={crop ? styles.crop : styles.imageFrame}
              style={
                crop
                  ? {
                      width: previewHeight * (aspect ?? 1),
                      maxWidth: "100%",
                      aspectRatio: aspect ?? undefined,
                    }
                  : undefined
              }
            >
              <img
                className={styles.media}
                style={
                  crop
                    ? {
                        position: "absolute",
                        width: `${100 / crop[2]}%`,
                        height: `${100 / crop[3]}%`,
                        left: `${(-100 * crop[0]) / crop[2]}%`,
                        top: `${(-100 * crop[1]) / crop[3]}%`,
                        maxWidth: "none",
                      }
                    : undefined
                }
                src={src}
                alt=""
                // The card drags, not its thumbnail
                draggable={false}
                loading="lazy"
                onError={() => setFailedSrc(src)}
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (naturalWidth && naturalHeight)
                    setMeasured(naturalWidth / naturalHeight);
                }}
              />
            </div>
          ) : (
            <span className={styles.placeholder}>
              <PlaceholderIcon size="lg" color="text-muted" />
            </span>
          )}
          {!unavailable && hasPreview && (
            <span className={styles.openHint} aria-hidden="true">
              <span>
                <OpenInNewIcon size="sm" />
              </span>
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
                    ? "Not in current results"
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
                title={
                  outside || missed ? "Not in current results" : locateError
                }
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
                  Not in results
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
