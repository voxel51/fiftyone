import * as fos from "@fiftyone/state";
import {
  sameSelection,
  type EpisodeSelection,
  type useGridSelection,
} from "@fiftyone/state/src/selection";
import {
  Button,
  Dropdown,
  DropdownAnchor,
  DropdownTrigger,
  MenuTextItem,
  MenuSectionTitle,
  Size,
  Text,
  TextVariant,
  Variant,
  cssVar,
} from "@voxel51/voodo";
import styles from "./SelectionTray.module.css";

type Selection = ReturnType<typeof useGridSelection>;
interface Props extends Pick<
  Selection,
  "loading" | "error" | "capture" | "remove"
> {
  group: EpisodeSelection;
  candidate?: EpisodeSelection;
  open: (group: EpisodeSelection) => Promise<void>;
}

function rangeSummary(group: EpisodeSelection) {
  const ranges = group.members.flatMap((member) =>
    member.kind === "segment"
      ? [
          `[${member.range.start}, ${member.range.end}) ${member.range.timebase}`,
        ]
      : [],
  );
  return `${ranges.length} segment${ranges.length === 1 ? "" : "s"}: ${ranges.slice(0, 2).join("; ")}${ranges.length > 2 ? "; …" : ""}`;
}

/** A single episode's captured scope, with explicit replacement and accumulation. */
export default function SelectionCard({
  group,
  candidate,
  open,
  loading,
  error,
  capture,
  remove,
}: Props) {
  const mismatch = candidate && !sameSelection(group, candidate);
  const full = group.members[0]?.kind === "episode";
  return (
    <article
      className={styles.card}
      style={{
        border: `1px solid ${cssVar.color.border.active}`,
        background: cssVar.color.bg.background,
      }}
    >
      <button
        className={styles.preview}
        aria-label={`Open episode ${group.episodeId}`}
        disabled={group.unavailable}
        onClick={() => open(group)}
      >
        {group.filepath && (
          <video
            src={fos.getSampleSrc(group.filepath)}
            muted
            preload="metadata"
            onLoadedMetadata={(event) => {
              event.currentTarget.currentTime = group.previewStart ?? 0;
            }}
          />
        )}
        <span
          style={{
            background: cssVar.color.bg.card[1],
            color: cssVar.color.text.fg,
          }}
        >
          {full
            ? "Full episode"
            : `${group.members.length} segment${group.members.length === 1 ? "" : "s"}`}
        </span>
      </button>
      <div className={styles.cardControls}>
        {group.unavailable ? (
          <Text variant={TextVariant.Sm}>Unavailable</Text>
        ) : !loading && !error && !candidate ? (
          <Text variant={TextVariant.Sm}>Not in current results</Text>
        ) : null}
        {mismatch && (
          <Dropdown
            anchor={DropdownAnchor.TopStart}
            trigger={
              <DropdownTrigger size={Size.Xs}>
                Different matches
              </DropdownTrigger>
            }
          >
            <MenuSectionTitle>
              {`Selected: ${full ? "Full episode" : rangeSummary(group)}`}
            </MenuSectionTitle>
            <MenuSectionTitle>
              {`Current: ${
                candidate.members[0]?.kind === "episode"
                  ? "Full episode"
                  : rangeSummary(candidate)
              }`}
            </MenuSectionTitle>
            <MenuTextItem onClick={() => capture(candidate)}>
              Replace selection
            </MenuTextItem>
            <MenuTextItem
              disabled={full || candidate.members[0]?.kind === "episode"}
              title={
                full
                  ? "Already covered by full episode"
                  : candidate.members[0]?.kind === "episode"
                    ? "Replace to select the full episode"
                    : undefined
              }
              onClick={() => capture(candidate, "add")}
            >
              Add matching segments
            </MenuTextItem>
          </Dropdown>
        )}
        <Button
          size={Size.Xs}
          variant={Variant.Borderless}
          aria-label={`Remove episode ${group.episodeId} from selection`}
          onClick={() => remove(group.episodeId)}
        >
          Remove
        </Button>
      </div>
    </article>
  );
}
