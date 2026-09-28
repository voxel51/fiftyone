import { useAnnotationEngine } from "@fiftyone/annotation";
import {
  DelegatingUndoable,
  KnownContexts,
  useCreateCommand,
} from "@fiftyone/commands";
import { useIsWorkingInitialized } from "@fiftyone/looker-3d";
import { isPatchesView, useUnboundStateRef } from "@fiftyone/state";
import { useCallback, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import AddSchema from "./AddSchema";
import {
  useAnnotationContext,
  useAnnotationFields,
} from "./useAnnotationContext";
import { moveLabelToField } from "./moveLabelToField";

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
  const nextFieldValue = useRef(currentFieldValue);
  const labelId = currentLabel?.overlay?.id;
  const currentLabelRef = useUnboundStateRef(currentLabel);
  const currentTypeRef = useUnboundStateRef(selected?.type ?? null);

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
      const data = currentLabelRef.current?.data;
      const type = currentTypeRef.current;

      const move = (from: string, to: string) => {
        if (!data || !type) return;
        if (!moveLabelToField(engine, { data, type }, from, to)) return;

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
      currentTypeRef,
      engine,
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
