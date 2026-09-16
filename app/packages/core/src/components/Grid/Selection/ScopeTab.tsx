import * as fos from "@fiftyone/state";
import {
  countSelection,
  normalizeSelectionMembers,
  useGridSelection,
  useGridSelectionBoundary,
  type SavedSubset,
  type SelectionScope,
} from "@fiftyone/state/src/selection";
import {
  AddIcon,
  BackgroundColor,
  CheckIcon,
  ChevronBottomIcon,
  DeleteOutlineIcon,
  Modal,
  ModalSize,
  Pill,
  Popover,
  PopoverAnchor,
  Size,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { useState } from "react";
import DeleteSubsetDialog from "./DeleteSubsetDialog";
import styles from "./SelectionTray.module.css";
import { scopePhrase } from "./format";
import { SubsetPanel, type Capture } from "./SubsetAction";
import SubsetBrowser from "./SubsetBrowser";
import { trayTheme } from "./theme";
import { subsetRows, useOpenSubset, useSavedSubset } from "./useSubsetScope";

/**
 * The samples panel's tab names what the grid is browsing: every sample, or
 * one saved subset. Its panel switches scope, saves the current scope as a
 * new subset, and deletes the open subset. Switching scope always starts a
 * fresh, empty selection.
 */
export default function SamplesScopeTab() {
  const selection = useGridSelection();
  const { datasetId, conversion, unit, enabled } = selection;
  const [boundary] = useGridSelectionBoundary();
  const total = fos.useDatasetSampleCount();
  const openSubset = useOpenSubset(datasetId);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<Capture | null>(null);
  const [deleting, setDeleting] = useState<SavedSubset | null>(null);

  const scoped = Boolean(boundary.subsetId);
  const { subset: active, loading: activeLoading } = useSavedSubset(
    enabled ? datasetId : "",
    boundary.subsetId,
  );
  const activeScope = boundary.subsetScope ?? "episodes";
  const label = !scoped
    ? "All samples"
    : active
      ? active.name
      : activeLoading
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

  const choose = (subsetId?: string, scope?: "episodes" | "segments") => {
    setOpen(false);
    openSubset(subsetId, scope);
  };
  const beginCreate = () => {
    setOpen(false);
    const captured = [...selection.selected.values()];
    setCreating({
      datasetId,
      mediaType: selection.mediaType,
      unit,
      mode: "create",
      source: captured.length ? "explicit" : "results",
      counts: captured.length ? countSelection(captured) : selection.counts,
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
              scoped
                ? `Browsing the subset ${label}`
                : "Browsing every sample in the dataset"
            }
            onClick={() => setOpen((value) => !value)}
          >
            <Text variant={TextVariant.Md}>{label}</Text>
            {count !== null && (
              <Pill
                size={Size.Xs}
                backgroundColor={BackgroundColor.Raised}
                color={TextColor.Secondary}
                className={styles.scopeCount}
              >
                {count.toLocaleString()}
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
            {conversion ? (
              <Text
                variant={TextVariant.Sm}
                color={TextColor.Secondary}
                className={styles.listEmpty}
              >
                Subsets are available in the samples view
              </Text>
            ) : (
              <SubsetBrowser
                datasetId={datasetId}
                renderSubset={(subset) =>
                  subsetRows(subset, unit).map((row) => {
                    const current =
                      active?.id === subset.id && activeScope === row.scope;
                    const unavailable = subset.counts.unavailable;
                    return (
                      <button
                        key={`${subset.id}:${row.scope}`}
                        type="button"
                        className={styles.row}
                        aria-pressed={current}
                        data-cy={`samples-scope-subset-${subset.id}`}
                        onClick={() => choose(subset.id, row.scope)}
                      >
                        <span className={styles.rowText}>
                          <Text variant={TextVariant.Md}>{subset.name}</Text>
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
                        <Text
                          variant={TextVariant.Xs}
                          color={TextColor.Secondary}
                        >
                          {row.count.toLocaleString()}
                        </Text>
                        {current && (
                          <CheckIcon size={Size.Sm} color={TextColor.Accent} />
                        )}
                      </button>
                    );
                  })
                }
              />
            )}
            <hr className={styles.rule} />
            <button
              type="button"
              className={styles.row}
              disabled={Boolean(conversion)}
              data-cy="samples-scope-new"
              onClick={beginCreate}
            >
              <AddIcon size={Size.Md} color={TextColor.Secondary} />
              <span className={styles.rowText}>
                <Text variant={TextVariant.Md}>New subset…</Text>
                <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
                  {selectedCount
                    ? `From the ${selectedCount} selected`
                    : "From all current results"}
                </Text>
              </span>
            </button>
            {active && (
              <button
                type="button"
                className={`${styles.row} ${styles.rowDestructive}`}
                data-cy="samples-scope-delete"
                onClick={() => {
                  setOpen(false);
                  setDeleting(active);
                }}
              >
                <DeleteOutlineIcon
                  size={Size.Md}
                  color={TextColor.Destructive}
                />
                <span className={styles.rowText}>
                  <Text variant={TextVariant.Md} color={TextColor.Destructive}>
                    {`Delete ${active.name}…`}
                  </Text>
                </span>
              </button>
            )}
          </div>
        </div>
      </Popover>
      {creating && (
        <Modal
          open
          onClose={() => setCreating(null)}
          title={
            creating.counts
              ? `New subset from ${scopePhrase(creating.source, creating.counts, unit)}`
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
