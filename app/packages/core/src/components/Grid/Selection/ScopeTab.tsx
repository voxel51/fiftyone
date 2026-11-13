import { getEventBus } from "@fiftyone/events";
import * as fos from "@fiftyone/state";
import type { ViewBarEvents } from "@fiftyone/view-bar";
import {
  memberCounts,
  selectionUnit,
  useGridSelection,
  useGridSelectionBoundary,
  viewConversion,
  type SavedSubset,
} from "@fiftyone/state/src/selection";
import {
  AddIcon,
  BackgroundColor,
  Button,
  CheckIcon,
  ChevronBottomIcon,
  Clickable,
  Divider,
  EditIcon,
  Pill,
  Popover,
  PopoverAnchor,
  SlidersIcon,
  Text,
} from "@voxel51/voodo";
import { useContext, useEffect, useState } from "react";
import { SubsetDetailsContext } from "./SubsetDetailsContext";
import SubsetConfirmationDialog from "./SubsetConfirmationDialog";
import SubsetEditDialog from "./SubsetEditDialog";
import styles from "./SelectionTray.module.css";
import {
  capturedFromLabel,
  plural,
  savedSubsetLabel,
  unitTitlePlural,
} from "./format";
import { SubsetPanel, type Capture } from "./SubsetAction";
import SubsetBrowser from "./SubsetBrowser";
import { trayTheme } from "./theme";
import { useDeleteSubset } from "./useDeleteSubset";
import { subsetRows, useOpenSubset, useSavedSubset } from "./useSubsetScope";

/** e2e specs wait on the tab naming the scope it switched to */
type ScopeTabE2EEvents = {
  "e2e:selection-scope:shown": { label: string; subset: boolean };
};

/**
 * The samples panel's tab names what the grid is browsing: every sample, or
 * one saved subset. Its panel switches scope, creates empty subsets, and
 * edits or deletes saved subsets. Captures survive browsing-scope changes.
 */
export default function SamplesScopeTab() {
  const permission = fos.useSelectionSubsetDisabledReason();
  const selection = useGridSelection();
  const { datasetId, unit, enabled } = selection;
  const [boundary] = useGridSelectionBoundary();
  const total = fos.useDatasetSampleCount();
  const stageCount = selection.request.view.length;
  const stageLabel = `${stageCount} view ${stageCount === 1 ? "stage" : "stages"} active`;
  const openSubset = useOpenSubset(datasetId);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<Capture | null>(null);
  const [editing, setEditing] = useState<SavedSubset | null>(null);
  const deletion = useDeleteSubset(datasetId, (subset) => {
    if (boundary.subsetId === subset.id) openSubset();
  });

  const scoped = Boolean(boundary.subsetId);
  const { subset: active, loading: activeLoading } = useSavedSubset(
    enabled ? datasetId : "",
    boundary.subsetId,
  );
  const activeScope = boundary.subsetScope ?? "episodes";
  const capturedFrom = active ? capturedFromLabel(active) : null;
  const SubsetDetails = useContext(SubsetDetailsContext);
  const segmentScope = scoped && activeScope === "segments";
  const mixed = Boolean(
    active?.memberCounts.fullEpisodes && active.memberCounts.segments,
  );
  const allSamples = !scoped && !stageCount && unit.one === "sample";
  const label = !scoped
    ? allSamples
      ? "All samples"
      : unitTitlePlural(unit)
    : active
      ? active.name
      : activeLoading
        ? "Loading subset"
        : "Unavailable subset";
  const countLabel = allSamples ? total?.toLocaleString() : null;
  // This effect tells e2e specs which scope the tab names, once an open
  // subset's metadata has loaded.
  useEffect(() => {
    if (scoped && !active) return;
    getEventBus<ScopeTabE2EEvents>().dispatch("e2e:selection-scope:shown", {
      label,
      subset: scoped,
    });
  }, [label, scoped, active]);
  const facet = segmentScope ? "Segments" : mixed ? `Whole ${unit.many}` : null;
  const choose = (
    subsetId?: string,
    scope?: "episodes" | "segments",
    view?: SavedSubset["view"],
    preferredGroupSlice?: string | null,
  ) => {
    setOpen(false);
    openSubset(subsetId, scope, view, preferredGroupSlice);
  };
  const beginCreate = () => {
    if (permission) return;
    setOpen(true);
    setCreating({
      datasetId,
      mediaType: selection.mediaType,
      view: selection.request.view,
      preferredGroupSlice: selection.conversion
        ? undefined
        : selection.request.slice,
      unit,
      mode: "create",
      source: "explicit",
      counts: memberCounts([]),
      scope: { kind: "members", members: [] },
    });
  };

  if (!enabled) return <Text variant="body-secondary">Samples</Text>;
  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setCreating(null);
        }}
        anchor={PopoverAnchor.BottomStart}
        trigger={
          <span
            className={styles.scopeTrigger}
            style={trayTheme}
            data-cy="samples-scope-trigger"
            data-open={open || undefined}
            title={
              segmentScope
                ? `Browsing saved segments in ${label}. Filters narrow ${unit.many}; temporal filters narrow ranges. ${active ? `${savedSubsetLabel(active, unit)} saved in this subset.` : ""}`
                : stageCount > 0
                  ? `Browsing ${scoped ? `the subset ${label}` : "the dataset"} with view stages applied`
                  : scoped
                    ? `Browsing the subset ${label}`
                    : "Browsing every sample in the dataset"
            }
            onClick={() => {
              setOpen((value) => !value);
              setCreating(null);
            }}
          >
            <Text variant="body-secondary">{label}</Text>
            {facet && (
              <Text variant="body-tertiary" color="text-secondary">
                · {facet}
              </Text>
            )}
            {stageCount > 0 && (
              <span
                className={styles.scopeStages}
                role="img"
                aria-label={stageLabel}
                title={stageLabel}
              >
                <SlidersIcon size="sm" color="text-accent" />
              </span>
            )}
            {countLabel != null && (
              <Pill
                size="xs"
                backgroundColor={BackgroundColor.CardElevated}
                color="text-secondary"
                className={styles.scopeCount}
              >
                {countLabel}
              </Pill>
            )}
            <span className={styles.scopeChevron} aria-hidden="true">
              <ChevronBottomIcon size="sm" color="text-secondary" />
            </span>
          </span>
        }
      >
        <div
          className={`${styles.sheet} ${creating ? styles.subsetFormSheet : styles.scopeSheet}`}
          style={trayTheme}
        >
          {creating ? (
            <SubsetPanel
              capture={creating}
              close={() => {
                setCreating(null);
                setOpen(false);
              }}
            />
          ) : (
            <div className={styles.sheetBody}>
              <Text
                variant="label"
                color="text-secondary"
                className={`${styles.sheetTitle} ${styles.scopeTitle}`}
              >
                <span>Subsets</span>
                {stageCount > 0 && (
                  <span>
                    {"("}
                    <Clickable
                      role="button"
                      tabIndex={0}
                      className={styles.scopeStagesLink}
                      onClick={() => {
                        setOpen(false);
                        getEventBus<ViewBarEvents>().dispatch(
                          "view-bar:toggle-stages",
                        );
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.currentTarget.click();
                        }
                      }}
                    >
                      {stageLabel}
                    </Clickable>
                    {")"}
                  </span>
                )}
              </Text>
              <button
                type="button"
                className={styles.row}
                aria-pressed={!scoped}
                data-cy="samples-scope-all"
                onClick={() => choose()}
              >
                <span className={styles.rowText}>
                  <Text variant="body-secondary">All samples</Text>
                </span>
                {total !== null && (
                  <Text variant="caption" color="text-secondary">
                    {total.toLocaleString()}
                  </Text>
                )}
                {!scoped && <CheckIcon size="sm" color="text-accent" />}
              </button>
              <SubsetBrowser
                datasetId={datasetId}
                emptyText=""
                separateFromPrevious
                renderSubset={(subset) => {
                  const subsetUnit = selectionUnit(
                    selection.mediaType,
                    viewConversion(subset.view ?? [])?.kind ?? null,
                  );
                  return subsetRows(subset, subsetUnit).map((row) => {
                    const current =
                      active?.id === subset.id && activeScope === row.scope;
                    const unavailable = subset.counts?.unavailable ?? 0;
                    return (
                      <div
                        key={`${subset.id}:${row.scope}`}
                        className={styles.subsetRow}
                      >
                        <button
                          type="button"
                          className={`${styles.row} ${styles.subsetChoice}`}
                          aria-pressed={current}
                          data-cy={`samples-scope-subset-${subset.id}`}
                          onClick={() =>
                            choose(
                              subset.id,
                              row.scope,
                              subset.view ?? null,
                              subset.preferredGroupSlice,
                            )
                          }
                        >
                          <span className={styles.rowText}>
                            {current && SubsetDetails ? (
                              <SubsetDetails subset={active}>
                                <Text variant="body-secondary">
                                  {subset.name}
                                </Text>
                              </SubsetDetails>
                            ) : (
                              <Text variant="body-secondary">
                                {subset.name}
                              </Text>
                            )}
                            {subset.preferredGroupSlice && (
                              <Text
                                variant="caption"
                                color="text-secondary"
                              >{`Opens on ${subset.preferredGroupSlice}`}</Text>
                            )}
                            {row.kind && (
                              <Text variant="caption" color="text-secondary">
                                {row.kind}
                              </Text>
                            )}
                            {subset.description && (
                              <Text
                                variant="body-tertiary"
                                color="text-secondary"
                                className={styles.rowClamp}
                                title={subset.description}
                              >
                                {subset.description}
                              </Text>
                            )}
                            {current && capturedFrom && (
                              <Text
                                variant="caption"
                                color="text-secondary"
                                data-cy="samples-scope-subset-source"
                              >
                                {capturedFrom}
                              </Text>
                            )}
                            {unavailable > 0 && (
                              <Text variant="caption" color="text-warning">
                                {`${unavailable} unavailable`}
                              </Text>
                            )}
                          </span>
                          {current && (
                            <CheckIcon size="sm" color="text-accent" />
                          )}
                          <Text
                            variant="caption"
                            color="text-secondary"
                            className={styles.subsetCount}
                          >
                            {row.scope === "segments"
                              ? plural(row.count, "segment")
                              : plural(
                                  row.count,
                                  subsetUnit.one,
                                  subsetUnit.many,
                                )}
                          </Text>
                        </button>
                        <Button
                          variant="icon"
                          size="xs"
                          aria-label={`Edit ${subset.name}`}
                          className={styles.subsetEdit}
                          data-cy={`samples-scope-edit-${subset.id}`}
                          disabled={deletion.busy || Boolean(permission)}
                          onClick={() => {
                            setOpen(false);
                            setEditing(subset);
                          }}
                        >
                          <EditIcon
                            size="sm"
                            className={styles.subsetEditIcon}
                          />
                        </Button>
                      </div>
                    );
                  });
                }}
              />
              <Divider
                role="separator"
                aria-label="Create subset"
                className={styles.rule}
              />
              <button
                type="button"
                className={styles.row}
                disabled={Boolean(permission)}
                data-cy="samples-scope-new"
                onClick={beginCreate}
              >
                <span className={styles.subsetCreateIcon} aria-hidden="true">
                  <AddIcon size="md" color="text-secondary" />
                </span>
                <span className={styles.rowText}>
                  <Text variant="body-secondary">New subset…</Text>
                </span>
              </button>
            </div>
          )}
        </div>
      </Popover>
      {editing && (
        <SubsetEditDialog
          key={editing.id}
          datasetId={datasetId}
          subset={editing}
          close={() => setEditing(null)}
          remove={() => {
            setEditing(null);
            deletion.request(editing);
          }}
        />
      )}
      {deletion.confirming && (
        <SubsetConfirmationDialog
          key={deletion.confirming.id}
          action="delete"
          subsetName={deletion.confirming.name}
          scopeLabel={savedSubsetLabel(deletion.confirming, unit)}
          close={deletion.close}
          confirm={deletion.confirm}
          busy={deletion.busy}
          error={deletion.error}
        />
      )}
    </>
  );
}
