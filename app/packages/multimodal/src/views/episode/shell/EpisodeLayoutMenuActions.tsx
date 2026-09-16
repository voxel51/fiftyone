import {
  Anchor,
  IconName,
  MenuIconTextItem,
  MenuSeparator,
  RocketLaunchIcon,
  Size,
  Text,
  TextVariant,
  Tooltip,
} from "@voxel51/voodo";
import {
  useEpisodeHeaderActions,
  type EpisodeHeaderActionId,
} from "../../../extensions/episode-actions";

const SAVED_LAYOUTS_UPSELL =
  "Save viewer layouts to reuse your setup, import and export layouts as JSON, " +
  "and share them with your organization. Available only in FiftyOne Enterprise.";

/** Renders contributed layout actions or the saved-layouts upgrade prompt. */
export default function EpisodeLayoutMenuActions({
  onSelect,
}: {
  readonly onSelect: (id: EpisodeHeaderActionId) => void;
}) {
  const actions = useEpisodeHeaderActions().filter(
    (action) => action.layoutMenuLabel,
  );
  const hasSavedLayouts = actions.some(
    (action) => action.layoutMenuRole === "saved-layouts",
  );

  return (
    <>
      <MenuSeparator />
      {!hasSavedLayouts && (
        <Tooltip
          anchor={Anchor.Right}
          data-testid="saved-layouts-upsell"
          portal
          content={
            <Text
              variant={TextVariant.Sm}
              style={{ display: "block", maxWidth: 280 }}
            >
              {SAVED_LAYOUTS_UPSELL}
            </Text>
          }
        >
          <MenuIconTextItem
            disabled
            icon={<RocketLaunchIcon size={Size.Md} />}
            text="Saved layouts…"
            aria-description={SAVED_LAYOUTS_UPSELL}
          />
        </Tooltip>
      )}
      {actions.map((action) => (
        <MenuIconTextItem
          icon={action.layoutMenuIcon ?? IconName.Puzzle}
          key={action.id}
          onClick={() => onSelect(action.id)}
          text={action.layoutMenuLabel ?? ""}
        />
      ))}
    </>
  );
}
