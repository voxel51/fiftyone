import {
  type GridSelectionAction,
  type GridSelectionActionContext,
  type GridSelectionActionProps,
} from "@fiftyone/multimodal/extensions/grid-selection";
import {
  memberCounts,
  normalizeSelectionMembers,
  scopeBody,
  selectionScopeLabel,
  subsetRequest,
  useInvalidateSelectionScope,
  type SavedSubset,
  type SelectionScope,
  type SelectionUnit,
  type SubsetAddResult,
} from "@fiftyone/state/src/selection";
import {
  AddIcon,
  BookmarkIcon,
  Button,
  CheckCircleOutlineIcon,
  CheckIcon,
  ErrorOutlineIcon,
  Input,
  LibraryAddIcon,
  LoadingDots,
  LockIcon,
  Modal,
  ModalSize,
  OpenInNewIcon,
  RefreshIcon,
  Size,
  Spinner,
  Text,
  TextColor,
  TextVariant,
  Variant,
  WarningAmberIcon,
} from "@voxel51/voodo";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import ActionEntry from "./ActionEntry";
import { plural } from "./format";
import { Notice, ScopePill } from "./Notice";
import styles from "./SelectionTray.module.css";
import { trayTheme } from "./theme";
import { defaultSubsetScope, useOpenSubset } from "./useSubsetScope";

/** A frozen scope and how it will be saved. */
export interface Capture {
  datasetId: string;
  mediaType: string;
  unit: SelectionUnit;
  source: GridSelectionActionContext["source"];
  /** The members to save, or how to freeze them once the dialog is open. */
  scope: SelectionScope | (() => Promise<SelectionScope>);
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
  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const resolved = await context.resolve();
      const scope: SelectionScope =
        resolved.kind === "members"
          ? {
              kind: "members",
              members: normalizeSelectionMembers(resolved.members),
            }
          : resolved;
      setCapture({
        datasetId: context.datasetId,
        mediaType: context.mediaType,
        unit: context.unit,
        source: context.source,
        scope,
        mode: frozenId ? "create" : "add",
        frozenId,
      });
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  const entry = (
    <ActionEntry
      label={frozenId ? "Save as new subset" : "Add to subset"}
      icon={LibraryAddIcon}
      emphasis="primary"
      surface={surface}
      onClick={() => void begin()}
      disabledReason={disabledReason}
      busy={busy}
      busyLabel="Preparing scope…"
      aria-haspopup="dialog"
    />
  );
  const alert = error && (
    <Text role="alert" variant={TextVariant.Xs} color={TextColor.Destructive}>
      {error}
    </Text>
  );
  return (
    <>
      {entry}
      {alert}
      {capture && (
        <SubsetDialog capture={capture} close={() => setCapture(null)} />
      )}
    </>
  );
}

function Stat({
  value,
  label,
  muted,
}: {
  value: number;
  label: string;
  muted?: boolean;
}) {
  return (
    <span className={styles.stat}>
      <Text
        variant={TextVariant.Lg}
        color={muted ? TextColor.Secondary : TextColor.Primary}
      >
        {value.toLocaleString()}
      </Text>
      <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
        {label}
      </Text>
    </span>
  );
}

/**
 * Adds a frozen scope to a subset, or saves it as a new one. Every step keeps
 * its identity (created subset, operation, preview) so a retry after a
 * partial failure continues instead of duplicating work.
 */
export function SubsetDialog({
  capture,
  close,
}: {
  capture: Capture;
  close: () => void;
}) {
  const invalidate = useInvalidateSelectionScope(capture.datasetId);
  const openSubset = useOpenSubset(capture.datasetId);
  const targetsId = useId();
  const creating = capture.mode === "create";
  const [scope, setScope] = useState<SelectionScope | null>(
    typeof capture.scope === "function" ? null : capture.scope,
  );
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [subsets, setSubsets] = useState<readonly SavedSubset[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState<SavedSubset | null>(null);
  const [operation, setOperation] = useState<{
    subsetId: string;
    operationId: string;
  } | null>(null);
  const [preview, setPreview] = useState<SubsetAddResult | null>(null);
  const [result, setResult] = useState<SubsetAddResult | null>(null);
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
  // snapshot) as soon as the dialog opens, so exact counts show before saving.
  useEffect(() => {
    void freeze();
  }, [freeze]);

  // This effect loads the dataset's subsets once for this frozen capture.
  useEffect(() => {
    let active = true;
    subsetRequest<{ subsets: SavedSubset[] }>(capture.datasetId, "")
      .then((value) => {
        if (active) setSubsets(value.subsets);
      })
      .catch((cause: unknown) => {
        if (active) {
          setSubsets([]);
          setListError(String(cause));
        }
      });
    return () => {
      active = false;
    };
  }, [capture.datasetId]);

  const prepare = async (pending: {
    subsetId: string;
    operationId: string;
  }) => {
    if (!scope) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    setOperation(pending);
    try {
      setPreview(
        await subsetRequest<SubsetAddResult>(capture.datasetId, "/add", {
          phase: "prepare",
          ...pending,
          ...scopeBody(scope),
        }),
      );
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  const choose = (subset: SavedSubset) => {
    setTarget(subset);
    void prepare({ subsetId: subset.id, operationId: crypto.randomUUID() });
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const subset = await subsetRequest<SavedSubset>(capture.datasetId, "", {
        name: name.trim(),
      });
      setSubsets((current) => [...(current ?? []), subset]);
      setName("");
      invalidate();
      choose(subset);
    } catch (cause) {
      setError(String(cause));
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!operation) return;
    setBusy(true);
    setError(null);
    try {
      setResult(
        await subsetRequest<SubsetAddResult>(capture.datasetId, "/add", {
          phase: "apply",
          operationId: operation.operationId,
        }),
      );
      invalidate();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  /** Create, freeze, and add in one go; a retry resumes after the last step that succeeded. */
  const saveAsNew = async () => {
    if (!scope || (!target && !name.trim())) return;
    setBusy(true);
    setError(null);
    try {
      let subset = target;
      if (!subset) {
        subset = await subsetRequest<SavedSubset>(capture.datasetId, "", {
          name: name.trim(),
        });
        setTarget(subset);
        invalidate();
      }
      const pending = operation ?? {
        subsetId: subset.id,
        operationId: crypto.randomUUID(),
      };
      setOperation(pending);
      if (!preview)
        setPreview(
          await subsetRequest<SubsetAddResult>(capture.datasetId, "/add", {
            phase: "prepare",
            ...pending,
            ...scopeBody(scope),
          }),
        );
      setResult(
        await subsetRequest<SubsetAddResult>(capture.datasetId, "/add", {
          phase: "apply",
          operationId: pending.operationId,
        }),
      );
      invalidate();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const { unit } = capture;
  const counts = scope
    ? scope.kind === "members"
      ? memberCounts(scope.members)
      : scope.counts
    : null;
  const full = counts?.fullEpisodes ?? 0;
  const segments = counts?.segments ?? 0;
  const scopeText =
    [
      full &&
        (unit.temporal
          ? plural(full, "full episode")
          : plural(full, unit.one, unit.many)),
      segments && plural(segments, "segment"),
    ]
      .filter(Boolean)
      .join(" · ") || "0 members";
  const frozen = capture.frozenId
    ? subsets?.find((subset) => subset.id === capture.frozenId)
    : undefined;
  const nothingNew =
    preview !== null && preview.added === 0 && preview.provenanceUpdated === 0;
  const applyLabel = busy
    ? "Adding…"
    : error && preview
      ? "Retry add"
      : preview?.added
        ? `Add ${plural(preview.added, "member")}`
        : preview?.provenanceUpdated
          ? "Update provenance"
          : "Already in subset";
  const saveLabel = busy ? "Saving…" : error ? "Retry" : "Create subset";

  const footer = (
    <div className={styles.footerActions}>
      <Button
        size={Size.Sm}
        variant={Variant.Borderless}
        onClick={close}
        disabled={busy}
      >
        {result ? "Done" : "Cancel"}
      </Button>
      {result && target && (
        <Button
          size={Size.Sm}
          variant={Variant.Secondary}
          leadingIcon={OpenInNewIcon}
          onClick={() => {
            openSubset(target.id, defaultSubsetScope(result.counts));
            close();
          }}
        >
          Open subset
        </Button>
      )}
      {!result && creating && (
        <Button
          size={Size.Sm}
          disabled={busy || !scope || (!target && !name.trim())}
          onClick={() => void saveAsNew()}
        >
          {saveLabel}
        </Button>
      )}
      {!result && !creating && !preview && operation && error && (
        <Button
          size={Size.Sm}
          variant={Variant.Secondary}
          leadingIcon={RefreshIcon}
          disabled={busy}
          onClick={() => void prepare(operation)}
        >
          Retry preview
        </Button>
      )}
      {!result && !creating && preview && operation && (
        <Button
          size={Size.Sm}
          disabled={busy || nothingNew}
          onClick={() => void apply()}
        >
          {applyLabel}
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      open
      onClose={() => {
        if (!busy) close();
      }}
      title={
        creating
          ? frozen || capture.frozenId
            ? "Save as new subset"
            : "New subset"
          : "Add to subset"
      }
      size={ModalSize.Md}
      footer={footer}
    >
      <div className={styles.dialogBody} style={trayTheme}>
        <div className={styles.scopeCard}>
          <ScopePill source={capture.source} />
          {scope ? (
            <Text variant={TextVariant.Md}>{scopeText}</Text>
          ) : scopeError ? (
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
          )}
          <Text
            variant={TextVariant.Xs}
            color={TextColor.Secondary}
            style={{ flexBasis: "100%" }}
          >
            Captured when opened; later browsing changes do not affect it. Media
            and annotations stay live.
          </Text>
        </div>
        {creating && capture.frozenId && !result && (
          <Notice
            tone="info"
            icon={LockIcon}
            title={`${frozen?.name ?? "The open subset"} is a saved selection and can't be changed.`}
          >
            Save this scope as a new subset instead.
          </Notice>
        )}
        {!result && creating && (
          <form
            className={styles.section}
            onSubmit={(event) => {
              event.preventDefault();
              void saveAsNew();
            }}
          >
            <Text variant={TextVariant.Label} color={TextColor.Secondary}>
              New subset
            </Text>
            <Input
              size={Size.Sm}
              aria-label="New subset name"
              placeholder="Subset name"
              value={target?.name ?? name}
              disabled={busy || Boolean(target)}
              onChange={(event) => setName(event.target.value)}
            />
            {target && (busy || error) && (
              <Text
                variant={TextVariant.Xs}
                color={TextColor.Secondary}
                aria-live="polite"
              >
                {busy
                  ? `Saving to ${target.name}…`
                  : `${target.name} was created; retry to finish saving its members.`}
              </Text>
            )}
          </form>
        )}
        {!result && !creating && (
          <div className={styles.section}>
            <Text
              id={targetsId}
              variant={TextVariant.Label}
              color={TextColor.Secondary}
            >
              Subset
            </Text>
            <div
              role="radiogroup"
              aria-labelledby={targetsId}
              className={styles.targets}
            >
              {subsets === null ? (
                <div className={styles.centered}>
                  <Spinner size={Size.Sm} />
                  <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
                    Loading subsets
                  </Text>
                </div>
              ) : subsets.length ? (
                subsets.map((subset) => {
                  const checked = target?.id === subset.id;
                  return (
                    <button
                      key={subset.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      className={styles.target}
                      disabled={busy || !scope}
                      onClick={() => choose(subset)}
                    >
                      <BookmarkIcon
                        size={Size.Sm}
                        color={checked ? TextColor.Accent : TextColor.Secondary}
                      />
                      <span className={styles.targetText}>
                        <Text variant={TextVariant.Sm}>{subset.name}</Text>
                        <Text
                          variant={TextVariant.Xs}
                          color={TextColor.Secondary}
                        >
                          {selectionScopeLabel(subset.counts, unit)}
                          {subset.counts.unavailable
                            ? ` · ${subset.counts.unavailable} unavailable`
                            : ""}
                        </Text>
                      </span>
                      {checked && (
                        <CheckIcon size={Size.Sm} color={TextColor.Accent} />
                      )}
                    </button>
                  );
                })
              ) : (
                <div className={styles.centered}>
                  <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
                    {listError ?? "No saved subsets yet. Create one below."}
                  </Text>
                </div>
              )}
            </div>
            <form className={styles.create} onSubmit={create}>
              <Input
                size={Size.Sm}
                aria-label="New subset name"
                placeholder="New subset name"
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
              <Button
                type="submit"
                size={Size.Sm}
                variant={Variant.Secondary}
                leadingIcon={AddIcon}
                disabled={busy || !name.trim() || !scope}
              >
                Create
              </Button>
            </form>
          </div>
        )}
        {!result && !creating && target && (
          <div className={styles.section} aria-live="polite">
            <Text variant={TextVariant.Label} color={TextColor.Secondary}>
              Adding to {target.name}
            </Text>
            {busy && !preview && !error ? (
              <LoadingDots
                variant={TextVariant.Sm}
                color={TextColor.Secondary}
                text="Checking membership"
              />
            ) : preview ? (
              <>
                <div className={styles.stats}>
                  <Stat value={preview.added} label="new" />
                  <Stat
                    value={preview.duplicates}
                    label="already in subset"
                    muted
                  />
                  {preview.provenanceUpdated > 0 && (
                    <Stat
                      value={preview.provenanceUpdated}
                      label="provenance updates"
                      muted
                    />
                  )}
                </div>
                {preview.counts.unavailable > 0 && (
                  <Notice
                    tone="warning"
                    icon={WarningAmberIcon}
                    title={`${plural(preview.counts.unavailable, "unavailable member")} will be kept as saved references.`}
                  />
                )}
                <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
                  {unit.temporal
                    ? "Existing members stay. A full episode and its saved segments are kept as separate members."
                    : "Existing members stay."}
                </Text>
              </>
            ) : null}
          </div>
        )}
        {result && target && (
          <Notice
            tone="success"
            icon={CheckCircleOutlineIcon}
            role="status"
            title={
              creating
                ? `Saved ${plural(result.added, "member")} as ${target.name}.`
                : `Added ${plural(result.added, "new member")} to ${target.name}.`
            }
          >
            {[
              result.duplicates
                ? `${plural(result.duplicates, "member")} were already in the subset.`
                : null,
              result.provenanceUpdated
                ? `${plural(result.provenanceUpdated, "provenance record")} updated.`
                : null,
            ]
              .filter(Boolean)
              .join(" ") || "Selection kept."}
          </Notice>
        )}
        {error && (
          <Notice
            tone="error"
            icon={ErrorOutlineIcon}
            role="alert"
            title={error}
          >
            Your captured scope is kept for retry.
          </Notice>
        )}
      </div>
    </Modal>
  );
}

/** Common persistence action for both product shells. */
export const addToSubsetAction: GridSelectionAction = {
  id: "fiftyone:add-to-subset",
  order: 10,
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
