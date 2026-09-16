import type { EpisodeSelection } from "@fiftyone/state/src/selection";
import {
  Anchor,
  Button,
  InfoOutlinedIcon,
  Popover,
  PopoverAnchor,
  Size,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Variant,
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
import styles from "./SelectionTray.module.css";
import { trayTheme } from "./theme";

interface Props {
  group: EpisodeSelection;
  candidate: EpisodeSelection;
  capture: (candidate: EpisodeSelection, operation?: "replace" | "add") => void;
}

/** Why accumulating is not offered, or null when it is. */
export function addDisabledReason(
  group: EpisodeSelection,
  candidate: EpisodeSelection,
) {
  if (isFullEpisode(group)) return "Already covered by the full episode";
  if (isFullEpisode(candidate)) return "Replace to select the full episode";
  return null;
}

/** The replace action names its destination so scope changes are deliberate. */
export function replaceLabel(candidate: EpisodeSelection) {
  return isFullEpisode(candidate)
    ? "Replace with full episode"
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
        variant={TextVariant.Label}
        color={tone === "selected" ? TextColor.Accent : TextColor.Info}
        className={styles.compareLabel}
      >
        {label}
      </Text>
      <div className={styles.compareBody}>
        <Text variant={TextVariant.Sm}>
          {groupDescriptor(group)}
          {streams ? ` · ${streams}` : ""}
        </Text>
        {segments.length > 0 && (
          <>
            <RangeTrack members={segments} domain={domain} tone={tone} />
            <Text
              variant={TextVariant.Xs}
              color={TextColor.Secondary}
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
export default function MismatchPopover({ group, candidate, capture }: Props) {
  const domain = rangeDomain([segmentsOf(group), segmentsOf(candidate)]);
  const addReason = addDisabledReason(group, candidate);
  return (
    <Popover
      anchor={PopoverAnchor.TopStart}
      trigger={
        <button
          type="button"
          className={styles.flag}
          aria-label="Current matches differ from the selection. Review options."
        >
          <InfoOutlinedIcon size={Size.Xs} />
          Matches changed
        </button>
      }
    >
      {({ close }) => (
        <div className={styles.panel} style={trayTheme}>
          <div>
            <Text variant={TextVariant.Md} style={{ display: "block" }}>
              Current matches differ
            </Text>
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
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
              size={Size.Sm}
              variant={Variant.Secondary}
              onClick={() => {
                capture(candidate, "replace");
                close();
              }}
            >
              {replaceLabel(candidate)}
            </Button>
            {addReason ? (
              <Tooltip
                anchor={Anchor.Top}
                wrapperClassName={styles.tipWrap}
                content={<Text variant={TextVariant.Sm}>{addReason}</Text>}
              >
                <Button size={Size.Sm} disabled>
                  Add matching segments
                </Button>
              </Tooltip>
            ) : (
              <Button
                size={Size.Sm}
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
