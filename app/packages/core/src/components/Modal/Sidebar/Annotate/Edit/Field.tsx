import { useAnnotationEngine, type LabelRef } from "@fiftyone/annotation";
import {
  DelegatingUndoable,
  KnownContexts,
  useCreateCommand,
} from "@fiftyone/commands";
import { useIsWorkingInitialized } from "@fiftyone/looker-3d";
import {
  isPatchesView,
  useGetKeypointSkeleton,
  useUnboundStateRef,
} from "@fiftyone/state";
import type { LabelData } from "@fiftyone/utilities";
import { useCallback, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import AddSchema from "./AddSchema";
import {
  type LabelType,
  useAnnotationContext,
  useAnnotationFields,
} from "./useAnnotationContext";
import {
  buildNewLabelData,
  skeletonNodeCount,
} from "./useAnnotationContext/createNew";

const createSchema = (
  choices: string[],
  disabled: Set<string>,
  readOnly = false,
) => ({
  type: "object",
  view: {
    component: "ObjectView",
  },
  properties: {
    field: {
      type: "string",
      view: {
        name: "DropdownView",
        label: "field",
        placeholder: "Select a field",
        component: "DropdownView",
        readOnly,
        choices: choices.map((choice) => ({
          name: "Choice",
          label: choice,
          value: choice,
          readOnly: disabled.has(choice),
        })),
      },
    },
  },
});

const Field = () => {
  const { fields, disabledFields: disabled } = useAnnotationFields();
  const { selected, setField, pendingNewType } = useAnnotationContext();
  const currentFieldValue = selected?.field ?? null;
  const setCurrentField = setField;
  const isPatches = useRecoilValue(isPatchesView);
  const currentLabel = selected?.label ?? null;
  const schema = useMemo(
    () => createSchema(fields, disabled, isPatches),
    [disabled, fields, isPatches],
  );
  const engine = useAnnotationEngine();
  const getSkeleton = useGetKeypointSkeleton();
  const nextFieldValue = useRef(currentFieldValue);
  const labelId = currentLabel?.overlay?.id;
  const currentLabelRef = useUnboundStateRef(currentLabel);

  const is3DAnnotationStagingInitialized = useIsWorkingInitialized();

  const updateField = useCreateCommand(
    KnownContexts.ModalAnnotate,
    `update-${labelId}-field`,
    useCallback(() => {
      const oldField = currentFieldValue as string;
      const newField = nextFieldValue.current as string;

      // Capture the moved label up front so execute/undo don't depend on the
      // live selection — the label may be deselected before an undo, which
      // would otherwise leave `current` null and skip the re-add.
      const movedLabel = currentLabelRef.current;
      const source = movedLabel?.data;
      // Track identity is `instance._id` (shared across a video track's
      // frames); an image / sample-level label falls back to its doc `_id`.
      // The store addresses occurrences by this id, so a per-frame doc `_id`
      // (which differs frame to frame) would match nothing.
      const instanceId =
        (source as { instance?: { _id?: string } } | undefined)?.instance
          ?._id ?? source?._id;

      // A keypoint's field swap ERASES its geometry: a node's index is bound
      // to its skeleton's semantics (node 3 of a face is not node 3 of a
      // body), so carrying placements across topologies would be silent
      // corruption. The erase rides the move's own undo unit — the original
      // per-occurrence data is captured on the forward move (keyed by
      // sample + frame; the path changes across the move) and the reverse
      // move restores it verbatim.
      const isKeypoint =
        (source as { _cls?: string } | undefined)?._cls === "Keypoint";
      const captured = new Map<string, LabelData>();
      const occurrenceKey = (ref: LabelRef) =>
        `${ref.sample}:${ref.frame ?? ""}`;

      // Atomic move between fields, ALL through the engine: drop EVERY
      // occurrence of the track from the source field and re-home it (with its
      // per-frame geometry) at the destination, in a single transaction (one
      // coalesced change → one autosave patch, one undo unit). A video track
      // spans many frames — moving only the current frame would leave the rest
      // behind and never clear the source — so the move fans across all frames
      // the instance occupies. Identity is the store's, so the track keeps its
      // `instance._id` across the move. The Lighter bridge's read-half re-homes
      // the overlay off the engine change — the sidebar never touches Lighter.
      const move = (from: string, to: string) => {
        if (!instanceId || !source) return;

        const type = engine.getLabelType(from);

        // Snapshot each occurrence BEFORE the transaction (the deletes mutate
        // the store). For an image / sample-level label this is one frame-less
        // entry; for a video track it is one entry per frame. Match by track
        // identity + field; each occurrence carries its own full ref (sample +
        // frame) so writes land in the right store and frame.
        const occurrences = engine
          .enumerateLabels([type])
          .filter((ref) => ref.path === from && ref.instanceId === instanceId)
          .map((ref) => ({ ref, data: engine.getLabel(ref) }))
          .filter((o): o is { ref: LabelRef; data: LabelData } => !!o.data);

        // Zero occurrences is legal: an atomic keypoint creation draft has no
        // engine rows until it finalizes, so there is nothing to move — but
        // the sidebar swap below must still happen (the keypoint mode reseeds
        // the draft for the new field's skeleton off it).
        if (occurrences.length > 0) {
          const cls = (source as { _cls: LabelType })._cls;

          engine.transaction(() => {
            for (const { ref } of occurrences) {
              engine.deleteLabel(ref);
            }

            for (const { ref, data } of occurrences) {
              let payload: Partial<LabelData> = data;
              if (isKeypoint && to === newField) {
                // Forward move: capture, then write the destination
                // skeleton's holes (free-form: no points) and drop the
                // per-point parallel lists the erased geometry anchored
                captured.set(occurrenceKey(ref), data);
                const nodeCount = skeletonNodeCount(getSkeleton(to) ?? null);
                const {
                  confidence: _confidence,
                  visible: _visible,
                  ...rest
                } = data as Record<string, unknown>;
                payload = {
                  ...rest,
                  points: Array.from({ length: nodeCount }, () => [NaN, NaN]),
                } as Partial<LabelData>;
              } else if (isKeypoint) {
                // Reverse move (undo): restore the captured original
                payload = captured.get(occurrenceKey(ref)) ?? data;
              }

              engine.updateLabel(
                { sample: ref.sample, path: to, instanceId, frame: ref.frame },
                {
                  ...buildNewLabelData(to, cls, { id: instanceId }),
                  ...payload,
                } as Partial<LabelData>,
              );
            }
          });
        }

        // Best-effort sidebar sync; no-ops when the label isn't selected.
        setCurrentField(to);
      };

      return new DelegatingUndoable(
        `update-${labelId}-field-action`,
        () => move(oldField, newField),
        () => move(newField, oldField),
      );
    }, [
      currentLabelRef,
      engine,
      getSkeleton,
      setCurrentField,
      labelId,
      currentFieldValue,
    ]),
    () => true,
  );

  return (
    <>
      {/* Note: we don't allow field selection in 3D since it's handled in the "left" in-canvas sidebar */}
      {!!fields.length && !is3DAnnotationStagingInitialized && (
        <div data-cy="annotate-field-select">
          <SchemaIOComponent
            schema={schema}
            smartForm={true}
            data={{ field: currentFieldValue }}
            onChange={({ field }) => {
              nextFieldValue.current = field;
              updateField.callback();
            }}
          />
        </div>
      )}
      {/* Means the user wants to create a label but no schema fields exist for that type.
      Show AddSchema to let them create the required field. */}
      {pendingNewType !== null && <AddSchema type={pendingNewType} />}
    </>
  );
};

export default Field;
