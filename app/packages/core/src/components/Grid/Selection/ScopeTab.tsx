import * as fos from "@fiftyone/state";
import {
  normalizeSelectionMembers,
  useGridSelection,
  useGridSelectionBoundary,
  type SavedSubset,
  type SelectionScope,
} from "@fiftyone/state/src/selection";
import {
  AddIcon,
  BackgroundColor,
  ChevronBottomIcon,
  DeleteOutlineIcon,
  Dropdown,
  DropdownAnchor,
  MenuCheckItem,
  MenuIconTextItem,
  MenuSectionTitle,
  MenuSeparator,
  MenuTextItem,
  Pill,
  Size,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { useState } from "react";
import DeleteSubsetDialog from "./DeleteSubsetDialog";
import styles from "./SelectionTray.module.css";
import { SubsetDialog, type Capture } from "./SubsetAction";
import { subsetRows, useOpenSubset, useSavedSubsets } from "./useSubsetScope";

function ScopeRow({
  title,
  subtitle,
  count,
}: {
  title: string;
  subtitle?: string;
  count: number | null;
}) {
  return (
    <span className={styles.scopeRow}>
      <span className={styles.scopeRowText}>
        <Text variant={TextVariant.Sm}>{title}</Text>
        {subtitle && (
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            {subtitle}
          </Text>
        )}
      </span>
      {count !== null && (
        <Text
          variant={TextVariant.Xs}
          color={TextColor.Secondary}
          className={styles.scopeRowCount}
        >
          {count.toLocaleString()}
        </Text>
      )}
    </span>
  );
}

/**
 * The samples panel's tab names what the grid is browsing: every sample, or
 * one saved subset. Its menu switches scope, saves the current scope as a
 * new subset, and deletes the open subset. Switching scope always starts a
 * fresh, empty selection.
 */
export default function SamplesScopeTab() {
  const selection = useGridSelection();
  const { datasetId, conversion, unit, enabled } = selection;
  const [boundary] = useGridSelectionBoundary();
  const total = fos.useDatasetSampleCount();
  const { subsets, error } = useSavedSubsets(enabled ? datasetId : "");
  const openSubset = useOpenSubset(datasetId);
  const [creating, setCreating] = useState<Capture | null>(null);
  const [deleting, setDeleting] = useState<SavedSubset | null>(null);

  const scoped = Boolean(boundary.subsetId);
  const active = scoped
    ? subsets?.find((subset) => subset.id === boundary.subsetId)
    : undefined;
  const activeScope = boundary.subsetScope ?? "episodes";
  const label = !scoped
    ? "All samples"
    : active
      ? active.name
      : subsets === null
        ? "Loading subset"
        : "Unavailable subset";
  const count = !scoped
    ? total
    : active
      ? activeScope === "segments"
        ? active.counts.segments
        : active.counts.fullEpisodes
      : null;
  const selectedCount = selection.selected.size;

  const beginCreate = () => {
    const captured = [...selection.selected.values()];
    setCreating({
      datasetId,
      mediaType: selection.mediaType,
      unit,
      mode: "create",
      source: captured.length ? "explicit" : "results",
      scope: captured.length
        ? {
            kind: "members",
            members: normalizeSelectionMembers(
              captured.flatMap((group) => group.members),
            ),
          }
        : async (): Promise<SelectionScope> => ({
            kind: "snapshot",
            ...(await selection.snapshot()),
          }),
    });
  };

  if (!enabled) return <Text variant={TextVariant.Md}>Samples</Text>;
  return (
    <>
      <Dropdown
        anchor={DropdownAnchor.BottomStart}
        trigger={
          <span
            className={styles.scopeTrigger}
            data-cy="samples-scope-trigger"
            title={
              scoped
                ? `Browsing the subset ${label}`
                : "Browsing every sample in the dataset"
            }
          >
            <Text variant={TextVariant.Md}>{label}</Text>
            {count !== null && (
              <Pill
                size={Size.Xs}
                backgroundColor={BackgroundColor.Raised}
                color={TextColor.Secondary}
              >
                {count.toLocaleString()}
              </Pill>
            )}
            <ChevronBottomIcon size={Size.Xs} color={TextColor.Secondary} />
          </span>
        }
      >
        <MenuSectionTitle>Scope</MenuSectionTitle>
        <MenuCheckItem
          checked={!scoped}
          onClick={() => openSubset()}
          data-cy="samples-scope-all"
        >
          <ScopeRow title="All samples" count={total} />
        </MenuCheckItem>
        <MenuSeparator />
        <MenuSectionTitle>Subsets</MenuSectionTitle>
        {conversion ? (
          <MenuTextItem disabled>
            Subsets are available in the samples view
          </MenuTextItem>
        ) : subsets === null ? (
          <MenuTextItem disabled>Loading subsets…</MenuTextItem>
        ) : error ? (
          <MenuTextItem disabled>{error}</MenuTextItem>
        ) : !subsets.length ? (
          <MenuTextItem disabled>No saved subsets yet</MenuTextItem>
        ) : (
          subsets.flatMap((subset) =>
            subsetRows(subset, unit).map((row) => (
              <MenuCheckItem
                key={`${subset.id}:${row.scope}`}
                checked={active?.id === subset.id && activeScope === row.scope}
                onClick={() => openSubset(subset.id, row.scope)}
                data-cy={`samples-scope-subset-${subset.id}`}
              >
                <ScopeRow
                  title={subset.name}
                  subtitle={row.subtitle}
                  count={row.count}
                />
              </MenuCheckItem>
            )),
          )
        )}
        <MenuSeparator />
        <MenuIconTextItem
          icon={<AddIcon size={Size.Sm} />}
          text="New subset…"
          subtext={
            selectedCount
              ? `From the ${selectedCount} selected`
              : "From all current results"
          }
          disabled={Boolean(conversion)}
          onClick={beginCreate}
          data-cy="samples-scope-new"
        />
        {active && (
          <MenuIconTextItem
            destructive
            icon={<DeleteOutlineIcon size={Size.Sm} />}
            text={`Delete ${active.name}…`}
            onClick={() => setDeleting(active)}
            data-cy="samples-scope-delete"
          />
        )}
      </Dropdown>
      {creating && (
        <SubsetDialog capture={creating} close={() => setCreating(null)} />
      )}
      {deleting && (
        <DeleteSubsetDialog
          datasetId={datasetId}
          subset={deleting}
          unit={unit}
          close={() => setDeleting(null)}
          onDeleted={() => {
            if (boundary.subsetId === deleting.id) openSubset();
          }}
        />
      )}
    </>
  );
}
