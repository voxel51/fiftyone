import { useAtom, useAtomValue } from "jotai";
import React, { useMemo } from "react";
import { SchemaIOComponent } from "../../../../../plugins/SchemaIO";
import AddSchema from "./AddSchema";
import {
  current,
  currentField,
  currentFields,
  currentType,
  disabledFields,
} from "./state";

const createSchema = (choices: string[], disabled: Set<string>) => ({
  type: "object",
  view: {
    component: "ObjectView",
  },
  properties: {
    Field: {
      type: "string",
      view: {
        name: "DropdownView",
        label: "Label field",
        placeholder: "Select a label field",
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
  const disabled = useAtomValue(disabledFields);
  const [currentFieldValue, setCurrentField] = useAtom(currentField);
  const schema = useMemo(
    () => createSchema(fields, disabled),
    [disabled, fields]
  );
  const type = useAtomValue(currentType);
  const label = useAtomValue(current);

  return (
    <>
      {!!fields.length && (
        <div>
          <SchemaIOComponent
            schema={schema}
            data={{ Field: currentFieldValue }}
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
