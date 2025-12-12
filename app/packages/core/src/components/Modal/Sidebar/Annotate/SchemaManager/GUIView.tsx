import { useOperatorExecutor } from "@fiftyone/operators";
import { useNotification } from "@fiftyone/state";
import { ExpandLess, ExpandMore, KeyboardArrowUp } from "@mui/icons-material";
import { Button, Chip, Collapse, Typography } from "@mui/material";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import React, { useCallback, useState } from "react";
import {
  activePaths,
  addToActiveSchemas,
  inactivePaths,
  removeFromActiveSchemas,
  schema,
} from "../state";
import { Container, Item } from "./Components";
import FieldRow from "./FieldRow";
import { CollapsibleHeader, FooterContainer, GUISectionHeader } from "./styled";

// Selection state for active fields
export const selectedActiveFields = atom(new Set<string>());
export const isActiveFieldSelected = atomFamily((path: string) =>
  atom(
    (get) => get(selectedActiveFields).has(path),
    (get, set, toggle: boolean) => {
      const selected = new Set(get(selectedActiveFields));
      toggle ? selected.add(path) : selected.delete(path);
      set(selectedActiveFields, selected);
    }
  )
);

// Selection state for hidden fields
export const selectedHiddenFields = atom(new Set<string>());
export const isHiddenFieldSelected = atomFamily((path: string) =>
  atom(
    (get) => get(selectedHiddenFields).has(path),
    (get, set, toggle: boolean) => {
      const selected = new Set(get(selectedHiddenFields));
      toggle ? selected.add(path) : selected.delete(path);
      set(selectedHiddenFields, selected);
    }
  )
);

// Check if a field has schema configured
export const fieldHasSchema = atomFamily((path: string) =>
  atom((get) => !!get(schema(path))?.config)
);

const useActivateFields = () => {
  const addToActiveSchema = useSetAtom(addToActiveSchemas);
  const [selected, setSelected] = useAtom(selectedHiddenFields);
  const activateFields = useOperatorExecutor("activate_annotation_schemas");
  const setMessage = useNotification();

  return useCallback(() => {
    addToActiveSchema(selected);
    activateFields.execute({ paths: Array.from(selected) });
    setSelected(new Set());
    setMessage({
      msg: `${selected.size} schema${
        selected.size > 1 ? "s" : ""
      } moved to active fields`,
      variant: "success",
    });
  }, [activateFields, addToActiveSchema, selected, setSelected, setMessage]);
};

const useDeactivateFields = () => {
  const removeFromActiveSchema = useSetAtom(removeFromActiveSchemas);
  const [selected, setSelected] = useAtom(selectedActiveFields);
  const deactivateFields = useOperatorExecutor("deactivate_annotation_schemas");
  const setMessage = useNotification();

  return useCallback(() => {
    removeFromActiveSchema(selected);
    deactivateFields.execute({ paths: Array.from(selected) });
    setSelected(new Set());
    setMessage({
      msg: `${selected.size} schema${
        selected.size > 1 ? "s" : ""
      } moved to hidden fields`,
      variant: "success",
    });
  }, [
    deactivateFields,
    removeFromActiveSchema,
    selected,
    setSelected,
    setMessage,
  ]);
};

const ActiveFieldsSection = () => {
  const fields = useAtomValue(activePaths);

  if (!fields.length) {
    return (
      <>
        <GUISectionHeader>
          <Typography variant="body1" fontWeight={500}>
            Active fields
          </Typography>
          <Chip label="0" size="small" />
        </GUISectionHeader>
        <Item style={{ justifyContent: "center", opacity: 0.7 }}>
          <Typography color="secondary">No active fields</Typography>
        </Item>
      </>
    );
  }

  return (
    <>
      <GUISectionHeader>
        <Typography variant="body1" fontWeight={500}>
          Active fields
        </Typography>
        <Chip label={fields.length} size="small" />
      </GUISectionHeader>
      {fields.map((path) => (
        <FieldRow
          key={path}
          path={path}
          isSelected={isActiveFieldSelected(path)}
        />
      ))}
    </>
  );
};

const HiddenFieldRow = ({ path }: { path: string }) => {
  const hasSchema = useAtomValue(fieldHasSchema(path));

  return (
    <FieldRow
      key={path}
      path={path}
      isSelected={hasSchema ? isHiddenFieldSelected(path) : undefined}
    />
  );
};

const HiddenFieldsSection = () => {
  const fields = useAtomValue(inactivePaths);
  const [expanded, setExpanded] = useState(true);

  if (!fields.length) {
    return null;
  }

  return (
    <>
      <CollapsibleHeader onClick={() => setExpanded(!expanded)}>
        <Typography variant="body1" fontWeight={500}>
          Hidden fields
        </Typography>
        <Chip label={fields.length} size="small" />
        {expanded ? <ExpandLess /> : <ExpandMore />}
      </CollapsibleHeader>
      <Collapse in={expanded}>
        {fields.map((path) => (
          <HiddenFieldRow key={path} path={path} />
        ))}
      </Collapse>
    </>
  );
};

const SelectionFooter = () => {
  const activeSelected = useAtomValue(selectedActiveFields);
  const hiddenSelected = useAtomValue(selectedHiddenFields);
  const activateFields = useActivateFields();
  const deactivateFields = useDeactivateFields();

  const activeCount = activeSelected.size;
  const hiddenCount = hiddenSelected.size;
  const totalSelected = activeCount + hiddenCount;

  if (totalSelected === 0) {
    return null;
  }

  return (
    <FooterContainer>
      <KeyboardArrowUp fontSize="small" />
      {hiddenCount > 0 && (
        <Button
          variant="outlined"
          size="small"
          onClick={activateFields}
          sx={{
            color: "text.primary",
            borderColor: "text.primary",
            textTransform: "none",
          }}
        >
          Move {hiddenCount} to visible fields
        </Button>
      )}
      {activeCount > 0 && (
        <Button
          variant="outlined"
          size="small"
          onClick={deactivateFields}
          sx={{
            color: "text.primary",
            borderColor: "text.primary",
            textTransform: "none",
          }}
        >
          Move {activeCount} to hidden fields
        </Button>
      )}
    </FooterContainer>
  );
};

const GUIView = () => {
  return (
    <>
      <Container style={{ marginBottom: 60 }}>
        <ActiveFieldsSection />
        <HiddenFieldsSection />
      </Container>
      <SelectionFooter />
    </>
  );
};

export default GUIView;
