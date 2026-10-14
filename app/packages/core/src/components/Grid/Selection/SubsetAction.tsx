import {
  useLoadedSavedViewName,
  useSelectionSubsetDisabledReason,
} from "@fiftyone/state";
import type {
  GridSelectionAction,
  GridSelectionActionContext,
  GridSelectionActionProps,
} from "@fiftyone/multimodal/extensions/grid-selection";
import {
  memberCounts,
  normalizeSelectionMembers,
  scopeBody,
  subsetRequest,
  useInvalidateSelectionScope,
  useSubsetJobs,
  type SavedSubset,
  type SelectionCounts,
  type SelectionScope,
  type SelectionUnit,
} from "@fiftyone/state/src/selection";
import {
  AddIcon,
  Button,
  ErrorOutlineIcon,
  FolderIcon,
  FormField,
  GridViewIcon,
  Input,
  LayersIcon,
  LoadingDots,
  RefreshIcon,
  ResizeBehavior,
  Spinner,
  Text,
  TextArea,
} from "@voxel51/voodo";
import { useCallback, useEffect, useState } from "react";
import ActionEntry from "./ActionEntry";
import ActionSurface from "./ActionSurface";
import { savedSubsetLabel, scopePhrase } from "./format";
import { Notice } from "./Notice";
import styles from "./SelectionTray.module.css";
import SubsetBrowser from "./SubsetBrowser";
import Segmented from "./Segmented";
import { useGroupActionScope } from "./useGroupActionScope";
import { SubsetJobStatus } from "./SubsetJobs";

/** A frozen scope and how it will be saved. */
export interface Capture {
  datasetId: string;
  mediaType: string;
  /** The view that gives captured entities their identity. */
  view?: readonly unknown[];
  preferredGroupSlice?: string;
  unit: SelectionUnit;
  source: GridSelectionActionContext["source"];
  /** The members to save, or how to freeze them once the panel is open. */
  scope: SelectionScope | (() => Promise<SelectionScope>);
  /** Scope counts for the title; null while a deferred scope is still counting. */
  counts: SelectionCounts | null;
  /** Add into an existing subset, or save only as a new one. */
  mode: "add" | "create";
  /** The bucket an explicit scope came from, when it has a name to show. */
  within?: string;
}

function AddToSubset({
  context,
  disabledReason,
  surface = "toolbar",
}: GridSelectionActionProps) {
  const permission = useSelectionSubsetDisabledReason();
  const [capture, setCapture] = useState<Capture | null>(null);
  const scoped = Boolean(context.boundary.subsetId);
  const label = scoped ? "Save as new subset" : "Save as subset";
  const begin = () => {
    if (permission) return;
    setCapture({
      datasetId: context.datasetId,
      mediaType: context.mediaType,
      view: context.view,
      preferredGroupSlice: context.preferredGroupSlice,
      unit: context.unit,
      source: context.source,
      counts: context.counts,
      within: context.bucket?.name,
      scope: async () => {
        const resolved = await context.resolve();
        return resolved.kind === "members"
          ? {
              kind: "members",
              members: normalizeSelectionMembers(resolved.members),
            }
          : resolved;
      },
      mode: scoped ? "create" : "add",
    });
  };
  const close = () => setCapture(null);
  return (
    <>
      <ActionSurface
        open={Boolean(capture)}
        onClose={close}
        title={label}
        className={styles.subsetSheet}
        surface={surface}
        trigger={
          <ActionEntry
            label={label}
            icon={GridViewIcon}
            surface={surface}
            onClick={() => (capture ? close() : begin())}
            disabledReason={permission || disabledReason}
            aria-haspopup="dialog"
            aria-expanded={Boolean(capture)}
          />
        }
      >
        {capture && <SubsetPanel capture={capture} close={close} />}
      </ActionSurface>
    </>
  );
}

const EMPTY_VIEW: readonly unknown[] = [];

interface Pending {
  subset: SavedSubset;
  operationId: string;
}

/**
 * Adds a frozen scope to a subset with one press, or saves it as a new
 * subset from a short form. Every step keeps its identity (created subset,
 * operation, prepared members) so a retry resumes instead of repeating.
 */
export function SubsetPanel({
  capture,
  close,
  heading: showHeading = true,
}: {
  capture: Capture;
  close: () => void;
  /** Off when a surrounding modal already titles the panel. */
  heading?: boolean;
}) {
  const permission = useSelectionSubsetDisabledReason();
  // The subset records which saved query its members were picked from
  const savedView = useLoadedSavedViewName();
  const invalidate = useInvalidateSelectionScope(capture.datasetId);
  const jobs = useSubsetJobs(capture.datasetId);
  const [jobId, setJobId] = useState<string>();
  const creating = capture.mode === "create";
  const [view, setView] = useState<"list" | "form">(creating ? "form" : "list");
  const [baseScope, setScope] = useState<SelectionScope | null>(
    typeof capture.scope === "function" ? null : capture.scope,
  );
  const groupScope = useGroupActionScope(
    capture.datasetId,
    capture.mediaType,
    baseScope,
    capture.view ?? EMPTY_VIEW,
  );
  const scope = groupScope.scope;
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const freeze = useCallback(async () => {
    if (typeof capture.scope !== "function") return;
    setScopeError(null);
    try {
      setScope(await capture.scope());
    } catch (cause) {
      setScopeError(String(cause));
    }
  }, [capture]);
  // This effect freezes a deferred scope (all current results as a server
  // snapshot) as soon as the panel opens, so exact counts show before saving.
  useEffect(() => {
    void freeze();
  }, [freeze]);

  const { unit } = capture;
  const counts = scope
    ? scope.kind === "members"
      ? memberCounts(scope.members)
      : scope.counts
    : capture.counts;
  const phrase = counts
    ? scopePhrase(capture.source, counts, unit, capture.within)
    : capture.source === "results"
      ? `all ${unit.many} in view`
      : `selected ${unit.many}`;

  const addTo = async (subset: SavedSubset, resume: Pending | null) => {
    if (!scope || permission) return;
    const operation: Pending =
      resume?.subset.id === subset.id
        ? resume
        : { subset, operationId: crypto.randomUUID() };
    setPending(operation);
    setBusy(true);
    setError(null);
    try {
      const id = await jobs.start(subset, {
        subsetId: subset.id,
        operationId: operation.operationId,
        ...scopeBody(scope),
        view: capture.view,
        ...(savedView && { savedView }),
      });
      setJobId(id);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  const createAndAdd = async () => {
    if (permission || !scope || (!pending && !name.trim())) return;
    let subset = pending?.subset;
    if (!subset) {
      setBusy(true);
      setError(null);
      try {
        subset = await subsetRequest<SavedSubset>(capture.datasetId, "", {
          name: name.trim(),
          description: description.trim() || undefined,
          view: capture.view,
          preferredGroupSlice: capture.preferredGroupSlice,
        });
        invalidate();
      } catch (cause) {
        setError(String(cause));
        setBusy(false);
        return;
      }
    }
    if (scope.kind === "members" && scope.members.length === 0) {
      setBusy(false);
      close();
      return;
    }
    await addTo(subset, pending);
  };

  const title =
    view === "form"
      ? counts?.episodes === 0
        ? "New subset"
        : `New subset from ${phrase}`
      : `Add ${phrase} to subset`;
  const empty = counts?.episodes === 0;
  const heading = showHeading ? (
    <Text variant="label" color="text-secondary" className={styles.sheetTitle}>
      {title}
    </Text>
  ) : null;
  const expansionChoice =
    groupScope.enabled && !empty ? (
      <Segmented<"slice" | "all">
        label="Slices"
        value={groupScope.choice}
        disabled={busy || Boolean(pending)}
        options={[
          { value: "slice", label: "Selected samples" },
          { value: "all", label: "All slices of these groups" },
        ]}
        onChange={groupScope.setChoice}
      />
    ) : null;
  const captureError = groupScope.error ?? scopeError;
  const scopeStatus = scope ? null : captureError ? (
    <span className={styles.inlineAlert} role="alert">
      <Text variant="body-tertiary" color="text-failure">
        {captureError}
      </Text>
      <Button
        size="xs"
        variant="borderless"
        leadingIcon={RefreshIcon}
        onClick={() => (groupScope.error ? groupScope.retry() : void freeze())}
      >
        Retry
      </Button>
    </span>
  ) : (
    <LoadingDots
      variant="body-tertiary"
      color="text-secondary"
      text="Freezing scope"
    />
  );

  if (jobId)
    return (
      <SubsetJobStatus
        datasetId={capture.datasetId}
        jobId={jobId}
        close={close}
      />
    );

  if (view === "form")
    return (
      <form
        className={styles.sheetBody}
        onSubmit={(event) => {
          event.preventDefault();
          void createAndAdd();
        }}
      >
        {heading}
        {scopeStatus}
        {empty && (
          <div className={styles.emptySubsetIntro}>
            <span className={styles.subsetCreateIcon} aria-hidden="true">
              <LayersIcon size="md" color="text-secondary" />
            </span>
            <div className={styles.emptySubsetText}>
              <Text variant="body-secondary">Empty subset</Text>
              <Text variant="body-tertiary" color="text-secondary">
                No samples yet — add them from the grid later
              </Text>
            </div>
          </div>
        )}
        {expansionChoice}
        <FormField
          label={empty ? undefined : "Subset name"}
          control={
            <Input
              size="md"
              className={styles.subsetNameInput}
              aria-label="New subset name"
              placeholder={empty ? "Subset name" : "Enter a subset name"}
              value={pending?.subset.name ?? name}
              disabled={busy || Boolean(pending)}
              onChange={(event) => setName(event.target.value)}
            />
          }
        />
        <TextArea
          size="md"
          aria-label="Description"
          placeholder="Description (optional)"
          rows={2}
          resize={ResizeBehavior.None}
          value={description}
          disabled={busy || Boolean(pending)}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div className={styles.sheetActions}>
          <Button
            type="button"
            size="md"
            variant="secondary"
            disabled={busy}
            onClick={() => (creating ? close() : setView("list"))}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="md"
            disabled={
              Boolean(permission) ||
              busy ||
              !scope ||
              (!pending && !name.trim())
            }
          >
            {busy ? "Saving…" : error ? "Retry" : "Save subset"}
          </Button>
        </div>
        {error && (
          <Notice
            tone="error"
            icon={ErrorOutlineIcon}
            role="alert"
            title={error}
          >
            {pending
              ? `${pending.subset.name} was created; retry to finish saving its members.`
              : "Nothing was saved."}
          </Notice>
        )}
      </form>
    );

  return (
    <div className={styles.sheetBody}>
      {heading}
      {scopeStatus}
      {expansionChoice}
      <SubsetBrowser
        datasetId={capture.datasetId}
        view={capture.view ?? []}
        renderSubset={(subset) => (
          <button
            key={subset.id}
            type="button"
            className={styles.row}
            disabled={Boolean(permission) || busy || !scope}
            onClick={() => void addTo(subset, pending)}
          >
            <FolderIcon size="md" color="text-secondary" />
            <span className={styles.rowText}>
              <Text variant="body-secondary">{subset.name}</Text>
              <Text
                variant="body-tertiary"
                color="text-secondary"
                className={subset.description ? styles.rowClamp : undefined}
                title={subset.description ?? undefined}
              >
                {subset.description ?? savedSubsetLabel(subset, unit)}
              </Text>
            </span>
            {subset.description && (
              <Text variant="caption" color="text-secondary">
                {savedSubsetLabel(subset, unit)}
              </Text>
            )}
            {busy && pending?.subset.id === subset.id && <Spinner size="xs" />}
          </button>
        )}
      />
      <hr className={styles.rule} />
      <button
        type="button"
        className={styles.row}
        disabled={busy}
        onClick={() => setView("form")}
      >
        <AddIcon size="md" color="text-secondary" />
        <Text variant="body-secondary" className={styles.rowText}>
          New subset
        </Text>
      </button>
      {error && (
        <Notice tone="error" icon={ErrorOutlineIcon} role="alert" title={error}>
          Your captured scope is kept for retry.
        </Notice>
      )}
      {error && pending && (
        <div className={styles.sheetActions}>
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={RefreshIcon}
            disabled={busy}
            onClick={() => void addTo(pending.subset, pending)}
          >
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

/** Common persistence action for both product shells. */
export const addToSubsetAction: GridSelectionAction = {
  id: "fiftyone:add-to-subset",
  order: 20,
  label: "Save as subset",
  placement: "primary",
  supports: () => true,
  scope: "explicit-or-results",
  memberKinds: ["episode", "segment"],
  unavailable: () => null,
  Component: AddToSubset,
};
