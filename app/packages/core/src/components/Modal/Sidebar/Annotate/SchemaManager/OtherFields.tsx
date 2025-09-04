import { useOperatorExecutor } from "@fiftyone/operators";
import { snackbarMessage } from "@fiftyone/state";
import { Typography } from "@mui/material";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import React, { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { RoundButton } from "../Actions";
import {
  addToActiveSchemas,
  deleteSchemas,
  inactivePaths,
  schema,
} from "../state";
import { Container, ItemLeft, ItemRight, MutedItem } from "./Components";
import FieldRow from "./FieldRow";
import Footer from "./Footer";
import { Header } from "./Modal";

const useActivate = () => {
  const addToActiveSchema = useSetAtom(addToActiveSchemas);
  const [selected, setSelected] = useAtom(selectedFields);
  const activateFields = useOperatorExecutor("activate_annotation_schemas");
  const setMessage = useSetRecoilState(snackbarMessage);

  return useCallback(() => {
    addToActiveSchema(selected);
    activateFields.execute({ paths: Array.from(selected) });
    setSelected(new Set());
    setMessage(
      `${selected.size} schema${selected.size > 1 ? "s" : ""} activated`
    );
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
  const deleteSchema = useOperatorExecutor("delete_annotation_schema");
  const deletePaths = useSetAtom(deleteSchemas);
  const setMessage = useSetRecoilState(snackbarMessage);
  const remove = useSetAtom(removeSelection);

  return useCallback(
    (path: string) => {
      deleteSchema.execute({ path });
      deletePaths([path]);

      setMessage(`${path} schema deleted`);
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
          onDelete={() => deleteSchema(path)}
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

  return <MutedItem>No fields are available for annotation</MutedItem>;
};

const OtherFields = () => {
  const activate = useActivate();
  const [selected, setSelected] = useAtom(selectedFields);
  const addToActiveSchema = useSetAtom(addToActiveSchemas);

  return (
    <>
      <Container>
        <OtherFieldsWithSchema />
        <OtherFieldsWithoutSchema />
        <FallbackItem />
      </Container>
      {!!selected.size && (
        <Footer
          primaryButton={{
            onClick: activate,
            text: "Activate fields",
          }}
          secondaryButton={{
            onClick: () => setSelected(new Set()),
            text: "Cancel",
          }}
        />
      )}
    </>
  );
};

export default OtherFields;
