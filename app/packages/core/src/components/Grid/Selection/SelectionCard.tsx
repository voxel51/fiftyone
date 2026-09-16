import * as fos from "@fiftyone/state";
import {
  sameSelection,
  type EpisodeSelection,
  type SelectionUnit,
  type useGridSelection,
} from "@fiftyone/state/src/selection";
import {
  BackgroundColor,
  Button,
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
  Variant,
  ViewInArIcon,
  VisibilityOffIcon,
  WarningAmberIcon,
} from "@voxel51/voodo";
import {
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  episodeTitle,
  formatRanges,
  groupDescriptor,
  isFullEpisode,
  listRanges,
  plural,
  segmentsOf,
} from "./format";
import MismatchPopover from "./MismatchPopover";
import RangeTrack from "./RangeTrack";
import styles from "./SelectionTray.module.css";
import { cardWidth } from "./theme";

// The plugin renderer graph is heavy; only multimodal cards pay for it.
const RendererPreview = lazy(() => import("./RendererPreview"));

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

/** One parent's captured scope: the whole sample/episode or grouped segments. */
export default function SelectionCard({
  group,
  candidate,
  mediaType,
  unit,
  title: titleProp,
  open,
  capture,
  remove,
}: Props) {
  const root = useRef<HTMLElement>(null);
  const near = useNearViewport(root);
  const [mediaFailed, setMediaFailed] = useState(false);
  // Media that arrives without a known ratio reports its own once loaded.
  const [measured, setMeasured] = useState<number | null>(null);
  const aspect = group.aspectRatio ?? group.node?.aspectRatio ?? measured;
  const width = cardWidth(aspect);
  const temporal = unit.temporal;
  const kind = mediaFailed ? "none" : previewKind(mediaType, group.filepath);
  const rendered = mediaType === "multimodal" && Boolean(group.node);
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
  const PlaceholderIcon =
    mediaType === "3d" || mediaType === "point-cloud"
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
      aria-label={`${title}, ${descriptor}${status ? `, ${status}` : ""}`}
    >
      <div className={styles.preview}>
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
              <RendererPreview
                node={group.node}
                fallback={
                  <span className={styles.placeholder}>
                    <PlaceholderIcon size={Size.Lg} color={TextColor.Muted} />
                  </span>
                }
              />
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
            <img
              className={styles.media}
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
        <Button
          variant={Variant.Icon}
          size={Size.Xs}
          className={styles.remove}
          aria-label={`Remove ${title} from selection`}
          leadingIcon={CloseIcon}
          data-card-remove=""
          onClick={() => remove(group.episodeId)}
        />
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
      <div className={styles.meta}>
        <Text variant={TextVariant.Sm} className={styles.title} title={title}>
          {title}
        </Text>
        {(temporal || dynamicGroup) && (
          <div className={styles.metaRow}>
            {dynamicGroup ? (
              <Text
                variant={TextVariant.Xs}
                color={TextColor.Secondary}
                className={styles.ellipsis}
                style={{ flex: 1 }}
                title={dynamicGroup.label}
              >
                {`${plural(dynamicGroup.size, unit.one, unit.many)} · ${dynamicGroup.label}`}
              </Text>
            ) : full ? (
              <Text
                variant={TextVariant.Xs}
                color={TextColor.Secondary}
                className={styles.ellipsis}
                style={{ flex: 1 }}
              >
                {`Whole ${unit.one}`}
              </Text>
            ) : (
              <div className={styles.ranges}>
                <RangeTrack members={segments} />
                <Text
                  variant={TextVariant.Xs}
                  color={TextColor.Secondary}
                  className={styles.ellipsis}
                  title={listRanges(segments).join("\n")}
                >
                  {formatRanges(segments, 2)}
                </Text>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
