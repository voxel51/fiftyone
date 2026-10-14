import { getEventBus } from "@fiftyone/events";
import { useEffect } from "react";
import {
  selectionScopeLabel,
  type SelectionCounts,
  type SelectionUnit,
} from "@fiftyone/state/src/selection";
import {
  BackgroundColor,
  Button,
  CloseIcon,
  Pill,
  RefreshIcon,
  Text,
} from "@voxel51/voodo";
import { plural, selectionPills, type SelectionKind } from "./format";
import SelectionTooltip from "./SelectionTooltip";
import styles from "./SelectionTray.module.css";

interface Props {
  /** Whether the scope is an explicit tray selection or all current results. */
  explicit: boolean;
  counts: SelectionCounts;
  /** Split into sections: every picked parent across them, for one pill. */
  total?: number;
  unit: SelectionUnit;
  /** Captured parents that the current results do not contain. */
  outside: number;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  /** Clear one archetype of the selection, or everything when omitted. */
  onClear?: (kind?: SelectionKind) => void;
}

/**
 * The line that says what is picked. One strip shows a pill per archetype
 * ("4 samples selected", "3 segments selected"), each with its own clear;
 * split, one pill counts every section ("6 total selected"). Quieter
 * qualifiers follow (outside results, unavailable, errors). With nothing
 * selected it speaks only when results fail, are empty, or are segments.
 */
export default function SelectionSummary({
  explicit,
  counts,
  total,
  unit,
  outside,
  loading,
  error,
  onRetry,
  onClear,
}: Props) {
  const selectedCount = explicit ? counts.episodes : 0;
  useEffect(() => {
    getEventBus<{
      "e2e:actions:selected-shown": {
        modal: boolean;
        samples: number;
        labels: number;
      };
    }>().dispatch("e2e:actions:selected-shown", {
      modal: false,
      samples: selectedCount,
      labels: 0,
    });
  }, [selectedCount]);

  const empty = !explicit && !loading && !error && counts.episodes === 0;
  const pills =
    total !== undefined
      ? total
        ? [
            {
              kind: "episode" as const,
              count: total,
              noun: "total selected",
              detail: `${total.toLocaleString()} picked across sections`,
            },
          ]
        : []
      : explicit
        ? counts.groups
          ? [
              {
                kind: "episode" as const,
                count: counts.groups,
                noun: `${counts.groups === 1 ? "group" : "groups"} · ${selectionScopeLabel({ ...counts, groups: undefined }, unit)} selected`,
                detail: selectionScopeLabel(counts, unit),
              },
            ]
          : selectionPills(counts, unit).map((pill) => ({
              ...pill,
              noun: `${pill.noun} selected`,
            }))
        : [];
  // With nothing selected, the line speaks only to say results failed, are
  // empty, or are segments.
  const sentence = explicit ? null : error ? (
    <span className={styles.inlineAlert} role="alert">
      <Text
        variant="body-tertiary"
        color="text-failure"
        className={styles.summaryLabel}
      >
        {error}
      </Text>
      {onRetry && (
        <Button
          size="sm"
          variant="borderless"
          leadingIcon={RefreshIcon}
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </span>
  ) : empty ? (
    <Text
      variant="body-tertiary"
      color="text-secondary"
      className={styles.summaryLabel}
    >
      {`No ${unit.many} in the grid`}
    </Text>
  ) : !loading && counts.segments ? (
    <Text
      variant="body-tertiary"
      color="text-secondary"
      className={styles.summaryLabel}
    >
      {`Act on ${selectionScopeLabel(counts, unit)}`}
    </Text>
  ) : null;
  const scope = pills.length
    ? pills.map((pill, index) => (
        <SelectionTooltip
          key={pill.kind}
          wrapperClassName={styles.tipWrap}
          content={
            <Text variant="body-tertiary">
              {total !== undefined
                ? `${pill.detail}. Actions apply to the focused sections, or every section when none is focused.`
                : `Actions apply only to the ${pill.detail} selected, including any outside the current results.`}
            </Text>
          }
        >
          <Pill
            size="sm"
            backgroundColor={BackgroundColor.CardElevated}
            color="text-secondary"
            className={styles.countPill}
            data-kind={pill.kind}
          >
            <span className={styles.countPillBody}>
              <Text
                variant="body-tertiary"
                color="text-primary"
                className={`${styles.summaryLabel} ${styles.countPillCount}`}
              >
                {pill.count.toLocaleString()}
              </Text>
              <Text
                variant="body-tertiary"
                color="text-secondary"
                className={styles.summaryLabel}
              >
                {pill.noun}
              </Text>
              {onClear && (
                <Button
                  size="xs"
                  variant="icon"
                  leadingIcon={CloseIcon}
                  className={styles.countPillClear}
                  aria-label={
                    pills.length > 1
                      ? `Clear selected ${pill.noun.replace(/ selected$/, "")}`
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
        </SelectionTooltip>
      ))
    : sentence;
  // Qualifiers trail a sentence with a dot; after pills the gap is enough,
  // and with nothing ahead of them they lead the line.
  const dot = sentence ? "· " : "";
  return (
    <div className={styles.summary} aria-live="polite">
      <span className={styles.summaryText}>
        {scope}
        {explicit && loading && (
          <Text
            variant="body-tertiary"
            color="text-secondary"
            className={styles.summaryLabel}
          >
            Resolving selection…
          </Text>
        )}
        {explicit && outside > 0 && (
          <Text variant="caption" color="text-secondary">
            {plural(outside, unit.one, unit.many)} not in current results
          </Text>
        )}
        {counts.unavailable > 0 && (
          <Text variant="caption" color="text-warning">
            {dot}
            {plural(counts.unavailable, "unavailable member")}
          </Text>
        )}
        {explicit && error && (
          <span className={styles.inlineAlert}>
            <Text variant="caption" color="text-failure" role="alert">
              {error}
            </Text>
            {onRetry && (
              <Button
                size="xs"
                variant="borderless"
                leadingIcon={RefreshIcon}
                onClick={onRetry}
              >
                Retry
              </Button>
            )}
            {onClear && (
              <Button size="xs" variant="borderless" onClick={() => onClear()}>
                Clear selection
              </Button>
            )}
          </span>
        )}
      </span>
    </div>
  );
}
