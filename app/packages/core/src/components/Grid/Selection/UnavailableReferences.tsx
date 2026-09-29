import {
  countSelection,
  selectionScopeLabel,
  type EpisodeSelection,
  type SelectionUnit,
  type SelectionResult,
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
import { useState } from "react";
import { plural, unitTitle } from "./format";

interface Props {
  groups: readonly EpisodeSelection[];
  total?: number;
  loadPage?: (skip: number) => Promise<SelectionResult>;
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
  total,
  loadPage,
  selected,
  capture,
  unit,
}: Props) {
  const [extra, setExtra] = useState<readonly EpisodeSelection[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const shown = [
    ...new Map(
      [...groups, ...extra].map((group) => [group.episodeId, group]),
    ).values(),
  ];
  const more = async () => {
    if (!loadPage) return;
    setBusy(true);
    setError(false);
    try {
      const page = await loadPage(shown.length);
      setExtra((current) => [...current, ...(page.unavailableGroups ?? [])]);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  if (!shown.length) return null;
  return (
    <Dropdown
      anchor={DropdownAnchor.TopStart}
      trigger={
        <Button
          size={Size.Xs}
          variant={Variant.Borderless}
          leadingIcon={WarningAmberIcon}
        >
          {plural(total ?? shown.length, `unavailable saved ${unit.one}`)}
        </Button>
      }
    >
      <MenuSectionTitle>{`Saved references without a live ${unit.one}`}</MenuSectionTitle>
      {shown.map((group) => (
        <MenuIconTextItem
          key={group.episodeId}
          icon={<FolderOffIcon size={Size.Sm} />}
          text={`${unitTitle(unit)} …${group.episodeId.slice(-6)}`}
          subtext={selectionScopeLabel(countSelection([group]), unit)}
          disabled={selected.has(group.episodeId)}
          onClick={() => capture(group)}
        />
      ))}
      {loadPage && shown.length < (total ?? 0) && (
        <MenuTextItem disabled={busy} onClick={() => void more()}>
          {busy
            ? "Loading…"
            : error
              ? "Retry loading references"
              : "Load more references"}
        </MenuTextItem>
      )}
      <MenuSeparator />
      <MenuTextItem disabled>
        Select a reference to include it when adding to a subset
      </MenuTextItem>
    </Dropdown>
  );
}
