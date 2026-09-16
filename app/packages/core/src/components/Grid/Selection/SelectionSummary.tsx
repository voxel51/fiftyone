import {
  selectionScopeLabel,
  type SelectionCounts,
} from "@fiftyone/state/src/selection";
import {
  BackgroundColor,
  Button,
  CloseIcon,
  LoadingDots,
  Pill,
  RefreshIcon,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { plural } from "./format";
import styles from "./SelectionTray.module.css";

interface Props {
  /** Whether the scope is an explicit tray selection or all current results. */
  explicit: boolean;
  counts: SelectionCounts;
  /** Captured episodes that the current results do not contain. */
  outside: number;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  onClear?: () => void;
}

/**
 * The single line that says what actions will target. The leading pill makes
 * "all current results" and "your selection" unmistakable at a glance.
 */
export default function SelectionSummary({
  explicit,
  counts,
  outside,
  loading,
  error,
  onRetry,
  onClear,
}: Props) {
  return (
    <div className={styles.summary} aria-live="polite">
      <Pill
        size={Size.Xs}
        backgroundColor={
          explicit ? BackgroundColor.Selected : BackgroundColor.Raised
        }
        color={explicit ? TextColor.Accent : TextColor.Secondary}
      >
        {explicit ? `${counts.episodes} selected` : "All results"}
      </Pill>
      <span className={styles.summaryText}>
        {explicit ? (
          <Text variant={TextVariant.Sm}>{selectionScopeLabel(counts)}</Text>
        ) : error ? (
          <span className={styles.inlineAlert} role="alert">
            <Text variant={TextVariant.Sm} color={TextColor.Destructive}>
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
        ) : loading ? (
          <LoadingDots
            variant={TextVariant.Sm}
            color={TextColor.Secondary}
            text="Resolving results"
          />
        ) : (
          <Text variant={TextVariant.Sm}>{selectionScopeLabel(counts)}</Text>
        )}
        {explicit && outside > 0 && (
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            · {plural(outside, "episode")} not in current results
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
      </span>
      {explicit && onClear && (
        <Button
          size={Size.Xs}
          variant={Variant.Borderless}
          leadingIcon={CloseIcon}
          onClick={onClear}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
