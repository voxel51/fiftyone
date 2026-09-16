import {
  type GridSelectionAction,
  type GridSelectionActionContext,
  type GridSelectionActionProps,
} from "@fiftyone/multimodal/extensions/grid-selection";
import {
  normalizeSelectionMembers,
  selectionScopeLabel,
  subsetRequest,
  useInvalidateSelectionScope,
  type SavedSubset,
  type SelectionMember,
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
import { useEffect, useId, useState, type FormEvent } from "react";
import ActionEntry, { ActionMenuSlot } from "./ActionEntry";
import { plural } from "./format";
import { Notice, ScopePill } from "./Notice";
import styles from "./SelectionTray.module.css";
import { trayTheme } from "./theme";
import { useOpenSubset } from "./useSubsetScope";

interface Capture {
  datasetId: string;
  source: GridSelectionActionContext["source"];
  members: readonly SelectionMember[];
}

function AddToSubset({
  context,
  disabledReason,
  surface = "toolbar",
  menuHost,
}: GridSelectionActionProps) {
  const [capture, setCapture] = useState<Capture | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const members = normalizeSelectionMembers(await context.resolve());
      setCapture({
        datasetId: context.datasetId,
        source: context.source,
        members,
      });
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  const entry = (
    <ActionEntry
      label="Add to subset"
      icon={LibraryAddIcon}
      emphasis="primary"
      surface={surface}
      onClick={() => void begin()}
      disabledReason={disabledReason}
      busy={busy}
      busyLabel="Capturing scope…"
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
      {surface === "menu" ? (
        <ActionMenuSlot host={menuHost}>
          {entry}
          {alert}
        </ActionMenuSlot>
      ) : (
        <>
          {entry}
          {alert}
        </>
      )}
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

function SubsetDialog({
  capture,
  close,
}: {
  capture: Capture;
  close: () => void;
}) {
  const invalidate = useInvalidateSelectionScope(capture.datasetId);
  const openSubset = useOpenSubset(capture.datasetId);
  const targetsId = useId();
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
    setBusy(true);
    setError(null);
    setPreview(null);
    setOperation(pending);
    try {
      setPreview(
        await subsetRequest<SubsetAddResult>(capture.datasetId, "/add", {
          phase: "prepare",
          ...pending,
          members: capture.members,
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

  const full = capture.members.filter((m) => m.kind === "episode").length;
  const segments = capture.members.length - full;
  const scopeText =
    [
      full && plural(full, "full episode"),
      segments && plural(segments, "segment"),
    ]
      .filter(Boolean)
      .join(" · ") || "0 members";
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
            openSubset(target.id, segments && !full ? "segments" : "episodes");
            close();
          }}
        >
          Open subset
        </Button>
      )}
      {!result && !preview && operation && error && (
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
      {!result && preview && operation && (
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
      title="Add to subset"
      size={ModalSize.Md}
      footer={footer}
    >
      <div className={styles.dialogBody} style={trayTheme}>
        <div className={styles.scopeCard}>
          <ScopePill source={capture.source} />
          <Text variant={TextVariant.Md}>{scopeText}</Text>
          <Text
            variant={TextVariant.Xs}
            color={TextColor.Secondary}
            style={{ flexBasis: "100%" }}
          >
            Captured when this dialog opened; browsing changes will not affect
            it. Media and annotations stay live.
          </Text>
        </div>
        {!result && (
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
                      disabled={busy}
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
                          {selectionScopeLabel(subset.counts)}
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
                disabled={busy || !name.trim()}
              >
                Create
              </Button>
            </form>
          </div>
        )}
        {!result && target && (
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
                  Existing members stay. A full episode and its saved segments
                  are kept as separate members.
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
            title={`Added ${plural(result.added, "new member")} to ${target.name}.`}
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
  supports: (mediaType) => ["video", "multimodal"].includes(mediaType),
  scope: "explicit-or-results",
  memberKinds: ["episode", "segment"],
  Component: AddToSubset,
};
