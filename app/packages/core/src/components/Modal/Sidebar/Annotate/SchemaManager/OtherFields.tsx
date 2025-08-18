import { Typography } from "@mui/material";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import React from "react";
import { RoundButton } from "../Actions";
import { addToActiveSchemas, inactivePaths, schema } from "../state";
import { Container, ItemLeft, ItemRight, MutedItem } from "./Components";
import FieldRow from "./FieldRow";
import Footer from "./Footer";
import { Header } from "./Modal";

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

const otherFieldsWithSchema = atom((get) =>
  get(inactivePaths).filter((path) => get(schema(path))?.config)
);

const OtherFieldsWithSchema = () => {
  const fields = useAtomValue(otherFieldsWithSchema);
  const [selected, setSelected] = useAtom(selectedFields);
  const addToActiveSchema = useSetAtom(addToActiveSchemas);

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
            <RoundButton onClick={() => addToActiveSchema(selected)}>
              Add to active schema
            </RoundButton>
          )}
        </ItemRight>
      </Header>

      {fields.map((path) => (
        <FieldRow key={path} path={path} isSelected={isSelected(path)} />
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
  return (
    <>
      <Container>
        <OtherFieldsWithSchema />
        <OtherFieldsWithoutSchema />
        <FallbackItem />
      </Container>
      <Footer />
    </>
  );
};

export default OtherFields;
