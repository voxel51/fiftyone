import { useIsWorkingInitialized } from "@fiftyone/looker-3d";
import { isPatchesView } from "@fiftyone/state";
import { useAtom, useAtomValue } from "jotai";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import AddSchema from "./AddSchema";
import {
  current,
  currentDisabledFields,
  currentField,
  currentFields,
  currentType,
  editing,
} from "./state";
import { useQuickDraw } from "./useQuickDraw";

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
  const fields = useAtomValue(currentFields);
  const disabled = useAtomValue(currentDisabledFields);
  const [currentFieldValue, setCurrentField] = useAtom(currentField);
  const [currentLabel, setCurrent] = useAtom(current);
  const { quickDrawActive, handleQuickDrawFieldChange } = useQuickDraw();
  const isPatches = useRecoilValue(isPatchesView);
  const schema = useMemo(
    () => createSchema(fields, disabled, isPatches),
    [disabled, fields, isPatches]
  );
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
              if (quickDrawActive) {
                handleQuickDrawFieldChange(field, currentLabel, setCurrent);
              } else {
                setCurrentField(field);
              }
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
