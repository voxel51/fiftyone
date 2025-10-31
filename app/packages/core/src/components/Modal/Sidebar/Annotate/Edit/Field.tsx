import { useAtom, useAtomValue } from "jotai";
import React, { useMemo } from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import AddSchema from "./AddSchema";
import {
  currentDisabledFields,
  currentField,
  currentFields,
  currentType,
  editing,
  isNew,
} from "./state";
import { useRecoilValue } from "recoil";
import { polylinePointTransformsAtom } from "@fiftyone/looker-3d/src/state";

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
  const schema = useMemo(
    () => createSchema(fields, disabled),
    [disabled, fields]
  );
  const type = useAtomValue(currentType);
  const state = useAtomValue(editing);
  const isCreating = useAtomValue(isNew);

  const polylinePointTransforms =
    useRecoilValue(polylinePointTransformsAtom) ?? {};

  if (!isCreating) {
    return null;
  }

  // todo: temp: skip for 3d
  if (Object.keys(polylinePointTransforms).length > 0) {
    return null;
  }

  return (
    <>
      {!!fields.length && (
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
      {typeof state === "string" && <AddSchema type={type} />}
    </>
  );
};

export default Field;
