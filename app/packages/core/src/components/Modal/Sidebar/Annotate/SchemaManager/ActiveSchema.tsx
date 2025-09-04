import { useTheme } from "@fiftyone/components";
import { useOperatorExecutor } from "@fiftyone/operators";
import { snackbarMessage } from "@fiftyone/state";
import { Typography } from "@mui/material";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import React, { useCallback } from "react";
import { useSetRecoilState } from "recoil";
import { RoundButtonWhite } from "../Actions";
import { activePaths, removeFromActiveSchemas } from "../state";
import { Container, ItemLeft, ItemRight } from "./Components";
import FieldRow from "./FieldRow";
import Footer from "./Footer";
import { Header } from "./Modal";
import NoActiveSchema from "./NoActiveSchema";

const useDeactivate = () => {
  const removeFromActiveSchema = useSetAtom(removeFromActiveSchemas);
  const [selected, setSelected] = useAtom(selectedFields);
  const activateFields = useOperatorExecutor("deactivate_annotation_schemas");
  const setMessage = useSetRecoilState(snackbarMessage);

  return useCallback(
    (path?: string) => {
      removeFromActiveSchema(path ? new Set([path]) : selected);
      activateFields.execute({ paths: path ? [path] : Array.from(selected) });
      setSelected(new Set());
      const size = path ? 1 : selected.size;
      setMessage(`${size} schema${size > 1 ? "s" : ""} deactivated`);
    },
    [activateFields, removeFromActiveSchema, selected, setSelected, setMessage]
  );
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

const Rows = () => {
  const fields = useAtomValue(activePaths);
  const selected = useAtomValue(selectedFields);
  const theme = useTheme();
  const deactivate = useDeactivate();

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
            {!!selected.size && (
              <>
                <span style={{ color: theme.background.level1 }}>&bull;</span>
                <Typography color="secondary" padding="1rem 0">
                  {selected.size} selected
                </Typography>
              </>
            )}
          </ItemLeft>
          <ItemRight>
            {!!selected.size && (
              <RoundButtonWhite onClick={() => deactivate()}>
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
            onDelete={() => deactivate(path)}
          />
        ))}
      </Container>
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
  const [selected, setSelected] = useAtom(selectedFields);
  const deactivate = useDeactivate();
  return (
    <>
      <Rows />
      <FallbackItem />
      {!!selected.size && (
        <Footer
          primaryButton={{
            onClick: deactivate,
            text: "Deactivate fields",
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

export default ActiveSchema;
