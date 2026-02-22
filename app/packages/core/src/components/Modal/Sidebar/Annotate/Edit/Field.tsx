import { useIsWorkingInitialized } from "@fiftyone/looker-3d";
import { useAtom, useAtomValue } from "jotai";
import { useMemo } from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import AddSchema from "./AddSchema";
import {
  currentDisabledFields,
  currentField,
  currentFields,
  currentType,
  editing,
} from "./state";

const createSchema = (choices: string[], disabled: Set<string>) => ({
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
  const fields = useAtomValue(currentFields);
  const disabled = useAtomValue(currentDisabledFields);
  const [currentFieldValue, setCurrentField] = useAtom(currentField);
  const schema = useMemo(() => createSchema(fields, disabled), [
    disabled,
    fields,
  ]);
  const type = useAtomValue(currentType);
  const state = useAtomValue(editing);

  const is3DAnnotationStagingInitialized = useIsWorkingInitialized();

  return (
    <>
      {/* Note: we don't allow field selection in 3D since it's handled in the "left" in-canvas sidebar */}
      {!!fields.length && !is3DAnnotationStagingInitialized && (
        <div>
          <SchemaIOComponent
            schema={schema}
            data={{ field: currentFieldValue }}
            onChange={({ field }) => {
              setCurrentField(field);
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
