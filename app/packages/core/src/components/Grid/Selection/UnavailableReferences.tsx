import {
  countSelection,
  selectionScopeLabel,
  type EpisodeSelection,
  type SelectionUnit,
} from "@fiftyone/state/src/selection";
import {
  Button,
  Dropdown,
  DropdownAnchor,
  FolderOffIcon,
  MenuIconTextItem,
  MenuSectionTitle,
  MenuSeparator,
  MenuTextItem,
  Size,
  Variant,
  WarningAmberIcon,
} from "@voxel51/voodo";
import { plural, unitTitle } from "./format";

interface Props {
  groups: readonly EpisodeSelection[];
  selected: ReadonlyMap<string, EpisodeSelection>;
  capture: (group: EpisodeSelection) => void;
  unit: SelectionUnit;
}

/**
 * Saved subset members whose source episode no longer exists. They cannot
 * match live filters, so they are offered for explicit selection instead.
 */
export default function UnavailableReferences({
  groups,
  selected,
  capture,
  unit,
}: Props) {
  if (!groups.length) return null;
  return (
    <Dropdown
      anchor={DropdownAnchor.TopStart}
      trigger={
        <Button
          size={Size.Xs}
          variant={Variant.Borderless}
          leadingIcon={WarningAmberIcon}
        >
          {plural(groups.length, `unavailable saved ${unit.one}`)}
        </Button>
      }
    >
      <MenuSectionTitle>{`Saved references without a live ${unit.one}`}</MenuSectionTitle>
      {groups.map((group) => (
        <MenuIconTextItem
          key={group.episodeId}
          icon={<FolderOffIcon size={Size.Sm} />}
          text={`${unitTitle(unit)} …${group.episodeId.slice(-6)}`}
          subtext={selectionScopeLabel(countSelection([group]), unit)}
          disabled={selected.has(group.episodeId)}
          onClick={() => capture(group)}
        />
      ))}
      <MenuSeparator />
      <MenuTextItem disabled>
        Select a reference to include it when adding to a subset
      </MenuTextItem>
    </Dropdown>
  );
}
