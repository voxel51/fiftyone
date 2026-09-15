import {
  registerGridSelectionAction,
  type GridSelectionActionContext,
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
  Button,
  FormField,
  Input,
  Size,
  Text,
  TextVariant,
  Variant,
  cssVar,
} from "@voxel51/voodo";
import { useEffect, useRef, useState } from "react";
import styles from "./SelectionTray.module.css";

interface Capture {
  datasetId: string;
  source: GridSelectionActionContext["source"];
  members: readonly SelectionMember[];
}

function AddToSubset({
  context,
  disabledReason,
}: {
  context: GridSelectionActionContext;
  disabledReason: string | null;
}) {
  const [capture, setCapture] = useState<Capture | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        size={Size.Sm}
        disabled={Boolean(disabledReason) || busy}
        title={disabledReason ?? undefined}
        onClick={async () => {
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
        }}
      >
        {busy ? "Capturing…" : "Add to subset"}
      </Button>
      {error && (
        <Text role="alert" variant={TextVariant.Sm}>
          {error}
        </Text>
      )}
      {capture && (
        <SubsetDialog capture={capture} close={() => setCapture(null)} />
      )}
    </>
  );
}

function SubsetDialog({
  capture,
  close,
}: {
  capture: Capture;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const invalidate = useInvalidateSelectionScope(capture.datasetId);
  const [subsets, setSubsets] = useState<readonly SavedSubset[]>([]);
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

  // This effect owns the native dialog's focus trap and loads dataset-local targets.
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    let active = true;
    subsetRequest<{ subsets: SavedSubset[] }>(capture.datasetId, "")
      .then((value) => {
        if (active) setSubsets(value.subsets);
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      });
    return () => {
      active = false;
      element?.close();
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
  const full = capture.members.filter((m) => m.kind === "episode").length;
  const segments = capture.members.length - full;

  return (
    <dialog
      ref={dialog}
      aria-label="Add to saved subset"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else close();
      }}
      className={styles.subsetDialog}
      style={{
        background: cssVar.color.bg.card[1],
        color: cssVar.color.text.fg,
        border: `1px solid ${cssVar.color.border.default}`,
        padding: cssVar.spacing.lg,
      }}
    >
      <Text variant={TextVariant.Lg}>Add to subset</Text>
      <p>
        {capture.source === "explicit"
          ? "Captured selection"
          : "Captured all current results"}
        : {full} full episode{full === 1 ? "" : "s"} · {segments} segment
        {segments === 1 ? "" : "s"}
      </p>
      <p>Membership stays fixed. Media and annotations remain live.</p>
      {!result && (
        <>
          <fieldset className={styles.subsetTargets} disabled={busy}>
            <legend>Choose a subset</legend>
            {subsets.length ? (
              subsets.map((subset) => (
                <Button
                  key={subset.id}
                  size={Size.Sm}
                  variant={Variant.Borderless}
                  aria-pressed={target?.id === subset.id}
                  onClick={() => choose(subset)}
                >
                  {subset.name} · {selectionScopeLabel(subset.counts)}
                </Button>
              ))
            ) : (
              <Text variant={TextVariant.Sm}>No saved subsets yet</Text>
            )}
          </fieldset>
          <form
            className={styles.subsetCreate}
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              try {
                const subset = await subsetRequest<SavedSubset>(
                  capture.datasetId,
                  "",
                  { name },
                );
                setSubsets((current) => [...current, subset]);
                setName("");
                choose(subset);
                invalidate();
              } catch (cause) {
                setError(String(cause));
                setBusy(false);
              }
            }}
          >
            <FormField
              label="New subset name"
              control={
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={busy}
                />
              }
            />
            <Button
              type="submit"
              size={Size.Sm}
              disabled={busy || !name.trim()}
            >
              Create subset
            </Button>
          </form>
          {preview && (
            <div role="status">
              {preview.counts.unavailable > 0 && (
                <p>
                  {preview.counts.unavailable} unavailable members are included
                  as saved references.
                </p>
              )}
              <p>
                Will add {preview.added} new members · {preview.duplicates}{" "}
                already present · {preview.provenanceUpdated} provenance updates
              </p>
              <p>
                Full episodes and saved segments are retained separately.
                Existing members stay in the subset.
              </p>
            </div>
          )}
        </>
      )}
      {result && (
        <p role="status">
          Added {result.added} new members · {result.duplicates} already present
          · {result.provenanceUpdated} provenance updates to {target?.name}.
        </p>
      )}
      {error && (
        <p role="alert">{error} Your captured scope is retained for retry.</p>
      )}
      <div className={styles.dialogActions}>
        <Button variant={Variant.Borderless} onClick={close} disabled={busy}>
          {result ? "Done" : "Cancel"}
        </Button>
        {!preview && operation && error && (
          <Button disabled={busy} onClick={() => prepare(operation)}>
            Retry preview
          </Button>
        )}
        {preview && !result && operation && (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                setResult(
                  await subsetRequest<SubsetAddResult>(
                    capture.datasetId,
                    "/add",
                    { phase: "apply", operationId: operation.operationId },
                  ),
                );
                invalidate();
              } catch (cause) {
                setError(String(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy
              ? "Adding…"
              : error
                ? "Retry captured add"
                : "Add captured members"}
          </Button>
        )}
      </div>
    </dialog>
  );
}

/** Mount once at the OSS dataset page to contribute its persistence action. */
export function SubsetActionRegistration() {
  // This effect owns registration, including disposal on unmount and hot reload.
  useEffect(
    () =>
      registerGridSelectionAction({
        id: "fiftyone:add-to-subset",
        order: 10,
        label: "Add to subset",
        placement: "primary",
        supports: (mediaType) => ["video", "multimodal"].includes(mediaType),
        scope: "explicit-or-results",
        memberKinds: ["episode", "segment"],
        Component: AddToSubset,
      }),
    [],
  );
  return null;
}
