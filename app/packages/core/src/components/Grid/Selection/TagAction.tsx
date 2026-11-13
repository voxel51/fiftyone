import type {
  GridSelectionAction,
  GridSelectionActionContext,
  GridSelectionActionProps,
} from "@fiftyone/multimodal/extensions/grid-selection";
import { useRefresh, useSelectionTagDisabledReason } from "@fiftyone/state";
import {
  combineSelectionCaptures,
  memberCounts,
  normalizeSelectionMembers,
  selectionTagsRequest,
  useInvalidateSelectionScope,
} from "@fiftyone/state/src/selection";
import { getEventBus } from "@fiftyone/events";
import { NetworkError } from "@fiftyone/utilities";
import {
  AddIcon,
  Button,
  ErrorOutlineIcon,
  Input,
  LoadingDots,
  SearchIcon,
  Spinner,
  TagIcon,
  Text,
  WarningAmberIcon,
} from "@voxel51/voodo";
import { useEffect, useMemo, useRef, useState } from "react";
import ActionEntry from "./ActionEntry";
import ActionSurface from "./ActionSurface";
import { plural, scopePhrase, unitTitlePlural } from "./format";
import { Notice } from "./Notice";
import Segmented from "./Segmented";
import { useGroupActionScope } from "./useGroupActionScope";
import { useTagScope, type TagScope } from "./useTagScope";
import styles from "./SelectionTray.module.css";
import tagStyles from "./TagAction.module.css";

type Target = "members" | "labels";

interface TagState {
  tags: readonly string[];
  applied: Readonly<Record<string, number>>;
  targets: number;
  labels: number | null;
  disabledReason?: string;
}

interface SaveAttempt {
  capture: TagScope;
  target: Target;
  expandGroups: boolean;
  resolved: boolean;
  changes: ReadonlyMap<string, boolean>;
  state: TagState;
  readKey: string;
}

function tagError(cause: unknown) {
  return {
    message: String(cause),
    requiresReopen: cause instanceof NetworkError && cause.code === 410,
  };
}

function TagSelection({
  context,
  disabledReason,
  surface = "toolbar",
}: GridSelectionActionProps) {
  const permission = useSelectionTagDisabledReason();
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const close = () => {
    if (!applying) setOpen(false);
  };
  return (
    <>
      <ActionSurface
        open={open}
        onClose={close}
        title="Tag"
        surface={surface}
        dismissible={false}
        trigger={
          <ActionEntry
            label="Tag"
            icon={TagIcon}
            surface={surface}
            onClick={() => setOpen(true)}
            disabledReason={open ? null : (permission ?? disabledReason)}
            aria-haspopup="dialog"
            aria-expanded={open}
          />
        }
      >
        {open && (
          <TagPicker
            key={`${context.datasetId}:${context.conversion}`}
            context={context}
            disabledReason={disabledReason}
            onApplyingChange={setApplying}
            onClose={close}
          />
        )}
      </ActionSurface>
    </>
  );
}

/** e2e specs wait on a tag change being written before reading tags */
type TagActionE2EEvents = { "e2e:tags:applied": undefined };

/** Edit tag actions on the live selection, freezing each save and its retries. */
function TagPicker({
  context,
  disabledReason,
  onApplyingChange,
  onClose,
}: {
  context: GridSelectionActionContext;
  disabledReason: string | null;
  onApplyingChange: (applying: boolean) => void;
  onClose: () => void;
}) {
  const permission = useSelectionTagDisabledReason();
  const invalidate = useInvalidateSelectionScope(context.datasetId);
  const refresh = useRefresh();
  const live = useTagScope(context);
  const groupScope = useGroupActionScope(
    context.datasetId,
    context.mediaType,
    live.capture?.scope ?? null,
    live.capture?.context.view ?? context.view,
  );
  const scope = groupScope.scope;
  const [save, setSave] = useState<SaveAttempt | null>(null);
  const current = save?.capture.context ?? context;
  const { unit } = current;
  const displayedScope = save?.capture.scope ?? scope;
  const counts = useMemo(
    () =>
      displayedScope?.kind === "snapshot"
        ? displayedScope.counts
        : displayedScope
          ? { ...current.counts, ...memberCounts(displayedScope.members) }
          : current.counts,
    [displayedScope, current.counts],
  );
  const labelsOnly = Boolean(current.conversion);
  const [choice, setTarget] = useState<Target>("members");
  const target = labelsOnly ? "labels" : choice;
  const options = useMemo(
    () => ({ target, view: live.capture?.context.view ?? context.view }),
    [target, live.capture?.context.view, context.view],
  );
  const [loaded, setLoaded] = useState<{ key: string; state: TagState } | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [changes, setChanges] = useState(new Map<string, boolean>());
  const actionNodes = useRef(new Map<string, HTMLDivElement>());
  const editor = useRef<HTMLDivElement>(null);
  const focusTag = useRef<string | null>(null);
  const saving = useRef(false);
  const [applied, setApplied] = useState(false);
  // This effect tells e2e specs a tag change has been written.
  useEffect(() => {
    if (applied) getEventBus<TagActionE2EEvents>().dispatch("e2e:tags:applied");
  }, [applied]);
  const [failure, setFailure] = useState<ReturnType<typeof tagError> | null>(
    null,
  );
  const [loadError, setLoadError] = useState<{
    key: string;
    error: ReturnType<typeof tagError>;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const readKey = useMemo(
    () =>
      JSON.stringify([
        live.capture?.key,
        scope?.kind === "snapshot"
          ? scope.snapshotId
          : scope
            ? "members"
            : null,
        target,
        attempt,
      ]),
    [live.capture?.key, scope, target, attempt],
  );
  const state = save?.state ?? (loaded?.key === readKey ? loaded.state : null);
  const error = save
    ? failure
    : loadError?.key === readKey
      ? loadError.error
      : null;
  const locked = Boolean(save);
  const labelsUnavailable = !save && target === "labels" && counts.segments > 0;

  // This effect keeps keyboard focus on the row when its action buttons change.
  useEffect(() => {
    if (focusTag.current !== null) {
      const button = actionNodes.current
        .get(focusTag.current)
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)");
      (button ?? editor.current?.querySelector("input"))?.focus();
      focusTag.current = null;
    }
  }, [changes]);

  // This effect refreshes membership counts without discarding pending actions.
  useEffect(() => {
    if (
      !live.capture ||
      !scope ||
      locked ||
      labelsUnavailable ||
      loaded?.key === readKey
    )
      return undefined;
    let active = true;
    setLoadError(null);
    const load = async () => {
      try {
        const result = await selectionTagsRequest(
          context.datasetId,
          scope,
          options,
        );
        if (active) setLoaded({ key: readKey, state: result });
      } catch (cause) {
        if (active) setLoadError({ key: readKey, error: tagError(cause) });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [
    context.datasetId,
    live.capture,
    scope,
    options,
    readKey,
    locked,
    loaded,
    labelsUnavailable,
  ]);

  const tag = query.trim();
  const needle = tag.toLowerCase();
  const tags = Array.from(
    new Set([...(state?.tags ?? loaded?.state.tags ?? []), ...changes.keys()]),
  ).sort();
  const filtered = tags.filter((value) => value.toLowerCase().includes(needle));
  const known = tags.includes(tag);
  const total = state?.targets ?? 0;
  const noLabels = target === "labels" && state !== null && !state.labels;
  const blocked =
    Boolean(permission || disabledReason || state?.disabledReason || error) ||
    !scope ||
    !state ||
    total === 0 ||
    noLabels ||
    labelsUnavailable;
  const targetUnit =
    target === "labels"
      ? { one: "label", many: "labels" }
      : counts.segments
        ? counts.fullEpisodes
          ? { one: "item", many: "items" }
          : { one: "stream range", many: "stream ranges" }
        : unit;
  const targetText = (count: number) =>
    plural(count, targetUnit.one, targetUnit.many);
  const affected = (value: string, add: boolean) =>
    add ? total - (state?.applied[value] ?? 0) : (state?.applied[value] ?? 0);
  const hasEdits = [...changes].some(
    ([value, add]) => affected(value, add) > 0,
  );
  const refreshing =
    !state &&
    !error &&
    !live.empty &&
    !live.noResults &&
    !live.error &&
    !groupScope.error &&
    !labelsUnavailable;
  const refreshSelection = () => {
    setSave(null);
    setFailure(null);
    setLoaded(null);
    setLoadError(null);
    setAttempt((value) => value + 1);
    live.retry();
  };

  const stage = (value: string, add: boolean) => {
    if (blocked || saving.current || locked) return;
    setApplied(false);
    setChanges((current) => new Map(current).set(value, add));
  };
  const undo = (value: string) => {
    if (saving.current || locked) return;
    setApplied(false);
    setChanges((current) => {
      const next = new Map(current);
      next.delete(value);
      return next;
    });
  };
  const submit = () => {
    if (!tag || blocked || saving.current || locked) return;
    if ((state?.applied[tag] ?? 0) < total) stage(tag, true);
    else undo(tag);
    setQuery("");
  };
  const apply = async () => {
    if (saving.current || permission || error?.requiresReopen) return;
    if (!save && (blocked || !hasEdits || !live.capture || !scope || !state))
      return;
    let operation: SaveAttempt;
    if (save) operation = save;
    else {
      if (!live.capture || !scope || !state) return;
      operation = {
        capture: { ...live.capture, scope },
        target,
        expandGroups: groupScope.enabled && groupScope.choice === "all",
        resolved: false,
        changes: new Map(changes),
        state,
        readKey,
      };
    }
    saving.current = true;
    setBusy(true);
    onApplyingChange(true);
    setFailure(null);
    setSave(operation);
    try {
      const captured = operation.capture.context;
      if (!operation.resolved) {
        let resolved = await captured.resolve();
        if (resolved.kind === "members")
          resolved = {
            kind: "members",
            members: normalizeSelectionMembers(resolved.members),
          };
        if (operation.expandGroups)
          resolved = await combineSelectionCaptures(captured.datasetId, {
            view: captured.view,
            members: resolved.kind === "members" ? resolved.members : [],
            snapshotIds:
              resolved.kind === "snapshot" ? [resolved.snapshotId] : [],
            groups: "all",
          });
        operation = {
          ...operation,
          capture: { ...operation.capture, scope: resolved },
          resolved: true,
        };
        setSave(operation);
      }
      const result = await selectionTagsRequest(
        captured.datasetId,
        operation.capture.scope,
        {
          target: operation.target,
          view: captured.view,
          changes: Object.fromEntries(operation.changes),
        },
      );
      setLoaded({ key: operation.readKey, state: result });
      setApplied(true);
      setChanges(new Map());
      setSave(null);
    } catch (cause) {
      const failure = tagError(cause);
      setFailure(failure);
      // Partial writes and retries stay bound to the attempted selection.
      try {
        if (operation.resolved && !failure.requiresReopen) {
          const result = await selectionTagsRequest(
            operation.capture.context.datasetId,
            operation.capture.scope,
            { target: operation.target, view: operation.capture.context.view },
          );
          operation = { ...operation, state: result };
        }
      } catch {
        // Keep the original counts and save error if reconciliation also fails.
      }
      setSave(operation);
    } finally {
      invalidate();
      refresh();
      saving.current = false;
      setBusy(false);
      onApplyingChange(false);
    }
  };

  return (
    <div className={styles.sheetBody} ref={editor}>
      <Text
        variant="label"
        color="text-secondary"
        className={styles.sheetTitle}
      >
        {!save && live.empty
          ? current.bucket
            ? `No ${unit.many} in ${current.bucket.name}`
            : "Nothing selected"
          : !save && live.noResults
            ? `No ${unit.many} in view`
            : `${save && !busy ? "Retry tagging" : "Tag"} ${scopePhrase(current.source, counts, unit, current.bucket?.name)}`}
      </Text>
      {!save && live.empty && context.source === "results" && (
        <Button
          size="sm"
          variant="secondary"
          disabled={Boolean(disabledReason)}
          onClick={live.selectAll}
        >
          {`Tag ${scopePhrase("results", context.counts, context.unit)}`}
        </Button>
      )}
      {labelsOnly ? (
        <Text variant="body-tertiary" color="text-secondary">
          Tag source labels
        </Text>
      ) : (
        <Segmented<Target>
          label="Tag"
          value={target}
          disabled={locked || changes.size > 0}
          options={[
            {
              value: "members",
              label: counts.segments
                ? counts.fullEpisodes
                  ? `${unitTitlePlural(unit)} and segments`
                  : "Segments"
                : unitTitlePlural(unit),
            },
            {
              value: "labels",
              label: "Labels",
              disabledReason: counts.segments
                ? `Label tagging needs whole ${unit.many}`
                : null,
            },
          ]}
          onChange={setTarget}
        />
      )}
      {groupScope.enabled && (
        <Segmented<"slice" | "all">
          label="Slices"
          value={groupScope.choice}
          disabled={locked || changes.size > 0}
          options={[
            { value: "slice", label: "Selected samples" },
            { value: "all", label: "All slices of these groups" },
          ]}
          onChange={groupScope.setChoice}
        />
      )}
      {groupScope.error && (
        <span role="alert">
          <Text color="text-failure">{groupScope.error}</Text>
          <Button size="xs" variant="borderless" onClick={groupScope.retry}>
            Retry expansion
          </Button>
        </span>
      )}
      {!save && live.error && (
        <Notice
          tone="error"
          icon={ErrorOutlineIcon}
          role="alert"
          title={live.error}
        >
          <Button size="xs" variant="borderless" onClick={live.retry}>
            Retry
          </Button>
        </Notice>
      )}
      <Input
        size="md"
        icon={SearchIcon}
        aria-label="Create or find tag"
        placeholder="Create or find tag"
        value={query}
        disabled={blocked || locked}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            submit();
          }
        }}
      />
      <div role="group" aria-label="Tags" className={styles.list}>
        {refreshing && !loaded && (
          <LoadingDots
            variant="body-tertiary"
            color="text-secondary"
            text="Loading tags"
          />
        )}
        {filtered.map((value) => {
          const count = (state ?? loaded?.state)?.applied[value] ?? 0;
          const displayTotal = state?.targets ?? loaded?.state.targets ?? 0;
          const pending = changes.has(value);
          const countText = !state
            ? ""
            : total === 1
              ? `${count ? "On" : "Not on"} this ${targetUnit.one}`
              : !count
                ? `Not on these ${targetUnit.many}`
                : count === total
                  ? `On all ${total.toLocaleString()}`
                  : `On ${count.toLocaleString()} of ${total.toLocaleString()}`;
          const changed = affected(value, changes.get(value) ?? false);
          const intent = pending
            ? !state
              ? ""
              : !changed
                ? "No change"
                : `Will ${changes.get(value) ? "add to" : "remove from"} ${targetText(changed)}`
            : null;
          return (
            <div
              key={value}
              role="group"
              aria-label={value}
              className={tagStyles.row}
            >
              <div className={tagStyles.description}>
                <Text
                  variant="body-secondary"
                  className={tagStyles.label}
                  title={value}
                >
                  {value}
                </Text>
                <Text
                  variant="caption"
                  color="text-secondary"
                  className={tagStyles.status}
                >
                  {countText}
                </Text>
                {pending && (
                  <Text
                    variant="caption"
                    color="text-accent"
                    className={tagStyles.status}
                  >
                    {intent}
                  </Text>
                )}
              </div>
              <div
                className={tagStyles.actions}
                ref={(node) => {
                  if (node) actionNodes.current.set(value, node);
                  else actionNodes.current.delete(value);
                }}
              >
                {pending ? (
                  <Button
                    size="xs"
                    variant="secondary"
                    disabled={locked}
                    onClick={() => {
                      focusTag.current = value;
                      undo(value);
                    }}
                  >
                    Undo
                  </Button>
                ) : (
                  <>
                    {(count < displayTotal || displayTotal === 0) && (
                      <Button
                        size="xs"
                        variant="secondary"
                        disabled={blocked || locked}
                        onClick={() => {
                          focusTag.current = value;
                          stage(value, true);
                        }}
                      >
                        Add
                      </Button>
                    )}
                    {count > 0 && (
                      <Button
                        size="xs"
                        variant="secondary"
                        disabled={blocked || locked}
                        onClick={() => {
                          focusTag.current = value;
                          stage(value, false);
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
        {state && tag && !known && (
          <button
            type="button"
            className={styles.row}
            disabled={blocked || locked}
            onClick={submit}
          >
            <AddIcon size="sm" color="text-secondary" />
            <Text variant="body-secondary" className={styles.rowText}>
              {`Create “${tag}”`}
            </Text>
          </button>
        )}
        {state && !blocked && !filtered.length && !tag && (
          <Text
            variant="body-tertiary"
            color="text-secondary"
            className={styles.listEmpty}
          >
            No tags yet. Type a name to create one.
          </Text>
        )}
      </div>
      {labelsUnavailable && (
        <Notice
          tone="warning"
          icon={WarningAmberIcon}
          title={`Label tagging needs whole ${unit.many}`}
        />
      )}
      {noLabels && (
        <Notice
          tone="warning"
          icon={WarningAmberIcon}
          title={state?.disabledReason ?? `No labels in these ${unit.many}.`}
        />
      )}
      {permission && (
        <Notice
          tone="error"
          icon={ErrorOutlineIcon}
          role="alert"
          title={permission}
        />
      )}
      {error && (
        <Notice
          tone="error"
          icon={ErrorOutlineIcon}
          role="alert"
          title={error.message}
        >
          {error.requiresReopen
            ? "Selection expired. Refresh to review your edits."
            : save
              ? "Some changes may be saved. Retry uses the original selection."
              : "Could not load tags."}
          {(!save || error.requiresReopen) && (
            <Button
              size="xs"
              variant="secondary"
              onClick={
                error.requiresReopen
                  ? refreshSelection
                  : () => setAttempt((value) => value + 1)
              }
            >
              {error.requiresReopen ? "Refresh selection" : "Retry"}
            </Button>
          )}
        </Notice>
      )}
      <div className={tagStyles.footer}>
        <Text variant="caption" color="text-secondary" role="status">
          {refreshing && loaded
            ? "Updating tags…"
            : applied && !changes.size
              ? "Applied"
              : ""}
        </Text>
        <div className={styles.sheetActions}>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={onClose}
          >
            {error?.requiresReopen ? "Close" : changes.size ? "Cancel" : "Done"}
          </Button>
          <Button
            size="sm"
            disabled={
              busy ||
              Boolean(permission) ||
              Boolean(error?.requiresReopen) ||
              (!save && (blocked || !hasEdits))
            }
            onClick={() => void apply()}
          >
            {busy && <Spinner size="xs" />}
            {busy
              ? "Applying…"
              : save
                ? "Retry"
                : state
                  ? `Apply to ${targetText(total)}`
                  : "Apply"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Shared OSS/Enterprise action for exact episode and segment tagging. */
export const tagSelectionAction: GridSelectionAction = {
  id: "fiftyone:tag-selection",
  order: 10,
  label: "Tag",
  placement: "primary",
  supports: () => true,
  scope: "explicit-or-results",
  memberKinds: ["episode", "segment"],
  unavailable: (context) => {
    if (context.counts.unavailable)
      return `Remove unavailable ${context.unit.many} before tagging`;
    if (
      context.groups.some((group) =>
        group.members.some(
          (member) =>
            member.kind === "segment" &&
            !["sequence", "duration-ns", "timestamp-ns"].includes(
              member.range.timebase,
            ),
        ),
      )
    )
      return "This segment timebase does not support tags";
    return null;
  },
  Component: TagSelection,
};
