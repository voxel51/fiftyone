import { useTheme } from "@fiftyone/components";
import { useOperatorExecutor } from "@fiftyone/operators";
import { useNotification } from "@fiftyone/state";
import { Typography } from "@mui/material";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import { useCallback } from "react";
import { RoundButtonWhite } from "../Actions";
import { ItemLeft, ItemRight } from "../Components";
import { activePaths, removeFromActiveSchemas } from "../state";
import { Container } from "./Components";
import FieldRow from "./FieldRow";
import { Header } from "./Modal";
import NoActiveSchema from "./NoActiveSchema";

const useDeactivate = () => {
  const removeFromActiveSchema = useSetAtom(removeFromActiveSchemas);
  const [selected, setSelected] = useAtom(selectedFields);
  const activateFields = useOperatorExecutor("deactivate_label_schemas");
  const setMessage = useNotification();

  return useCallback(
    (path?: string) => {
      removeFromActiveSchema(path ? new Set([path]) : selected);
      activateFields.execute({ fields: path ? [path] : Array.from(selected) });
      setSelected(new Set());
      const size = path ? 1 : selected.size;
      setMessage({
        msg: `${size} schema${size > 1 ? "s" : ""} deactivated`,
        variant: "success",
      });
    },
    [activateFields, removeFromActiveSchema, selected, setSelected, setMessage]
  );
};

export const selectedFields = atom(new Set<string>());

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
            onDelete={{
              callback: () => deactivate(path),
              tooltip: "Deactivate annotation schema",
            }}
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
  return (
    <>
      <Rows />
      <FallbackItem />
    </>
  );
};

export default ActiveSchema;
