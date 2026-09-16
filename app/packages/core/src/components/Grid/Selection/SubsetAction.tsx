import type {
  GridSelectionAction,
  GridSelectionActionContext,
  GridSelectionActionProps,
} from "@fiftyone/multimodal/extensions/grid-selection";
import {
  memberCounts,
  normalizeSelectionMembers,
  scopeBody,
  selectionScopeLabel,
  subsetRequest,
  useInvalidateSelectionScope,
  type SavedSubset,
  type SelectionCounts,
  type SelectionScope,
  type SelectionUnit,
  type SubsetAddResult,
} from "@fiftyone/state/src/selection";
import {
  AddIcon,
  Button,
  CheckCircleOutlineIcon,
  ErrorOutlineIcon,
  FolderIcon,
  GridViewIcon,
  Input,
  LoadingDots,
  LockIcon,
  RefreshIcon,
  ResizeBehavior,
  Size,
  Spinner,
  Text,
  TextArea,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import { useCallback, useEffect, useState } from "react";
import ActionEntry from "./ActionEntry";
import ActionSurface from "./ActionSurface";
import { plural, scopePhrase } from "./format";
import { Notice } from "./Notice";
import styles from "./SelectionTray.module.css";
import SubsetBrowser from "./SubsetBrowser";
import {
  defaultSubsetScope,
  useOpenSubset,
  useSavedSubset,
} from "./useSubsetScope";

/** A frozen scope and how it will be saved. */
export interface Capture {
  datasetId: string;
  mediaType: string;
  unit: SelectionUnit;
  source: GridSelectionActionContext["source"];
  /** The members to save, or how to freeze them once the panel is open. */
  scope: SelectionScope | (() => Promise<SelectionScope>);
  /** Scope counts for the title; null while a deferred scope is still counting. */
  counts: SelectionCounts | null;
  /** Add into an existing subset, or save only as a new one. */
  mode: "add" | "create";
  /** The open subset, which is a saved selection and cannot change. */
  frozenId?: string;
}

function AddToSubset({
  context,
  disabledReason,
  surface = "toolbar",
}: GridSelectionActionProps) {
  const [capture, setCapture] = useState<Capture | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Inside an open subset the only write is a new subset: the open one is a
  // saved selection and never changes underneath the person browsing it.
  const frozenId = context.boundary.subsetId;
  const label = frozenId ? "Save as new subset" : "Add to subset";
  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const resolved = await context.resolve();
      setCapture({
        datasetId: context.datasetId,
        mediaType: context.mediaType,
        unit: context.unit,
        source: context.source,
        counts: context.counts,
        scope:
          resolved.kind === "members"
            ? {
                kind: "members",
                members: normalizeSelectionMembers(resolved.members),
              }
            : resolved,
        mode: frozenId ? "create" : "add",
        frozenId,
      });
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  const close = () => setCapture(null);
  return (
    <>
      <ActionSurface
        open={Boolean(capture)}
        onClose={close}
        title={label}
        surface={surface}
        trigger={
          <ActionEntry
            label={label}
            icon={GridViewIcon}
            surface={surface}
            onClick={() => (capture ? close() : void begin())}
            disabledReason={disabledReason}
            busy={busy}
            busyLabel="Preparing…"
            aria-haspopup="dialog"
            aria-expanded={Boolean(capture)}
          />
        }
      >
        {capture && <SubsetPanel capture={capture} close={close} />}
      </ActionSurface>
      {error && (
        <Text
          role="alert"
          variant={TextVariant.Xs}
          color={TextColor.Destructive}
        >
          {error}
        </Text>
      )}
    </>
  );
}

interface Pending {
  subset: SavedSubset;
  operationId: string;
  prepared: boolean;
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
  const invalidate = useInvalidateSelectionScope(capture.datasetId);
  const openSubset = useOpenSubset(capture.datasetId);
  const creating = capture.mode === "create";
  const [view, setView] = useState<"list" | "form">(creating ? "form" : "list");
  const [scope, setScope] = useState<SelectionScope | null>(
    typeof capture.scope === "function" ? null : capture.scope,
  );
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [result, setResult] = useState<{
    subset: SavedSubset;
    added: SubsetAddResult;
  } | null>(null);
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
    ? scopePhrase(capture.source, counts, unit)
    : capture.source === "results"
      ? `all ${unit.many} in view`
      : `selected ${unit.many}`;
  const { subset: frozen } = useSavedSubset(
    capture.datasetId,
    capture.frozenId,
  );
  const memberNoun = (count: number) =>
    counts?.segments
      ? plural(count, "member")
      : plural(count, unit.one, unit.many);

  const addTo = async (subset: SavedSubset, resume: Pending | null) => {
    if (!scope) return;
    let operation: Pending =
      resume?.subset.id === subset.id
        ? resume
        : { subset, operationId: crypto.randomUUID(), prepared: false };
    setPending(operation);
    setBusy(true);
    setError(null);
    try {
      if (!operation.prepared) {
        await subsetRequest<SubsetAddResult>(capture.datasetId, "/add", {
          phase: "prepare",
          subsetId: subset.id,
          operationId: operation.operationId,
          ...scopeBody(scope),
        });
        operation = { ...operation, prepared: true };
        setPending(operation);
      }
      const added = await subsetRequest<SubsetAddResult>(
        capture.datasetId,
        "/add",
        { phase: "apply", operationId: operation.operationId },
      );
      setResult({ subset, added });
      setPending(null);
      invalidate();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  const createAndAdd = async () => {
    if (!scope || (!pending && !name.trim())) return;
    let subset = pending?.subset;
    if (!subset) {
      setBusy(true);
      setError(null);
      try {
        subset = await subsetRequest<SavedSubset>(capture.datasetId, "", {
          name: name.trim(),
          description: description.trim() || undefined,
        });
        invalidate();
      } catch (cause) {
        setError(String(cause));
        setBusy(false);
        return;
      }
    }
    await addTo(subset, pending);
  };

  const title =
    view === "form" ? `New subset from ${phrase}` : `Add ${phrase} to subset`;
  const heading = showHeading ? (
    <Text
      variant={TextVariant.Label}
      color={TextColor.Secondary}
      className={styles.sheetTitle}
    >
      {title}
    </Text>
  ) : null;
  const scopeStatus = scope ? null : scopeError ? (
    <span className={styles.inlineAlert} role="alert">
      <Text variant={TextVariant.Sm} color={TextColor.Destructive}>
        {scopeError}
      </Text>
      <Button
        size={Size.Xs}
        variant={Variant.Borderless}
        leadingIcon={RefreshIcon}
        onClick={() => void freeze()}
      >
        Retry
      </Button>
    </span>
  ) : (
    <LoadingDots
      variant={TextVariant.Sm}
      color={TextColor.Secondary}
      text="Freezing scope"
    />
  );

  if (result) {
    const { added, duplicates } = result.added;
    return (
      <div className={styles.sheetBody}>
        {heading}
        <Notice
          tone="success"
          icon={CheckCircleOutlineIcon}
          role="status"
          title={
            added === 0
              ? `Everything here was already in ${result.subset.name}.`
              : view === "form"
                ? `Saved ${memberNoun(added)} as ${result.subset.name}.`
                : `Added ${memberNoun(added)} to ${result.subset.name}.`
          }
        >
          {added > 0 && duplicates > 0
            ? `${memberNoun(duplicates)} were already in the subset.`
            : null}
        </Notice>
        <div className={styles.sheetActions}>
          <Button size={Size.Sm} variant={Variant.Borderless} onClick={close}>
            Done
          </Button>
          <Button
            size={Size.Sm}
            variant={Variant.Secondary}
            onClick={() => {
              openSubset(
                result.subset.id,
                defaultSubsetScope(result.added.counts),
              );
              close();
            }}
          >
            Open subset
          </Button>
        </div>
      </div>
    );
  }

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
        {capture.frozenId && (
          <span className={styles.lockNote}>
            <LockIcon size={Size.Sm} color={TextColor.Secondary} />
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              {`${frozen?.name ?? "The open subset"} is a saved selection and can't be changed.`}
            </Text>
          </span>
        )}
        {scopeStatus}
        <Input
          size={Size.Md}
          aria-label="New subset name"
          placeholder="New subset name…"
          value={pending?.subset.name ?? name}
          disabled={busy || Boolean(pending)}
          onChange={(event) => setName(event.target.value)}
        />
        <TextArea
          size={Size.Md}
          aria-label="Description"
          placeholder="Description (optional)"
          rows={3}
          resize={ResizeBehavior.None}
          value={description}
          disabled={busy || Boolean(pending)}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div className={styles.sheetActions}>
          <Button
            type="button"
            size={Size.Md}
            variant={Variant.Secondary}
            disabled={busy}
            onClick={() => (creating ? close() : setView("list"))}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size={Size.Md}
            disabled={busy || !scope || (!pending && !name.trim())}
          >
            {busy ? "Saving…" : error ? "Retry" : "Create subset"}
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
      <SubsetBrowser
        datasetId={capture.datasetId}
        renderSubset={(subset) => (
          <button
            key={subset.id}
            type="button"
            className={styles.row}
            disabled={busy || !scope}
            onClick={() => void addTo(subset, pending)}
          >
            <FolderIcon size={Size.Md} color={TextColor.Secondary} />
            <span className={styles.rowText}>
              <Text variant={TextVariant.Md}>{subset.name}</Text>
              <Text
                variant={TextVariant.Sm}
                color={TextColor.Secondary}
                className={subset.description ? styles.rowClamp : undefined}
                title={subset.description ?? undefined}
              >
                {subset.description ?? selectionScopeLabel(subset.counts, unit)}
              </Text>
            </span>
            {subset.description && (
              <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
                {selectionScopeLabel(subset.counts, unit)}
              </Text>
            )}
            {busy && pending?.subset.id === subset.id && (
              <Spinner size={Size.Xs} />
            )}
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
        <AddIcon size={Size.Md} color={TextColor.Secondary} />
        <Text variant={TextVariant.Md} className={styles.rowText}>
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
            size={Size.Sm}
            variant={Variant.Secondary}
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
  label: "Add to subset",
  placement: "primary",
  supports: () => true,
  scope: "explicit-or-results",
  memberKinds: ["episode", "segment"],
  unavailable: (context) =>
    context.conversion
      ? "Saved subsets are available in the samples view"
      : null,
  Component: AddToSubset,
};
