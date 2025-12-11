import { useOperatorExecutor } from "@fiftyone/operators";
import { useNotification } from "@fiftyone/state";
import { Typography } from "@mui/material";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import { useCallback } from "react";
import { RoundButton } from "../Actions";
import { ItemLeft, ItemRight } from "../Components";
import {
  addToActiveSchemas,
  deleteSchemas,
  inactivePaths,
  schema,
} from "../state";
import { Container, MutedItem } from "./Components";
import FieldRow from "./FieldRow";
import { Header } from "./Modal";

const useActivate = () => {
  const addToActiveSchema = useSetAtom(addToActiveSchemas);
  const [selected, setSelected] = useAtom(selectedFields);
  const activateFields = useOperatorExecutor("activate_label_schemas");
  const setMessage = useNotification();

  return useCallback(() => {
    addToActiveSchema(selected);
    activateFields.execute({ fields: Array.from(selected) });
    setSelected(new Set());
    setMessage({
      msg: `${selected.size} schema${selected.size > 1 ? "s" : ""} activated`,
      variant: "success",
    });
  }, [activateFields, addToActiveSchema, selected, setSelected, setMessage]);
};

const selectedFields = atom(new Set<string>());

export const isSelected = atomFamily((path: string) =>
  atom(
    (get) => get(selectedFields).has(path),
    (get, set, toggle: boolean) => {
      const selected = new Set(get(selectedFields));
      toggle ? selected.add(path) : selected.delete(path);
      set(selectedFields, selected);
    }
  )
);

const removeSelection = atom(null, (_, set, paths: string[]) => {
  for (const path of paths) {
    set(isSelected(path), false);
  }
});

const otherFieldsWithSchema = atom((get) =>
  get(inactivePaths).filter((path) => get(schema(path))?.config)
);

const useDeleteSchema = () => {
  const deleteSchema = useOperatorExecutor("delete_label_schemas");
  const deletePaths = useSetAtom(deleteSchemas);
  const setMessage = useNotification();
  const remove = useSetAtom(removeSelection);

  return useCallback(
    (path: string) => {
      deleteSchema.execute({ fields: [path] });
      deletePaths([path]);

      setMessage({ msg: `${path} schema deleted`, variant: "success" });
      remove([path]);
    },
    [deleteSchema.execute, deletePaths, remove, setMessage]
  );
};

const OtherFieldsWithSchema = () => {
  const activate = useActivate();
  const fields = useAtomValue(otherFieldsWithSchema);
  const [selected, setSelected] = useAtom(selectedFields);

  const deleteSchema = useDeleteSchema();
  if (!fields.length) {
    return null;
  }

  return (
    <>
      <Header>
        <ItemLeft>
          <Typography color="secondary" padding="1rem 0">
            {selected.size} selected
          </Typography>
        </ItemLeft>

        <ItemRight>
          {selected.size === fields.length ? (
            <RoundButton onClick={() => setSelected(new Set())}>
              Deselect all
            </RoundButton>
          ) : (
            <RoundButton onClick={() => setSelected(new Set(fields))}>
              Select all
            </RoundButton>
          )}
          {!!selected.size && (
            <RoundButton onClick={activate}>Add to active fields</RoundButton>
          )}
        </ItemRight>
      </Header>

      {fields.map((path) => (
        <FieldRow
          key={path}
          path={path}
          isSelected={isSelected(path)}
          onDelete={{
            callback: () => deleteSchema(path),
            tooltip: "Delete annotation schema",
          }}
        />
      ))}
    </>
  );
};

const otherFieldsWithoutSchema = atom((get) =>
  get(inactivePaths).filter((path) => !get(schema(path))?.config)
);

const OtherFieldsWithoutSchema = () => {
  const fields = useAtomValue(otherFieldsWithoutSchema);

  if (!fields.length) {
    return null;
  }

  return (
    <>
      <Header>
        <Typography color="secondary" padding="1rem 0">
          {fields.length} field{fields.length === 1 ? "" : "s"} without a
          configured schema
        </Typography>
      </Header>

      {fields.map((path) => (
        <FieldRow key={path} path={path} />
      ))}
    </>
  );
};

const FallbackItem = () => {
  const withSchema = useAtomValue(otherFieldsWithSchema);
  const withoutSchema = useAtomValue(otherFieldsWithoutSchema);

  if (withSchema.length || withoutSchema.length) {
    return null;
  }

  return (
    <MutedItem style={{ padding: "1rem", height: "auto" }}>
      You're viewing schema fields that are not in your active schema. Adding a
      field from this list will append it to your schema — it won’t replace or
      modify existing active fields.
    </MutedItem>
  );
};

const OtherFields = () => {
  return (
    <>
      <Container>
        <OtherFieldsWithSchema />
        <OtherFieldsWithoutSchema />
        <FallbackItem />
      </Container>
    </>
  );
};

export default OtherFields;
