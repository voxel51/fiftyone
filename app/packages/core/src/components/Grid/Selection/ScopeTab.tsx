import * as fos from "@fiftyone/state";
import {
  selectionBucketTitle,
  selectionUnit,
  useGridSelection,
  useGridSelectionBoundary,
  viewConversion,
  type SavedSubset,
  type SelectionScope,
} from "@fiftyone/state/src/selection";
import {
  AddIcon,
  BackgroundColor,
  Button,
  CheckIcon,
  ChevronBottomIcon,
  Clickable,
  DeleteOutlineIcon,
  Modal,
  ModalSize,
  Pill,
  Popover,
  PopoverAnchor,
  Size,
  SlidersIcon,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useState } from "react";
import SubsetConfirmationDialog from "./SubsetConfirmationDialog";
import styles from "./SelectionTray.module.css";
import { plural, savedSubsetLabel, scopePhrase } from "./format";
import { SubsetPanel, type Capture } from "./SubsetAction";
import SubsetBrowser from "./SubsetBrowser";
import { trayTheme } from "./theme";
import { useDeleteSubset } from "./useDeleteSubset";
import { subsetRows, useOpenSubset, useSavedSubset } from "./useSubsetScope";
import { useSubsetScopeUrl } from "./useSubsetScopeUrl";

/**
 * The samples panel's tab names what the grid is browsing: every sample, or
 * one saved subset. Its panel switches scope, saves the current scope as a
 * new subset, and deletes saved subsets. Switching scope always starts a
 * fresh, empty selection.
 */
export default function SamplesScopeTab() {
  useSubsetScopeUrl();
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
  const deletion = useDeleteSubset(datasetId, (subset) => {
    if (boundary.subsetId === subset.id) openSubset();
  });

  const scoped = Boolean(boundary.subsetId);
  const { subset: active, loading: activeLoading } = useSavedSubset(
    enabled ? datasetId : "",
    boundary.subsetId,
  );
  const activeScope = boundary.subsetScope ?? "episodes";
  const segmentScope = scoped && activeScope === "segments";
  const mixed = Boolean(
    active?.memberCounts.fullEpisodes && active.memberCounts.segments,
  );
  const label = !scoped
    ? "All samples"
    : active
      ? active.name
      : activeLoading
        ? "Loading subset"
        : "Unavailable subset";
  const unfiltered =
    !stageCount &&
    !Object.keys(selection.request.filters ?? {}).length &&
    !Object.keys(selection.request.extendedStages ?? {}).length &&
    !boundary.provider;
  const counts = selection.counts;
  const missingParents = unfiltered ? (selection.unavailableTotal ?? 0) : 0;
  const missingMembers = unfiltered ? (counts?.unavailable ?? 0) : 0;
  const countLabel = !scoped
    ? total?.toLocaleString()
    : counts
      ? segmentScope
        ? `${plural(counts.episodes - missingParents, unit.one, unit.many)} · ${plural(counts.segments - missingMembers, "segment")}`
        : plural(counts.episodes - missingParents, unit.one, unit.many)
      : null;
  const facet = segmentScope ? "Segments" : mixed ? `Whole ${unit.many}` : null;
  const selectedCount = selection.selected.size;

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
    setOpen(false);
    const captured = [...selection.selected.values()];
    const targetIndex = selection.buckets.findIndex(
      (bucket) => bucket.id === selection.target,
    );
    const targetBucket = selection.buckets[targetIndex];
    setCreating({
      datasetId,
      mediaType: selection.mediaType,
      view: selection.request.view,
      preferredGroupSlice: selection.conversion
        ? undefined
        : selection.request.slice,
      unit,
      mode: "create",
      source: captured.length ? "explicit" : "results",
      within:
        captured.length &&
        targetBucket &&
        (selection.buckets.length > 1 || targetBucket.name)
          ? selectionBucketTitle(targetBucket, targetIndex)
          : undefined,
      counts: captured.length ? selection.selectedCounts : selection.counts,
      scope: captured.length
        ? selection.resolveCaptured
        : async (): Promise<SelectionScope> => ({
            kind: "snapshot",
            ...(await selection.snapshot()),
          }),
    });
  };

  if (!enabled) return <Text variant={TextVariant.Md}>Samples</Text>;
  return (
    <>
      <Popover
        open={open}
        onOpenChange={setOpen}
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
            onClick={() => setOpen((value) => !value)}
          >
            <Text variant={TextVariant.Md}>{label}</Text>
            {facet && (
              <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
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
                <SlidersIcon size={Size.Sm} color={TextColor.Accent} />
              </span>
            )}
            {countLabel != null && (
              <Pill
                size={Size.Xs}
                backgroundColor={BackgroundColor.Raised}
                color={TextColor.Secondary}
                className={styles.scopeCount}
              >
                {countLabel}
              </Pill>
            )}
            <span className={styles.scopeChevron} aria-hidden="true">
              <ChevronBottomIcon size={Size.Sm} color={TextColor.Secondary} />
            </span>
          </span>
        }
      >
        <div
          className={`${styles.sheet} ${styles.scopeSheet}`}
          style={trayTheme}
        >
          <div className={styles.sheetBody}>
            <Text
              variant={TextVariant.Label}
              color={TextColor.Secondary}
              className={styles.sheetTitle}
            >
              Scope
              {stageCount > 0 && (
                <>
                  {" ("}
                  <Clickable
                    role="button"
                    tabIndex={0}
                    className={styles.scopeStagesLink}
                    onClick={() => {
                      setOpen(false);
                      window.dispatchEvent(
                        new Event("fiftyone:toggle-view-stages"),
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
                </>
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
                <Text variant={TextVariant.Md}>All samples</Text>
              </span>
              {total !== null && (
                <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
                  {total.toLocaleString()}
                </Text>
              )}
              {!scoped && <CheckIcon size={Size.Sm} color={TextColor.Accent} />}
            </button>
            <hr className={styles.rule} />
            <Text
              variant={TextVariant.Label}
              color={TextColor.Secondary}
              className={styles.sheetTitle}
            >
              Subsets
            </Text>
            <SubsetBrowser
              datasetId={datasetId}
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
                          <Text variant={TextVariant.Md}>{subset.name}</Text>
                          {subset.preferredGroupSlice && (
                            <Text
                              variant={TextVariant.Xs}
                              color={TextColor.Secondary}
                            >{`Opens on ${subset.preferredGroupSlice}`}</Text>
                          )}
                          {row.kind && (
                            <Text
                              variant={TextVariant.Xs}
                              color={TextColor.Secondary}
                            >
                              {row.kind}
                            </Text>
                          )}
                          {subset.description && (
                            <Text
                              variant={TextVariant.Sm}
                              color={TextColor.Secondary}
                              className={styles.rowClamp}
                              title={subset.description}
                            >
                              {subset.description}
                            </Text>
                          )}
                          {unavailable > 0 && (
                            <Text
                              variant={TextVariant.Xs}
                              color={TextColor.Warning}
                            >
                              {`${unavailable} unavailable`}
                            </Text>
                          )}
                        </span>
                        {current && (
                          <CheckIcon size={Size.Sm} color={TextColor.Accent} />
                        )}
                        <Text
                          variant={TextVariant.Xs}
                          color={TextColor.Secondary}
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
                        variant={Variant.Icon}
                        size={Size.Xs}
                        aria-label={`Delete ${subset.name}`}
                        title={`Delete ${subset.name}`}
                        className={styles.subsetDelete}
                        data-cy={`samples-scope-delete-${subset.id}`}
                        disabled={deletion.busy || Boolean(permission)}
                        onClick={() => {
                          setOpen(false);
                          deletion.request(subset);
                        }}
                      >
                        <DeleteOutlineIcon
                          size={Size.Sm}
                          color={TextColor.Destructive}
                        />
                      </Button>
                    </div>
                  );
                });
              }}
            />
            <hr className={styles.rule} />
            <button
              type="button"
              className={styles.row}
              disabled={Boolean(permission)}
              data-cy="samples-scope-new"
              onClick={beginCreate}
            >
              <AddIcon size={Size.Md} color={TextColor.Secondary} />
              <span className={styles.rowText}>
                <Text variant={TextVariant.Md}>New subset…</Text>
                <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
                  {selectedCount
                    ? `From ${selection.selectedCounts ? scopePhrase("explicit", selection.selectedCounts, unit) : "the current selection"}`
                    : "From all current results"}
                </Text>
              </span>
            </button>
          </div>
        </div>
      </Popover>
      {creating && (
        <Modal
          open
          onClose={() => setCreating(null)}
          title={
            creating.counts
              ? `New subset from ${scopePhrase(creating.source, creating.counts, unit, creating.within)}`
              : "New subset"
          }
          size={ModalSize.Sm}
        >
          <div className={styles.modalSheet} style={trayTheme}>
            <SubsetPanel
              capture={creating}
              close={() => setCreating(null)}
              heading={false}
            />
          </div>
        </Modal>
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
