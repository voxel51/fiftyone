import {
  compactScopeLabel,
  selectionBucketTitle,
  selectionScopeLabel,
  type SelectionBucket,
  type SelectionCounts,
  type SelectionUnit,
} from "@fiftyone/state/src/selection";
import {
  Anchor,
  BackgroundColor,
  Button,
  CloseIcon,
  Pill,
  RefreshIcon,
  Size,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  UndoIcon,
  Variant,
} from "@voxel51/voodo";
import BucketAvatar from "./BucketAvatar";
import { plural, selectionPills, type SelectionKind } from "./format";
import styles from "./SelectionTray.module.css";

/** One bucket's standing in the bar. */
export interface BucketPillData {
  readonly bucket: SelectionBucket;
  readonly index: number;
  readonly counts: SelectionCounts;
}

interface Props {
  /** Whether the scope is an explicit tray selection or all current results. */
  explicit: boolean;
  counts: SelectionCounts;
  unit: SelectionUnit;
  /** Captured parents that the current results do not contain. */
  outside: number;
  loading: boolean;
  error: string | null;
  /** What a just-cleared selection held, while undo is offered. */
  cleared?: SelectionCounts;
  /** The bucket a clear emptied, when the tray runs several. */
  clearedFrom?: string;
  onUndo?: () => void;
  onRetry?: () => void;
  /** Clear one archetype of the selection, or everything when omitted. */
  onClear?: (kind?: SelectionKind) => void;
  /**
   * Several buckets: one pill per populated bucket replaces the archetype
   * pills, and the pressed one is the target of the bar's actions.
   */
  buckets?: {
    readonly items: readonly BucketPillData[];
    readonly target: string;
    readonly onTarget: (bucketId: string) => void;
    readonly onClear: (bucketId: string) => void;
  };
  /** Where a held modifier would send the next click, if anywhere. */
  armed?: string | null;
}

/**
 * The line that says what actions will target. With nothing selected it is
 * an invitation ("Act on all samples in the grid"); with a selection it is
 * one pill per archetype ("4 samples selected", "3 segments selected"), each
 * with its own clear, then quieter qualifiers (outside results, unavailable,
 * errors). With several buckets, one pill per populated bucket names the
 * destination instead, and the pressed pill is what actions apply to.
 */
export default function SelectionSummary({
  explicit,
  counts,
  unit,
  outside,
  loading,
  error,
  cleared,
  clearedFrom,
  onUndo,
  onRetry,
  onClear,
  buckets,
  armed,
}: Props) {
  const empty = !explicit && !loading && !error && counts.episodes === 0;
  const populated = buckets?.items.filter((item) => item.counts.episodes) ?? [];
  const pills =
    explicit && !buckets
      ? counts.groups
        ? [
            {
              kind: "episode" as const,
              count: counts.groups,
              noun: `${counts.groups === 1 ? "group" : "groups"} · ${selectionScopeLabel({ ...counts, groups: undefined }, unit)}`,
              detail: selectionScopeLabel(counts, unit),
            },
          ]
        : selectionPills(counts, unit)
      : [];
  const scope =
    explicit && buckets ? (
      <span
        role="group"
        aria-label="Action target buckets"
        className={styles.bucketPills}
      >
        {populated.map(({ bucket, index, counts: bucketCounts }) => {
          const title = selectionBucketTitle(bucket, index);
          const label = compactScopeLabel(bucketCounts, unit);
          const target = bucket.id === buckets.target;
          return (
            <Tooltip
              key={bucket.id}
              anchor={Anchor.Top}
              wrapperClassName={styles.tipWrap}
              content={
                <Text variant={TextVariant.Sm}>
                  {target
                    ? `Actions apply to the ${label} in ${title}, including any outside the current results.`
                    : `Press to apply actions to the ${label} in ${title}.`}
                </Text>
              }
            >
              <Pill
                size={Size.Sm}
                backgroundColor={BackgroundColor.Raised}
                color={TextColor.Secondary}
                className={`${styles.countPill} ${styles.bucketPill}`}
                data-bucket-pill={bucket.id}
                data-target={target || undefined}
              >
                <span className={styles.countPillBody}>
                  <button
                    type="button"
                    className={styles.bucketPillBody}
                    aria-pressed={target}
                    aria-label={`${title}, ${label}. Apply actions to this bucket.`}
                    onClick={() => buckets.onTarget(bucket.id)}
                  >
                    <BucketAvatar bucket={bucket} index={index} />
                    <Text
                      variant={TextVariant.Sm}
                      color={target ? TextColor.Primary : TextColor.Secondary}
                      className={`${styles.summaryLabel} ${styles.bucketPillName}`}
                    >
                      {title}
                    </Text>
                    <Text
                      variant={TextVariant.Sm}
                      color={TextColor.Muted}
                      className={styles.summaryLabel}
                      aria-hidden="true"
                    >
                      ·
                    </Text>
                    <Text
                      variant={TextVariant.Sm}
                      color={TextColor.Primary}
                      className={`${styles.summaryLabel} ${styles.countPillCount}`}
                    >
                      {bucketCounts.episodes.toLocaleString()}
                    </Text>
                  </button>
                  <Button
                    size={Size.Xs}
                    variant={Variant.Icon}
                    leadingIcon={CloseIcon}
                    className={styles.countPillClear}
                    aria-label={`Clear ${title}`}
                    data-tray-clear={target ? "" : undefined}
                    onClick={() => buckets.onClear(bucket.id)}
                  />
                </span>
              </Pill>
            </Tooltip>
          );
        })}
      </span>
    ) : explicit ? (
      pills.map((pill, index) => (
        <Tooltip
          key={pill.kind}
          anchor={Anchor.Top}
          wrapperClassName={styles.tipWrap}
          content={
            <Text variant={TextVariant.Sm}>
              {`Actions apply only to the ${pill.detail} selected, including any outside the current results.`}
            </Text>
          }
        >
          <Pill
            size={Size.Sm}
            backgroundColor={BackgroundColor.Raised}
            color={TextColor.Secondary}
            className={styles.countPill}
            data-kind={pill.kind}
          >
            <span className={styles.countPillBody}>
              <Text
                variant={TextVariant.Sm}
                color={TextColor.Primary}
                className={`${styles.summaryLabel} ${styles.countPillCount}`}
              >
                {pill.count.toLocaleString()}
              </Text>
              <Text
                variant={TextVariant.Sm}
                color={TextColor.Secondary}
                className={styles.summaryLabel}
              >
                {`${pill.noun} selected`}
              </Text>
              {onClear && (
                <Button
                  size={Size.Xs}
                  variant={Variant.Icon}
                  leadingIcon={CloseIcon}
                  className={styles.countPillClear}
                  aria-label={
                    pills.length > 1
                      ? `Clear selected ${pill.noun}`
                      : "Clear selection"
                  }
                  data-tray-clear={index === 0 ? "" : undefined}
                  onClick={() =>
                    onClear(pills.length > 1 ? pill.kind : undefined)
                  }
                />
              )}
            </span>
          </Pill>
        </Tooltip>
      ))
    ) : (
      <Tooltip
        anchor={Anchor.Top}
        wrapperClassName={styles.tipWrap}
        content={
          <Text variant={TextVariant.Sm}>
            {`Actions apply to every current result, including ones not loaded in the grid. Select tiles to act on specific ${unit.many}.`}
          </Text>
        }
      >
        <span className={styles.summaryText}>
          {error ? (
            <span className={styles.inlineAlert} role="alert">
              <Text
                variant={TextVariant.Sm}
                color={TextColor.Destructive}
                className={styles.summaryLabel}
              >
                {error}
              </Text>
              {onRetry && (
                <Button
                  size={Size.Sm}
                  variant={Variant.Borderless}
                  leadingIcon={RefreshIcon}
                  onClick={onRetry}
                >
                  Retry
                </Button>
              )}
            </span>
          ) : empty ? (
            <Text
              variant={TextVariant.Sm}
              color={TextColor.Secondary}
              className={styles.summaryLabel}
            >
              {`No ${unit.many} in the grid`}
            </Text>
          ) : (
            <Text
              variant={TextVariant.Sm}
              color={TextColor.Secondary}
              className={styles.summaryLabel}
            >
              {loading
                ? "Loading current results…"
                : counts.segments
                  ? `Act on ${selectionScopeLabel(counts, unit)}`
                  : `Act on all ${unit.many} in the grid`}
            </Text>
          )}
        </span>
      </Tooltip>
    );
  // Qualifiers trail a sentence with a dot; after pills the gap is enough.
  const dot = explicit ? "" : "· ";
  return (
    <div className={styles.summary} aria-live="polite">
      <span className={styles.summaryText}>
        {scope}
        {explicit && loading && (
          <Text
            variant={TextVariant.Sm}
            color={TextColor.Secondary}
            className={styles.summaryLabel}
          >
            Resolving selection…
          </Text>
        )}
        {explicit && outside > 0 && (
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            {plural(outside, unit.one, unit.many)} not in current results
          </Text>
        )}
        {counts.unavailable > 0 && (
          <Text variant={TextVariant.Xs} color={TextColor.Warning}>
            {dot}
            {plural(counts.unavailable, "unavailable member")}
          </Text>
        )}
        {explicit && error && (
          <span className={styles.inlineAlert}>
            <Text
              variant={TextVariant.Xs}
              color={TextColor.Destructive}
              role="alert"
            >
              {error}
            </Text>
            {onRetry && (
              <Button
                size={Size.Xs}
                variant={Variant.Borderless}
                leadingIcon={RefreshIcon}
                onClick={onRetry}
              >
                Retry
              </Button>
            )}
            {onClear && (
              <Button
                size={Size.Xs}
                variant={Variant.Borderless}
                onClick={() => onClear()}
              >
                Clear selection
              </Button>
            )}
          </span>
        )}
        {armed && (
          <Text
            variant={TextVariant.Xs}
            color={TextColor.Accent}
            className={styles.armedHint}
            role="status"
          >
            {`${dot}Next click adds to ${armed}`}
          </Text>
        )}
        {cleared && onUndo ? (
          <span className={styles.inlineAlert} role="status">
            <Text
              variant={TextVariant.Sm}
              color={TextColor.Secondary}
              className={styles.summaryLabel}
            >
              {dot}
              {`Cleared ${selectionScopeLabel(cleared, unit)}${
                clearedFrom ? ` from ${clearedFrom}` : ""
              }`}
            </Text>
            <Button
              size={Size.Sm}
              variant={Variant.Borderless}
              leadingIcon={UndoIcon}
              onClick={onUndo}
            >
              Undo
            </Button>
          </span>
        ) : null}
      </span>
    </div>
  );
}
