import { useRefresh, useSelectionSubsetDisabledReason } from "@fiftyone/state";
import type {
  GridSelectionAction,
  GridSelectionActionProps,
} from "@fiftyone/multimodal/extensions/grid-selection";
import {
  capturedScopeSources,
  memberCounts,
  normalizeSelectionMembers,
  removeSubsetMembers,
  selectionScopeLabel,
  useSelectionBucketCommands,
  useGridSelectionDataset,
  useInvalidateSelectionScope,
  type SelectionScope,
  type SelectionMember,
} from "@fiftyone/state/src/selection";
import {
  RemoveCircleOutlineIcon,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import { useState } from "react";
import ActionEntry from "./ActionEntry";
import SubsetConfirmationDialog from "./SubsetConfirmationDialog";
import {
  rememberSubsetConfirmation,
  skipSubsetConfirmation,
} from "./subsetConfirmationPreference";
import { useSavedSubset } from "./useSubsetScope";

interface RemovalCapture {
  subsetId: string;
  subsetName: string;
  scope: SelectionScope;
  members: readonly SelectionMember[];
  snapshotIds: readonly string[];
}

function RemoveFromSubset({
  context,
  disabledReason,
  surface = "toolbar",
}: GridSelectionActionProps) {
  const permission = useSelectionSubsetDisabledReason();
  const invalidate = useInvalidateSelectionScope(context.datasetId);
  const refresh = useRefresh();
  const { domainId } = useGridSelectionDataset();
  const { removeMembersEverywhere, removeSnapshotsEverywhere } =
    useSelectionBucketCommands(domainId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<RemovalCapture | null>(null);
  const subsetId = context.boundary.subsetId;
  const {
    subset,
    loading,
    error: subsetError,
  } = useSavedSubset(context.datasetId, subsetId);
  const blocked =
    permission ||
    disabledReason ||
    (loading ? "Loading subset" : subsetError) ||
    (!subset ? "This subset is unavailable" : null);

  const remove = async (capture: RemovalCapture, remember: boolean) => {
    if (permission) return;
    setError(null);
    try {
      await removeSubsetMembers(
        context.datasetId,
        capture.subsetId,
        capture.scope,
      );
      removeMembersEverywhere(capture.members);
      if (capture.snapshotIds.length)
        removeSnapshotsEverywhere(capture.snapshotIds);
      if (remember) rememberSubsetConfirmation("remove");
      setConfirming(false);
      setPending(null);
      invalidate();
      refresh();
    } catch (cause) {
      setError(String(cause));
      setConfirming(true);
    }
  };

  const begin = async () => {
    if (!subset || busy || blocked) return;
    setBusy(true);
    setError(null);
    try {
      const scope = await context.resolve();
      const capture: RemovalCapture = {
        subsetId: subset.id,
        subsetName: subset.name,
        scope:
          scope.kind === "members"
            ? { ...scope, members: normalizeSelectionMembers(scope.members) }
            : scope,
        members:
          scope.kind === "members"
            ? normalizeSelectionMembers(scope.members)
            : capturedScopeSources(context.groups).members,
        snapshotIds: capturedScopeSources(context.groups).snapshotIds,
      };
      setPending(capture);
      if (skipSubsetConfirmation("remove")) await remove(capture, false);
      else setConfirming(true);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (remember: boolean) => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      // The modal and every retry use the capture the user was shown.
      await remove(pending, remember);
    } finally {
      setBusy(false);
    }
  };

  // Removal only means something for captured members, so the entry stays
  // out of the bar until a bucket holds some. An open confirmation keeps its
  // capture for retry whatever the selection does meanwhile.
  const offered = context.source === "explicit";

  return (
    <>
      {offered && (
        <>
          <ActionEntry
            label="Remove from subset"
            icon={RemoveCircleOutlineIcon}
            surface={surface}
            disabledReason={blocked}
            busy={busy}
            busyLabel={pending ? "Removing…" : "Preparing…"}
            onClick={() => void begin()}
            aria-haspopup="dialog"
            aria-expanded={confirming}
          />
          {error && !confirming && (
            <Text
              role="alert"
              variant={TextVariant.Xs}
              color={TextColor.Destructive}
            >
              {error}
            </Text>
          )}
        </>
      )}
      {confirming && pending && (
        <SubsetConfirmationDialog
          action="remove"
          subsetName={pending.subsetName}
          scopeLabel={selectionScopeLabel(
            pending.scope.kind === "members"
              ? memberCounts(pending.scope.members)
              : pending.scope.counts,
            context.unit,
          )}
          close={() => {
            if (busy) return;
            setConfirming(false);
            setPending(null);
            setError(null);
          }}
          confirm={(remember) => void confirm(remember)}
          busy={busy}
          error={error}
        />
      )}
    </>
  );
}

/** Subset membership changes share the same action in both product shells. */
export const removeFromSubsetAction: GridSelectionAction = {
  id: "fiftyone:remove-from-subset",
  order: 21,
  label: "Remove from subset",
  placement: "primary",
  supports: () => true,
  scope: "explicit",
  memberKinds: ["episode", "segment"],
  unavailable: () => null,
  Component: (props) =>
    props.context.boundary.subsetId ? (
      <RemoveFromSubset
        key={`${props.context.datasetId}:${props.context.boundary.subsetId}`}
        {...props}
      />
    ) : null,
};
