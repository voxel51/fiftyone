import { DeleteAnnotationCommand, getFieldSchema } from "@fiftyone/annotation";
import { useCommandBus } from "@fiftyone/command-bus";
import {
  DelegatingUndoable,
  KnownContexts,
  useCreateCommand,
} from "@fiftyone/commands";
import { useIsWorkingInitialized } from "@fiftyone/looker-3d";
import {
  isPatchesView,
  useModalSampleSchema,
  useUnboundStateRef,
} from "@fiftyone/state";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useMemo, useRef } from "react";
import { useRecoilValue } from "recoil";
import { useCurrentFields, useCurrentType, useEditingLabel } from "../redux/hooks";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import AddSchema from "./AddSchema";
import {
  current,
  currentDisabledFields,
  currentField,
  editing,
} from "./state";

const createSchema = (
  choices: string[],
  disabled: Set<string>,
  readOnly = false
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
  const fields = useCurrentFields();
  const disabled = useAtomValue(currentDisabledFields);
  const [currentFieldValue, setCurrentField] = useAtom(currentField);
  const isPatches = useRecoilValue(isPatchesView);
  const currentLabel = useEditingLabel();
  const schema = useMemo(
    () => createSchema(fields, disabled, isPatches),
    [disabled, fields, isPatches]
  );
  const type = useCurrentType();
  const state = useAtomValue(editing);
  const modalSampleSchema = useModalSampleSchema();
  const commandBus = useCommandBus();
  const nextFieldValue = useRef(currentFieldValue);
  const labelId = currentLabel?.id;
  const currentLabelRef = useUnboundStateRef(currentLabel);

  const is3DAnnotationStagingInitialized = useIsWorkingInitialized();

  const updateField = useCreateCommand(
    KnownContexts.ModalAnnotate,
    `update-${labelId}-field`,
    useCallback(() => {
      const currentField = currentFieldValue as string;
      const newField = nextFieldValue.current as string;

      return new DelegatingUndoable(
        `update-${labelId}-field-action`,
        // stage mutation on execute
        async () => {
          const currentLabel = currentLabelRef.current;
          const fieldSchema = getFieldSchema(modalSampleSchema, currentField);
          if (!currentLabel || !fieldSchema) return;
          await commandBus.execute(
            new DeleteAnnotationCommand(currentLabel, fieldSchema)
          );
          setCurrentField(newField);
        },
        // restore original value on undo
        async () => {
          const currentLabel = currentLabelRef.current;
          const fieldSchema = getFieldSchema(modalSampleSchema, newField);
          if (!currentLabel || !fieldSchema) return;
          await commandBus.execute(
            new DeleteAnnotationCommand(currentLabel, fieldSchema)
          );
          setCurrentField(currentField);
        }
      );
    }, [
      modalSampleSchema,
      currentLabelRef,
      commandBus,
      setCurrentField,
      labelId,
      currentFieldValue,
    ]),
    () => true
  );

  return (
    <>
      {/* Note: we don't allow field selection in 3D since it's handled in the "left" in-canvas sidebar */}
      {!!fields.length && !is3DAnnotationStagingInitialized && (
        <div>
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
      {typeof state === "string" && <AddSchema type={type} />}
    </>
  );
};

export default Field;
