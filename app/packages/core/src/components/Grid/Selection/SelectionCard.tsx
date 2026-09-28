import * as fos from "@fiftyone/state";
import {
  sameSelection,
  type EpisodeSelection,
  type SelectionUnit,
  type useGridSelection,
} from "@fiftyone/state/src/selection";
import { isDirect3dSamplePath } from "@fiftyone/utilities";
import {
  Anchor,
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
  Size,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Variant,
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
import RangeTrack from "./RangeTrack";
import styles from "./SelectionTray.module.css";
import { CARD_PREVIEW_HEIGHT, cardWidth, MULTIMODAL_CARD_WIDTH } from "./theme";

// The plugin renderer graph is heavy; only multimodal cards pay for it.
const RendererPreview = lazy(() => import("./RendererPreview"));
const LookerPreview = lazy(() => import("./LookerPreview"));

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
  /** Scrolls the grid to this parent; resolves false when it is not shown. */
  locate?: (episodeId: string) => Promise<boolean>;
}

/** Defers thumbnail media until the card is near the strip's viewport. */
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

const PLAYABLE = /\.(mp4|m4v|webm|mov|ogv|ogg|mkv|avi)(\?.*)?$/i;
const IMAGE = /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|avif)(\?.*)?$/i;

/** Grouped datasets mix media per slice, so the file itself decides. */
function previewKind(mediaType: string, filepath: string | undefined) {
  if (!filepath) return "none" as const;
  if (mediaType === "image" || IMAGE.test(filepath)) return "image" as const;
  if (PLAYABLE.test(filepath)) return "video" as const;
  return "none" as const;
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
  const [mediaFailed, setMediaFailed] = useState(false);
  const [locating, setLocating] = useState(false);
  // A miss is remembered against the match it was reported for, so fresh
  // results re-enable the control without an effect.
  const [missedFor, setMissedFor] = useState<{
    candidate: Props["candidate"];
  } | null>(null);
  const missed = missedFor !== null && missedFor.candidate === candidate;
  // Media that arrives without a known ratio reports its own once loaded.
  const [measured, setMeasured] = useState<number | null>(null);
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
  const width = multimodal ? MULTIMODAL_CARD_WIDTH : cardWidth(aspect);
  const temporal = unit.temporal;
  const kind = mediaFailed ? "none" : previewKind(mediaType, group.filepath);
  const rendered = (multimodal || threeD) && Boolean(group.node);
  const hasPreview = rendered || kind !== "none";
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
      style={{ width }}
      data-episode-id={group.episodeId}
      data-unavailable={unavailable || undefined}
      data-outside={outside || undefined}
      data-mirrored={mirrored || undefined}
      aria-label={`${title}, ${descriptor}${status ? `, ${status}` : ""}`}
      {...correspondence}
    >
      <div
        className={`${styles.preview}${multimodal ? ` ${styles.squarePreview}` : ""}`}
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
              <FolderOffIcon size={Size.Lg} color={TextColor.Muted} />
            </span>
          ) : near && rendered && group.node ? (
            <Suspense
              fallback={
                <span className={styles.placeholder}>
                  <PlaceholderIcon size={Size.Lg} color={TextColor.Muted} />
                </span>
              }
            >
              {multimodal ? (
                <RendererPreview
                  node={group.node}
                  fallback={
                    <span className={styles.placeholder}>
                      <PlaceholderIcon size={Size.Lg} color={TextColor.Muted} />
                    </span>
                  }
                />
              ) : (
                <LookerPreview node={group.node} width={width} />
              )}
            </Suspense>
          ) : near && kind === "video" && group.filepath ? (
            <video
              className={styles.media}
              src={fos.getSampleSrc(group.filepath)}
              muted
              playsInline
              preload="metadata"
              onError={() => setMediaFailed(true)}
              onLoadedMetadata={(event) => {
                const { videoWidth, videoHeight } = event.currentTarget;
                if (videoWidth && videoHeight)
                  setMeasured(videoWidth / videoHeight);
                event.currentTarget.currentTime = group.previewStart ?? 0;
              }}
            />
          ) : near && kind === "image" && group.filepath ? (
            <div
              className={crop ? styles.crop : styles.imageFrame}
              style={
                crop
                  ? {
                      width: `min(100%, ${CARD_PREVIEW_HEIGHT * (aspect ?? 1)}px)`,
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
                src={fos.getSampleSrc(group.filepath)}
                alt=""
                loading="lazy"
                onError={() => setMediaFailed(true)}
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (naturalWidth && naturalHeight)
                    setMeasured(naturalWidth / naturalHeight);
                }}
              />
            </div>
          ) : (
            <span className={styles.placeholder}>
              <PlaceholderIcon size={Size.Lg} color={TextColor.Muted} />
            </span>
          )}
          {!unavailable && hasPreview && (
            <span className={styles.openHint} aria-hidden="true">
              <span>
                <OpenInNewIcon size={Size.Sm} />
              </span>
            </span>
          )}
        </button>
        {(dynamicGroup || (temporal && !full)) && (
          <span className={styles.kind}>
            <Text variant={TextVariant.Label} color={TextColor.Fg}>
              {dynamicGroup ? "Group" : descriptor}
            </Text>
          </span>
        )}
        {temporal && !full && segments.length > 0 && (
          <span
            className={styles.segmentTrack}
            title={listRanges(segments).join("\n")}
          >
            <RangeTrack members={segments} className={styles.segmentBars} />
          </span>
        )}
        <span className={styles.tools}>
          {locate && (
            <Tooltip
              anchor={Anchor.Top}
              content={
                <Text variant={TextVariant.Sm}>
                  {outside || missed
                    ? "Not in current results"
                    : "Scroll to grid"}
                </Text>
              }
            >
              <Button
                variant={Variant.Icon}
                size={Size.Xs}
                className={styles.tool}
                aria-label={`Scroll to ${title} in the grid`}
                title={outside || missed ? "Not in current results" : undefined}
                leadingIcon={CenterFocusWeakIcon}
                aria-busy={locating || undefined}
                disabled={unavailable || outside || missed || locating}
                data-card-locate=""
                onClick={async () => {
                  setLocating(true);
                  try {
                    if (!(await locate(group.episodeId)))
                      setMissedFor({ candidate });
                  } finally {
                    setLocating(false);
                  }
                }}
              />
            </Tooltip>
          )}
          <Tooltip
            anchor={Anchor.Top}
            content={
              <Text variant={TextVariant.Sm}>Remove from selection</Text>
            }
          >
            <Button
              variant={Variant.Icon}
              size={Size.Xs}
              className={styles.tool}
              aria-label={`Remove ${title} from selection`}
              leadingIcon={CloseIcon}
              data-card-remove=""
              onClick={() => remove(group.episodeId)}
            />
          </Tooltip>
        </span>
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
                size={Size.Xs}
                icon={WarningAmberIcon}
                backgroundColor={SemanticColor.Warning}
                color={TextColor.Fg}
              >
                Unavailable
              </Pill>
            )}
            {outside && (
              <Pill
                size={Size.Xs}
                icon={VisibilityOffIcon}
                backgroundColor={BackgroundColor.CardElevated}
                color={TextColor.Secondary}
              >
                Not in results
              </Pill>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
