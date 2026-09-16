import {
  selectionScopeLabel,
  type SelectionCounts,
  type SelectionUnit,
} from "@fiftyone/state/src/selection";
import {
  Anchor,
  Button,
  CloseIcon,
  RefreshIcon,
  Size,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  UndoIcon,
  Variant,
} from "@voxel51/voodo";
import { plural } from "./format";
import styles from "./SelectionTray.module.css";

interface Props {
  /** Whether the scope is an explicit tray selection or all current results. */
  explicit: boolean;
  counts: SelectionCounts;
  unit: SelectionUnit;
  /** Captured parents that the current results do not contain. */
  outside: number;
  loading: boolean;
  error: string | null;
  /** How many parents a just-cleared selection held, while undo is offered. */
  cleared?: number;
  onUndo?: () => void;
  onRetry?: () => void;
  onClear?: () => void;
}

/**
 * The single line that says what actions will target. With nothing selected
 * it is an invitation ("Act on all samples in the grid"); with a selection it
 * is the scope and its exact count in the accent color, then quieter
 * qualifiers (outside results, unavailable, errors), then Clear.
 */
export default function SelectionSummary({
  explicit,
  counts,
  unit,
  outside,
  loading,
  error,
  cleared,
  onUndo,
  onRetry,
  onClear,
}: Props) {
  const empty = !explicit && !loading && !error && counts.episodes === 0;
  const label = selectionScopeLabel(counts, unit);
  const sentence = explicit ? (
    <Text variant={TextVariant.Md} color={TextColor.Accent}>
      {`${label} selected`}
    </Text>
  ) : error ? (
    <span className={styles.inlineAlert} role="alert">
      <Text variant={TextVariant.Md} color={TextColor.Destructive}>
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
    </span>
  ) : empty ? (
    <Text variant={TextVariant.Md} color={TextColor.Secondary}>
      {`No ${unit.many} in the grid`}
    </Text>
  ) : (
    <Text variant={TextVariant.Md} color={TextColor.Secondary}>
      {`Act on all ${unit.many} in the grid`}
    </Text>
  );
  return (
    <div className={styles.summary} aria-live="polite">
      <span className={styles.summaryText}>
        <Tooltip
          anchor={Anchor.Top}
          wrapperClassName={styles.tipWrap}
          content={
            <Text variant={TextVariant.Sm}>
              {explicit
                ? `Actions apply only to the selected ${unit.many}, including any outside the current results.`
                : `Actions apply to every current result, including ones not loaded in the grid. Select tiles to act on specific ${unit.many}.`}
            </Text>
          }
        >
          <span className={styles.summaryText}>{sentence}</span>
        </Tooltip>
        {explicit && outside > 0 && (
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            · {plural(outside, unit.one, unit.many)} not in current results
          </Text>
        )}
        {counts.unavailable > 0 && (
          <Text variant={TextVariant.Xs} color={TextColor.Warning}>
            · {plural(counts.unavailable, "unavailable member")}
          </Text>
        )}
        {explicit && error && (
          <Text
            variant={TextVariant.Xs}
            color={TextColor.Destructive}
            role="alert"
          >
            · {error}
          </Text>
        )}
        {!explicit && cleared && onUndo ? (
          <span className={styles.inlineAlert} role="status">
            <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
              · Cleared {plural(cleared, unit.one, unit.many)}
            </Text>
            <Button
              size={Size.Xs}
              variant={Variant.Borderless}
              leadingIcon={UndoIcon}
              onClick={onUndo}
            >
              Undo
            </Button>
          </span>
        ) : null}
      </span>
      {explicit && onClear && (
        <Button
          size={Size.Xs}
          variant={Variant.Borderless}
          leadingIcon={CloseIcon}
          data-tray-clear=""
          onClick={onClear}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
