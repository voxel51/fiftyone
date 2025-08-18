import { useTheme } from "@fiftyone/components";
import { Typography } from "@mui/material";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import React from "react";
import { RoundButtonWhite } from "../Actions";
import { activePaths, removeFromActiveSchemas, schema } from "../state";
import { Container, ItemLeft, ItemRight } from "./Components";
import FieldRow from "./FieldRow";
import Footer from "./Footer";
import { Header } from "./Modal";
import NoActiveSchema from "./NoActiveSchema";

const deselectedFields = atom(new Set<string>());

export const isSelected = atomFamily((path: string) =>
  atom(
    (get) => !get(deselectedFields).has(path),
    (get, set, toggle: boolean) => {
      const selected = new Set(get(deselectedFields));
      toggle ? selected.delete(path) : selected.add(path);
      set(deselectedFields, selected);
    }
  )
);

const disableSchema = atom(null, (get, set, path: string) =>
  set(schema(path), { ...get(schema(path)), active: false })
);

const Rows = () => {
  const fields = useAtomValue(activePaths);
  const deselected = useAtomValue(deselectedFields);
  const disable = useSetAtom(disableSchema);
  const theme = useTheme();
  const removeFromActiveSchema = useSetAtom(removeFromActiveSchemas);

  if (!fields.length) {
    return null;
  }

  return (
    <>
      <Container>
        <Header>
          <ItemLeft>
            <Typography color="secondary" padding="1rem 0">
              {fields.length} active schema{fields.length === 1 ? "" : "s"}
            </Typography>
            {!!deselected.size && (
              <>
                <span style={{ color: theme.background.level1 }}>&bull;</span>
                <Typography color="secondary" padding="1rem 0">
                  {deselected.size} deselected
                </Typography>
              </>
            )}
          </ItemLeft>
          <ItemRight>
            {!!deselected.size && (
              <RoundButtonWhite
                onClick={() => removeFromActiveSchema(deselected)}
              >
                Remove from active schema
              </RoundButtonWhite>
            )}
          </ItemRight>
        </Header>
        {fields.map((path) => (
          <FieldRow
            key={path}
            path={path}
            isSelected={isSelected(path)}
            onDelete={() => disable(path)}
          />
        ))}
      </Container>
      <Footer />
    </>
  );
};

const FallbackItem = () => {
  const fields = useAtomValue(activePaths);
  if (fields.length) {
    return null;
  }

  return <NoActiveSchema />;
};

const ActiveSchema = () => {
  return (
    <>
      <Rows />

      <FallbackItem />
    </>
  );
};

export default ActiveSchema;
