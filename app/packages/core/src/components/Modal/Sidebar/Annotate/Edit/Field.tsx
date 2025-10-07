import { useAtom, useAtomValue } from "jotai";
import React, { useMemo } from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import AddSchema from "./AddSchema";
import {
  current,
  currentDisabledFields,
  currentField,
  currentFields,
  currentType,
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
  const schema = useMemo(
    () => createSchema(fields, disabled),
    [disabled, fields]
  );
  const type = useAtomValue(currentType);
  const label = useAtomValue(current);

  if (label?.path) {
    return null;
  }

  return (
    <>
      {!!fields.length && (
        <div>
          <SchemaIOComponent
            schema={schema}
            data={{ field: currentFieldValue }}
            onChange={(...a) => {
              console.log(a);
            }}
          />
        </div>
      )}
      {!label?.path && fields.length === disabled.size && (
        <AddSchema type={type} />
      )}
    </>
  );
};

export default Field;
