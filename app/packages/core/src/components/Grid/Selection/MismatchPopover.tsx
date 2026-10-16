import { EPISODE_UNIT } from "@fiftyone/state/src/selection";
import type {
  EpisodeSelection,
  SelectionUnit,
} from "@fiftyone/state/src/selection";
import {
  Button,
  InfoOutlinedIcon,
  Popover,
  PopoverAnchor,
  Text,
  TextColor,
} from "@voxel51/voodo";
import {
  formatRanges,
  groupDescriptor,
  isFullEpisode,
  listRanges,
  plural,
  rangeDomain,
  segmentsOf,
  streamsLabel,
} from "./format";
import RangeTrack from "./RangeTrack";
import SelectionTooltip from "./SelectionTooltip";
import styles from "./SelectionTray.module.css";
import { trayTheme } from "./theme";

interface Props {
  group: EpisodeSelection;
  candidate: EpisodeSelection;
  unit: SelectionUnit;
  capture: (candidate: EpisodeSelection, operation?: "replace" | "add") => void;
}

/** Why accumulating is not offered, or null when it is. */
export function addDisabledReason(
  group: EpisodeSelection,
  candidate: EpisodeSelection,
  unit: SelectionUnit = EPISODE_UNIT,
) {
  if (isFullEpisode(group)) return `Already covered by the full ${unit.one}`;
  if (isFullEpisode(candidate)) return `Replace to select the full ${unit.one}`;
  return null;
}

/** The replace action names its destination so scope changes are deliberate. */
export function replaceLabel(
  candidate: EpisodeSelection,
  unit: SelectionUnit = EPISODE_UNIT,
) {
  return isFullEpisode(candidate)
    ? `Replace with full ${unit.one}`
    : `Replace with ${plural(segmentsOf(candidate).length, "matching segment")}`;
}

function Side({
  label,
  tone,
  group,
  domain,
}: {
  label: string;
  tone: "selected" | "current";
  group: EpisodeSelection;
  domain: [bigint, bigint] | null;
}) {
  const segments = segmentsOf(group);
  const streams = streamsLabel(segments);
  return (
    <>
      <Text
        variant="label"
        color={tone === "selected" ? TextColor.Accent : TextColor.Info}
        className={styles.compareLabel}
      >
        {label}
      </Text>
      <div className={styles.compareBody}>
        <Text variant="body-tertiary">
          {groupDescriptor(group)}
          {streams ? ` · ${streams}` : ""}
        </Text>
        {segments.length > 0 && (
          <>
            <RangeTrack members={segments} domain={domain} tone={tone} />
            <Text
              variant="caption"
              color="text-secondary"
              title={listRanges(segments).join("\n")}
            >
              {formatRanges(segments, 4)}
            </Text>
          </>
        )}
      </div>
    </>
  );
}

/**
 * Captured ranges differ from what the current results match. Nothing
 * changes until the user chooses to replace or accumulate.
 */
export default function MismatchPopover({
  group,
  candidate,
  unit,
  capture,
}: Props) {
  const domain = rangeDomain([segmentsOf(group), segmentsOf(candidate)]);
  const addReason = addDisabledReason(group, candidate, unit);
  return (
    <Popover
      anchor={PopoverAnchor.TopStart}
      trigger={
        <button
          type="button"
          className={styles.flag}
          aria-label="Current matches differ from the selection. Review options."
        >
          <InfoOutlinedIcon size="xs" />
          Matches changed
        </button>
      }
    >
      {({ close }) => (
        <div className={styles.panel} style={trayTheme}>
          <div>
            <Text variant="body-secondary" style={{ display: "block" }}>
              Current matches differ
            </Text>
            <Text variant="body-tertiary" color="text-secondary">
              Your selection stays as captured until you choose.
            </Text>
          </div>
          <div className={styles.compare}>
            <Side
              label="Selected"
              tone="selected"
              group={group}
              domain={domain}
            />
            <Side
              label="Current"
              tone="current"
              group={candidate}
              domain={domain}
            />
          </div>
          <div className={styles.panelActions}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                capture(candidate, "replace");
                close();
              }}
            >
              {replaceLabel(candidate, unit)}
            </Button>
            {addReason ? (
              <SelectionTooltip
                wrapperClassName={styles.tipWrap}
                content={<Text variant="body-tertiary">{addReason}</Text>}
              >
                <Button size="sm" disabled>
                  Add matching segments
                </Button>
              </SelectionTooltip>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  capture(candidate, "add");
                  close();
                }}
              >
                Add matching segments
              </Button>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}
